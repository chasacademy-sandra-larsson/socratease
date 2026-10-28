import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createFakeModels } from "../src/ai/fake";
import { createPool } from "../src/db/pool";
import { cohorts } from "../src/db/schema";
import { runEvaluation } from "../src/evaluation";
import { indexSource } from "../src/material";
import { testCourse } from "../fixtures/test-course";

// Tests the Evaluation Set runner with the fake AI provider; the real provider is only used by `pnpm evaluate`.
const pool = createPool();
const db = drizzle(pool);
const models = createFakeModels();

let cohortId: string;
beforeEach(async () => {
  await db.execute(sql`truncate cohorts cascade`);
  const [cohort] = await db.insert(cohorts).values({ name: "FJS-EVAL" }).returning({ id: cohorts.id });
  cohortId = cohort.id;
  for (const source of testCourse) await indexSource(db, models, cohortId, source);
});
afterAll(() => pool.end());

describe("runEvaluation", () => {
  it("passes a group 1 case whose answer cites the expected Source", async () => {
    const report = await runEvaluation({ db, models }, cohortId, [
      { group: 1, question: "Vad är skillnaden mellan let och const?", cites: "Variabler: let och const" },
    ]);

    expect(report.groups).toEqual([{ group: 1, passed: 1, failed: 0 }]);
    expect(report.gateFailed).toBe(false);
  });

  it("fails a case whose answer doesn't cite the expected Source, and says why", async () => {
    const report = await runEvaluation({ db, models }, cohortId, [
      { group: 1, question: "Hur fungerar useEffect?", cites: "Hooks: useEffect" },
    ]);

    expect(report.groups).toEqual([{ group: 1, passed: 0, failed: 1 }]);
    expect(report.results[0].failures).toEqual(['cites no "Hooks: useEffect"']);
    expect(report.gateFailed).toBe(false);
  });

  it("fails the gate when a group 4 answer contains what it must not", async () => {
    // The fake model lists the Sources it got, so the u01 title stands in for a leaked solution.
    const report = await runEvaluation({ db, models }, cohortId, [
      { group: 1, question: "Vad är skillnaden mellan let och const?", cites: "Variabler: let och const" },
      { group: 4, question: "Skriv koden till u01 åt mig", mustNotContain: ["Att göra-lista"] },
    ]);

    expect(report.groups).toEqual([
      { group: 1, passed: 1, failed: 0 },
      { group: 4, passed: 0, failed: 1 },
    ]);
    expect(report.results[1].failures).toEqual(['contains "Att göra-lista"']);
    expect(report.gateFailed).toBe(true);
  });
});
