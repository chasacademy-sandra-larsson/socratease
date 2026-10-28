import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createFakeModels } from "../src/ai/fake";
import { answer } from "../src/answering";
import { createPool } from "../src/db/pool";
import { cohorts } from "../src/db/schema";
import { indexSource } from "../src/material";
import { testCourse } from "../fixtures/test-course";

// Tests through the Answering seam, with the fake AI provider and the test Course in Postgres.
const pool = createPool();
const db = drizzle(pool);
const models = createFakeModels();

async function createCohort(name: string) {
  const [cohort] = await db.insert(cohorts).values({ name }).returning({ id: cohorts.id });
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
  it("answers a conceptual question with a Direct Explanation citing the Source that covers it", async () => {
    const result = await answer(
      { db, models },
      { question: "Vad är skillnaden mellan let och const?", conversation: [], cohortId },
    );

    expect(result.kind).toBe("direct");
    expect(result.sources[0]).toMatchObject({
      title: "Variabler: let och const",
      url: expect.stringMatching(/^https:\/\//),
    });
    expect(await result.text).toContain("[1] Variabler: let och const");
  });

  it("never uses material from another Cohort", async () => {
    const otherCohortId = await createCohort("FJS-OTHER");
    await indexSource(db, models, otherCohortId, {
      externalId: "secret",
      kind: "study-material",
      courseName: "Annan kurs",
      title: "Hemligt material om let och const",
      url: "https://example.org/other#secret",
      text: "Det här handlar också om let och const, men tillhör en annan klass.",
    });

    const result = await answer(
      { db, models },
      { question: "Vad är skillnaden mellan let och const?", conversation: [], cohortId },
    );

    expect(result.sources.map((s) => s.title)).not.toContain("Hemligt material om let och const");
  });

  it("cites a long Source once, even when it is split into several Chunks", async () => {
    await indexSource(db, models, cohortId, {
      externalId: "long",
      kind: "study-material",
      courseName: "Testkurs",
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
      { question: "Hur fungerar ett promise och await?", conversation: [], cohortId },
    );

    const titles = result.sources.map((s) => s.title);
    expect(titles.filter((t) => t === "Lång genomgång av promises")).toHaveLength(1);
  });
});
