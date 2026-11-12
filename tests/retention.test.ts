import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createFakeModels } from "../src/ai/fake";
import { importRoster } from "../src/access";
import { createPool } from "../src/db/pool";
import { cohorts, dailyUsage, questionLog, rosterEntries, sources } from "../src/db/schema";
import { indexSource } from "../src/material";
import { logQuestion } from "../src/question-log";
import { applyRetention, retentionDay } from "../src/retention";
import { countMessage } from "../src/usage";
import { addDays } from "../src/unlocking";
import { testCourse } from "../fixtures/test-course";

// Tests the retention job against the database (ADR 0003): personal data goes 30 days after a Cohort ends.
const pool = createPool();
const db = drizzle(pool);
const TODAY = "2026-11-12";

beforeEach(async () => {
  await db.execute(sql`truncate cohorts cascade`);
  await db.execute(sql`truncate daily_usage`);
});
afterAll(() => pool.end());

/** A Cohort with a Roster, a logged question and its Course material. */
async function cohortEnding(name: string, endsOn: string | null) {
  await importRoster(db, name, `student.${name.toLowerCase()}@student.chasacademy.se`);
  const [cohort] = await db.update(cohorts).set({ endsOn }).where(eq(cohorts.name, name)).returning({ id: cohorts.id });
  await logQuestion(db, {
    cohortId: cohort.id,
    askedOn: "2026-09-01",
    question: "Vad är en closure?",
    kind: "uncovered",
    topic: null,
    sources: [],
    uncoveredPart: null,
  });
  await indexSource(db, createFakeModels(), cohort.id, testCourse[0]);
  return cohort.id;
}

async function countsFor(cohortId: string) {
  const count = async (table: typeof questionLog | typeof rosterEntries | typeof sources) =>
    (await db.select({ cohortId: table.cohortId }).from(table).where(eq(table.cohortId, cohortId))).length;
  return { questions: await count(questionLog), roster: await count(rosterEntries), sources: await count(sources) };
}

describe("applyRetention", () => {
  it("deletes the Question Log and Roster of a Cohort that ended more than 30 days ago", async () => {
    const ended = await cohortEnding("FJS24", "2026-10-12"); // 31 days before TODAY

    const result = await applyRetention(db, TODAY);

    expect(await countsFor(ended)).toEqual({ questions: 0, roster: 0, sources: 1 });
    expect(result).toMatchObject({ cohorts: ["FJS24"], questionsDeleted: 1, rosterDeleted: 1 });
  });

  it("keeps everything of a Cohort that ended 30 days ago or less, or has no end date", async () => {
    const recent = await cohortEnding("FJS25", "2026-10-14"); // 29 days before TODAY
    const edge = await cohortEnding("FJS25B", "2026-10-13"); // exactly 30 days
    const open = await cohortEnding("FJS26", null);

    await applyRetention(db, TODAY);

    for (const id of [recent, edge, open]) {
      expect(await countsFor(id)).toEqual({ questions: 1, roster: 1, sources: 1 });
    }
  });

  it("deletes daily usage counts from earlier days, keeping today's", async () => {
    await countMessage(db, "key-yesterday", "2026-11-11", 50);
    await countMessage(db, "key-today", TODAY, 50);

    const result = await applyRetention(db, TODAY);

    expect((await db.select({ key: dailyUsage.studentKey }).from(dailyUsage)).map((r) => r.key)).toEqual(["key-today"]);
    expect(result.usageDeleted).toBe(1);
  });

  it("deletes on exactly the day the Teacher view says, not the day before", async () => {
    const id = await cohortEnding("FJS26", "2028-06-17");
    const day = retentionDay("2028-06-17");

    await applyRetention(db, addDays(day, -1));
    expect((await countsFor(id)).questions).toBe(1);
    await applyRetention(db, day);
    expect((await countsFor(id)).questions).toBe(0);
    expect(day).toBe("2028-07-18");
  });
});
