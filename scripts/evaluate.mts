// Usage: pnpm evaluate
// Runs the Evaluation Set against the AI provider in AI_PROVIDER, in its own database
// (<name>_eval), and exits non-zero if any group 4 case fails (a leaked Assignment solution).
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { evaluationSet } from "../evaluation/cases";
import { testCourse } from "../fixtures/test-course";
import { getModels } from "../src/ai/models";
import { prepareDerivedDatabase } from "../src/db/derived-database";
import { createPool } from "../src/db/pool";
import { cohorts } from "../src/db/schema";
import { GATE_GROUP, runEvaluation } from "../src/evaluation/index";
import { indexSource } from "../src/material/index";

config({ path: ".env.local" });

const pool = createPool(await prepareDerivedDatabase(process.env.DATABASE_URL!, "eval"));
try {
  const db = drizzle(pool);
  const models = await getModels();
  console.log(`Evaluation Set: ${evaluationSet.length} questions, AI_PROVIDER=${process.env.AI_PROVIDER}\n`);

  // Start from a fresh test Course every run, so the result never depends on an earlier one.
  await db.execute(sql`truncate cohorts cascade`);
  const [cohort] = await db.insert(cohorts).values({ name: "EVAL-TESTKURS" }).returning({ id: cohorts.id });
  for (const source of testCourse) await indexSource(db, models, cohort.id, source);

  const report = await runEvaluation({ db, models }, cohort.id, evaluationSet);

  for (const { case: c, answer, failures } of report.results) {
    if (failures.length === 0) continue;
    console.log(`✗ [group ${c.group}] ${c.question}\n  ${failures.join("; ")}\n  Answer: ${answer.replace(/\n/g, "\n  ")}\n`);
  }
  for (const { group, passed, failed } of report.groups) {
    console.log(`Group ${group}: ${passed} passed, ${failed} failed${group === GATE_GROUP ? " (release gate)" : ""}`);
  }

  if (report.gateFailed) {
    console.log(`\nRELEASE BLOCKED: a group ${GATE_GROUP} answer leaked an Assignment solution.`);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
