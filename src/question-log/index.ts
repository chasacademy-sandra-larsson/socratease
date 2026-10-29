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

/** Removes fenced code, inline code, lines that look like code, and secrets. */
export function removeCode(text: string): string {
  const withoutBlocks = text
    .replaceAll("\u0000", "")
    .replace(/```[\s\S]*?(```|$)/g, CODE_PLACEHOLDER)
    .replace(/`[^`\n]+`/g, CODE_PLACEHOLDER);
  const lines = withoutBlocks
    .split("\n")
    .map((line) => (looksLikeCode(line) ? CODE_PLACEHOLDER : removeSecrets(line)));
  // Collapse runs of removed lines into one placeholder.
  return lines
    .filter((line, i) => !(line === CODE_PLACEHOLDER && lines[i - 1] === CODE_PLACEHOLDER))
    .join("\n")
    .trim();
}

/**
 * Code, not prose about code: statements, declarations, calls chained on calls, markup with
 * attributes or closing tags, and config lines (KEY=value, Header: value). A question that only
 * mentions "for-loopar" or "<div>" is kept.
 */
function looksLikeCode(line: string): boolean {
  return [
    /[;{}]\s*$/, // ends a statement or block
    /=>/, // arrow function
    /^\s*(const|let|var)\s+[\w${}[\],\s]+=/, // declaration
    /^\s*(function\b|import\s.+\sfrom\s|export\s+(default|const|function|class)\b)/,
    /^\s*(if|for|while|switch)\s*\(/, // control flow
    /^\s*return\s+[\w.$]+\(/, // return of a call
    /\w+\([^)]*\)\.\w+/, // chained calls
    /<\/[a-zA-Z][\w-]*>|<[a-zA-Z][\w-]*\s+[\w-]+=/, // closing tags, tags with attributes
    /^\s*[A-Z][A-Z0-9_]*\s*=\s*\S/, // KEY=value
    /^\s*[\w-]+:\s*(Bearer|Basic)\s/i, // auth header
  ].some((pattern) => pattern.test(line));
}

/** Long token-like strings (API keys, JWTs) are replaced even inside prose. */
function removeSecrets(line: string): string {
  return line.replace(/\b(?:sk|pk|ghp|xox[a-z])[-_][\w-]{8,}|\beyJ[\w-]+\.[\w.-]*|\b[A-Za-z0-9_-]{32,}\b/g, CODE_PLACEHOLDER);
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
