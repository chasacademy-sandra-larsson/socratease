import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createFakeModels } from "../src/ai/fake";
import { answer } from "../src/answering";
import { createPool } from "../src/db/pool";
import { cohorts } from "../src/db/schema";
import { indexSource } from "../src/material";
import { TEST_COURSE_TODAY, testCourse } from "../fixtures/test-course";

// Tests through the Answering seam, with the fake AI provider and the test Course in Postgres.
const pool = createPool();
const db = drizzle(pool);
const models = createFakeModels();

async function createCohort(name: string, fixedToday: string | null = null) {
  const [cohort] = await db.insert(cohorts).values({ name, fixedToday }).returning({ id: cohorts.id });
  return cohort.id;
}

let cohortId: string;
beforeEach(async () => {
  await db.execute(sql`truncate cohorts cascade`);
  cohortId = await createCohort("FJS-TEST");
  for (const source of testCourse) await indexSource(db, models, cohortId, source);
});
afterAll(() => pool.end());

describe("answer", () => {
  it("answers a conceptual question with a Direct Explanation citing the Unlocked Source that covers it", async () => {
    const result = await answer(
      { db, models },
      { question: "Vad är skillnaden mellan let och const?", conversation: [], cohortId, today: TEST_COURSE_TODAY },
    );

    expect(result.kind).toBe("direct");
    expect(result.sources[0]).toMatchObject({
      title: "Variabler: let och const",
      url: expect.stringMatching(/^https:\/\//),
    });
    expect(await result.result.text).toContain("[1] Variabler: let och const");
    // Only Unlocked material is cited; the fetch Session and the TypeScript Course are Upcoming.
    expect(result.sources.map((s) => s.title)).not.toContain("Föreläsning: fetch och API:er");
    expect(result.sources.map((s) => s.title)).not.toContain("TypeScript: typer och interface");
  });

  it("never uses material from another Cohort", async () => {
    const otherCohortId = await createCohort("FJS-OTHER");
    await indexSource(db, models, otherCohortId, {
      externalId: "secret",
      kind: "study-material",
      courseName: "Annan kurs",
      courseStartsOn: "2026-08-24",
      title: "Hemligt material om let och const",
      url: "https://example.org/other#secret",
      text: "Det här handlar också om let och const, men tillhör en annan klass.",
    });

    const result = await answer(
      { db, models },
      { question: "Vad är skillnaden mellan let och const?", conversation: [], cohortId, today: TEST_COURSE_TODAY },
    );

    expect(result.sources.map((s) => s.title)).not.toContain("Hemligt material om let och const");
  });

  it("cites a long Source once, even when it is split into several Chunks", async () => {
    await indexSource(db, models, cohortId, {
      externalId: "long",
      kind: "study-material",
      courseName: "Testkurs",
      courseStartsOn: "2026-08-24",
      title: "Lång genomgång av promises",
      url: "https://example.org/testkurs#long",
      // About 4,000 characters, well over the Chunk size, so it becomes several Chunks.
      text: Array.from({ length: 30 }, (_, i) =>
        `Stycke ${i + 1}: ett promise representerar ett värde som kommer senare, och await väntar på det. ` +
          "Det gör asynkron kod lättare att läsa.",
      ).join("\n\n"),
    });

    const result = await answer(
      { db, models },
      { question: "Hur fungerar ett promise och await?", conversation: [], cohortId, today: TEST_COURSE_TODAY },
    );

    const titles = result.sources.map((s) => s.title);
    expect(titles.filter((t) => t === "Lång genomgång av promises")).toHaveLength(1);
  });

  it("says when Upcoming material comes, without citing or revealing it", async () => {
    const result = await answer(
      { db, models },
      { question: "Hur kontrollerar jag response.ok efter fetch?", conversation: [], cohortId, today: TEST_COURSE_TODAY },
    );

    expect(result.kind).toBe("upcoming");
    expect(result.upcoming).toEqual([
      { title: "Föreläsning: fetch och API:er", kind: "session", unlocksOn: "2026-12-08" },
    ]);
    expect(result.sources.map((s) => s.title)).not.toContain("Föreläsning: fetch och API:er");
  });

  it("answers from the same material once it is Unlocked", async () => {
    const result = await answer(
      { db, models },
      { question: "Hur kontrollerar jag response.ok efter fetch?", conversation: [], cohortId, today: "2026-12-08" },
    );

    expect(result.kind).toBe("direct");
    expect(result.sources[0].title).toBe("Föreläsning: fetch och API:er");
  });

  it("unlocks from a Cohort's fixed today, not the real date", async () => {
    const demoCohortId = await createCohort("FJS-DEMO", TEST_COURSE_TODAY);
    for (const source of testCourse) await indexSource(db, models, demoCohortId, source);

    const result = await answer(
      { db, models },
      { question: "Hur kontrollerar jag response.ok efter fetch?", conversation: [], cohortId: demoCohortId, today: "2027-06-01" },
    );

    expect(result.kind).toBe("upcoming");
  });
});
