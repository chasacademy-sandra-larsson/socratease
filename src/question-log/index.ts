import { desc, eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { questionLog } from "@/db/schema";
import type { IsoDate } from "@/unlocking";

export type QuestionLogEntry = {
  question: string;
  kind: (typeof questionLog.$inferSelect)["kind"];
  topic: string | null;
  sources: string[];
  uncoveredPart: string | null;
  week: string;
};

/**
 * Writes one anonymous entry (ADR 0003). The caller passes no identity, and the table has
 * no column for one; pasted code is removed so names, paths and secrets aren't stored.
 */
export async function logQuestion(
  db: NodePgDatabase,
  entry: Omit<QuestionLogEntry, "week"> & { cohortId: string; askedOn: IsoDate },
) {
  await db.insert(questionLog).values({
    cohortId: entry.cohortId,
    question: removeCode(entry.question),
    kind: entry.kind,
    topic: entry.topic,
    sources: entry.sources,
    uncoveredPart: entry.uncoveredPart && removeCode(entry.uncoveredPart),
    week: isoWeek(entry.askedOn),
  });
}

/** A Cohort's Question Log, newest first. */
export async function listQuestionLog(db: NodePgDatabase, cohortId: string): Promise<QuestionLogEntry[]> {
  return db
    .select({
      question: questionLog.question,
      kind: questionLog.kind,
      topic: questionLog.topic,
      sources: questionLog.sources,
      uncoveredPart: questionLog.uncoveredPart,
      week: questionLog.week,
    })
    .from(questionLog)
    .where(eq(questionLog.cohortId, cohortId))
    .orderBy(desc(questionLog.askedAt));
}

const CODE_PLACEHOLDER = "[kod borttagen]";

/** Removes fenced code, inline code and lines that look like code. */
export function removeCode(text: string): string {
  const withoutBlocks = text.replace(/```[\s\S]*?(```|$)/g, CODE_PLACEHOLDER).replace(/`[^`\n]+`/g, CODE_PLACEHOLDER);
  const lines = withoutBlocks.split("\n").map((line) => (looksLikeCode(line) ? CODE_PLACEHOLDER : line));
  // Collapse runs of removed lines into one placeholder.
  return lines
    .filter((line, i) => !(line === CODE_PLACEHOLDER && lines[i - 1] === CODE_PLACEHOLDER))
    .join("\n")
    .trim();
}

function looksLikeCode(line: string): boolean {
  return (
    /[;{}]\s*$|=>|^\s*(const|let|var|function|import|export|return|if|for|while|class)\b|<\/?[a-zA-Z][^>]*>/.test(line) ||
    /\w+\([^)]*\)\.\w+/.test(line)
  );
}

/** The ISO week of a date, e.g. "2026-W44". */
export function isoWeek(date: IsoDate): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // Thursday decides the week's year.
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
