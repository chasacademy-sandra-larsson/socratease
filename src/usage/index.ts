import { and, eq, gt, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { dailyUsage } from "@/db/schema";
import { formatSwedishDate, type IsoDate } from "@/unlocking";

/** Messages a Student may send per day, unless DAILY_MESSAGE_LIMIT says otherwise. */
export const DEFAULT_DAILY_LIMIT = 50;

export function dailyLimit(): number {
  const configured = Number(process.env.DAILY_MESSAGE_LIMIT);
  return Number.isInteger(configured) && configured > 0 ? configured : DEFAULT_DAILY_LIMIT;
}

/**
 * Counts one message for the Student on `day` and says whether it is within the limit. A new day
 * overwrites the count, so only today's is ever kept (ADR 0003).
 */
export async function countMessage(
  db: NodePgDatabase,
  studentKey: string,
  day: IsoDate,
  limit: number,
): Promise<{ allowed: boolean; count: number }> {
  const [row] = await db
    .insert(dailyUsage)
    .values({ studentKey, day, count: 1 })
    .onConflictDoUpdate({
      target: dailyUsage.studentKey,
      set: {
        count: sql`case when ${dailyUsage.day} = ${day} then ${dailyUsage.count} + 1 else 1 end`,
        day,
      },
    })
    .returning({ count: dailyUsage.count });
  return { allowed: row.count <= limit, count: row.count };
}

/** Gives back a message that got no answer, e.g. when the AI provider failed. */
export async function refundMessage(db: NodePgDatabase, studentKey: string, day: IsoDate) {
  await db
    .update(dailyUsage)
    .set({ count: sql`${dailyUsage.count} - 1` })
    .where(and(eq(dailyUsage.studentKey, studentKey), eq(dailyUsage.day, day), gt(dailyUsage.count, 0)));
}

/** What the Student is told instead of an answer once the limit is reached. */
export function limitReachedMessage(limit: number, nextSession: IsoDate | null): string {
  const session = nextSession ? `nästa pass den ${formatSwedishDate(nextSession)}` : "nästa pass";
  return `Du har ställt ${limit} frågor i dag, vilket är dagens gräns. Ta med din fråga till ${session}, eller fortsätt i morgon.`;
}
