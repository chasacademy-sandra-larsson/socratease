import { and, inArray, isNotNull, lt } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { cohorts, dailyUsage, questionLog, rosterEntries } from "@/db/schema";
import { addDays, type IsoDate } from "@/unlocking";

/** Personal data is kept this long after a Cohort ends (ADR 0003). */
export const RETENTION_DAYS = 30;

export type RetentionResult = {
  /** Cohorts past retention; their Question Log and Roster are gone after this run. */
  cohorts: string[];
  questionsDeleted: number;
  rosterDeleted: number;
  usageDeleted: number;
};

/**
 * Deletes the personal data that may no longer be kept: the Question Log and Roster of every
 * Cohort that ended more than RETENTION_DAYS ago, and daily usage counts from before today.
 * Course material is not personal data and stays. Run daily by a cron job.
 */
export async function applyRetention(db: NodePgDatabase, today: IsoDate): Promise<RetentionResult> {
  // Ended before this day means ended more than RETENTION_DAYS ago.
  const cutoff = addDays(today, -RETENTION_DAYS);
  const expired = await db
    .select({ id: cohorts.id, name: cohorts.name })
    .from(cohorts)
    .where(and(isNotNull(cohorts.endsOn), lt(cohorts.endsOn, cutoff)));
  const ids = expired.map((c) => c.id);

  // All or nothing, so a failed run leaves nothing half deleted and the next night starts clean.
  const [questions, roster, usage] = await db.transaction(async (tx) => [
    ids.length ? await tx.delete(questionLog).where(inArray(questionLog.cohortId, ids)).returning({ id: questionLog.id }) : [],
    ids.length
      ? await tx.delete(rosterEntries).where(inArray(rosterEntries.cohortId, ids)).returning({ email: rosterEntries.email })
      : [],
    // Only today's count is ever needed; an older row is history.
    await tx.delete(dailyUsage).where(lt(dailyUsage.day, today)).returning({ key: dailyUsage.studentKey }),
  ]);

  return {
    cohorts: expired.map((c) => c.name),
    questionsDeleted: questions.length,
    rosterDeleted: roster.length,
    usageDeleted: usage.length,
  };
}

/** The day a Cohort's personal data is deleted: the first run more than RETENTION_DAYS after it ends. */
export function retentionDay(endsOn: IsoDate): IsoDate {
  return addDays(endsOn, RETENTION_DAYS + 1);
}
