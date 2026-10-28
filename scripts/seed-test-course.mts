// Usage: pnpm seed:test-course <cohort-name>
// Indexes the fictional test Course into a Cohort, using the AI provider in AI_PROVIDER.
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { TEST_COURSE_TODAY, testCourse } from "../fixtures/test-course";
import { getModels } from "../src/ai/models";
import { createPool } from "../src/db/pool";
import { cohorts } from "../src/db/schema";
import { indexSource } from "../src/material/index";

config({ path: ".env.local" });

const [cohortName] = process.argv.slice(2);
if (!cohortName) {
  console.error("Usage: pnpm seed:test-course <cohort-name>");
  process.exit(1);
}

const pool = createPool();
try {
  const db = drizzle(pool);
  const models = await getModels();
  // Only seed a new Cohort or an earlier test Cohort: never fix "today" on a real one.
  const [existing] = await db.select({ fixedToday: cohorts.fixedToday }).from(cohorts).where(eq(cohorts.name, cohortName));
  if (existing && existing.fixedToday !== TEST_COURSE_TODAY) {
    throw new Error(`${cohortName} is not a test Cohort; choose another name`);
  }
  const [cohort] = await db
    .insert(cohorts)
    // The test Course's dates are fixed, so the Cohort sees them from a fixed "today" (ADR 0001).
    .values({ name: cohortName, fixedToday: TEST_COURSE_TODAY })
    .onConflictDoUpdate({ target: cohorts.name, set: { fixedToday: TEST_COURSE_TODAY } })
    .returning({ id: cohorts.id });
  for (const source of testCourse) await indexSource(db, models, cohort.id, source);
  console.log(`Indexed ${testCourse.length} test Sources into ${cohortName}, seen from ${TEST_COURSE_TODAY}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
