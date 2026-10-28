// Usage: pnpm seed:test-course <cohort-name>
// Indexes the fictional test Course into a Cohort, using the AI provider in AI_PROVIDER.
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { testCourse } from "../fixtures/test-course";
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
  const [cohort] = await db
    .insert(cohorts)
    .values({ name: cohortName })
    .onConflictDoUpdate({ target: cohorts.name, set: { name: cohortName } })
    .returning({ id: cohorts.id });
  for (const source of testCourse) await indexSource(db, models, cohort.id, source);
  console.log(`Indexed ${testCourse.length} test Sources into ${cohortName}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
