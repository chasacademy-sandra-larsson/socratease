import { and, eq, inArray, min, ne } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { sources } from "@/db/schema";
import { lastDayOfWeek, listQuestionLog } from "@/question-log";
import type { IsoDate } from "@/unlocking";

/** Unanswered Questions from one week, under the Course that was running then (if any). */
export type UnansweredGroup = { week: string; course: string | null; questions: string[] };

/** How many questions landed in a Topic in one week. */
export type TopicCount = { week: string; topic: string; count: number };

/** A Source and how many answers used it; its link is null if it is no longer in the material. */
export type SourceCount = { title: string; url: string | null; count: number };

export type QuestionInsights = { unanswered: UnansweredGroup[]; topics: TopicCount[]; sources: SourceCount[] };

const TOP_SOURCES = 10;

/**
 * What the Teacher view shows about a Cohort's questions, built from the anonymous Question Log
 * (ADR 0003). It reads no identifier, because the log has none.
 */
export async function questionInsights(db: NodePgDatabase, cohortId: string): Promise<QuestionInsights> {
  const [entries, courses] = await Promise.all([listQuestionLog(db, cohortId), courseStarts(db, cohortId)]);

  // An Unanswered Question is the part no material covers: a whole uncovered question, or the
  // uncovered part of a partly covered one.
  const unanswered = new Map<string, UnansweredGroup>();
  for (const entry of entries) {
    const text = entry.kind === "uncovered" ? entry.question : entry.uncoveredPart;
    if (!text) continue;
    // The log keeps the week, not the day, so the Course is the one running at the week's end.
    const course = runningCourse(courses, lastDayOfWeek(entry.week));
    const key = `${entry.week}|${course}`;
    const group = unanswered.get(key) ?? { week: entry.week, course, questions: [] };
    group.questions.push(text);
    unanswered.set(key, group);
  }

  const topics = new Map<string, TopicCount>();
  for (const { week, topic } of entries) {
    if (!topic) continue;
    const count = topics.get(`${week}|${topic}`) ?? { week, topic, count: 0 };
    count.count++;
    topics.set(`${week}|${topic}`, count);
  }

  const used = new Map<string, number>();
  for (const title of entries.flatMap((e) => e.sources)) used.set(title, (used.get(title) ?? 0) + 1);
  const top = [...used].sort(([, a], [, b]) => b - a).slice(0, TOP_SOURCES);

  return {
    unanswered: [...unanswered.values()].sort((a, b) => b.week.localeCompare(a.week)),
    topics: [...topics.values()].sort((a, b) => b.week.localeCompare(a.week) || b.count - a.count),
    sources: await withLinks(db, cohortId, top),
  };
}

/** The log keeps Source titles; their links come from the material as it is now. */
async function withLinks(db: NodePgDatabase, cohortId: string, counts: [string, number][]): Promise<SourceCount[]> {
  if (counts.length === 0) return [];
  const rows = await db
    .select({ title: sources.title, url: sources.url })
    .from(sources)
    .where(and(eq(sources.cohortId, cohortId), inArray(sources.title, counts.map(([title]) => title))));
  const urls = new Map(rows.map((r) => [r.title, r.url]));
  return counts.map(([title, count]) => ({ title, url: urls.get(title) ?? null, count }));
}

/** When each Course starts: the day its Study Material, Assignments and Course Goals unlock. */
async function courseStarts(db: NodePgDatabase, cohortId: string) {
  return db
    .select({ name: sources.courseName, startsOn: min(sources.unlocksOn) })
    .from(sources)
    .where(and(eq(sources.cohortId, cohortId), ne(sources.kind, "session")))
    .groupBy(sources.courseName);
}

/** The Course started most recently on or before the day. */
function runningCourse(courses: { name: string; startsOn: IsoDate | null }[], day: IsoDate): string | null {
  let running: { name: string; startsOn: IsoDate } | null = null;
  for (const { name, startsOn } of courses) {
    if (startsOn && startsOn <= day && (!running || startsOn > running.startsOn)) running = { name, startsOn };
  }
  return running?.name ?? null;
}
