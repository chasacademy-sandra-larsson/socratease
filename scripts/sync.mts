// Usage: pnpm sync <cohort-name> [<notion-root-page-id>]
// Reads the Cohort's Course material from Notion and indexes it. Pass the root page id the first
// time; it is saved on the Cohort (created if needed), and Sync reads only under it (ADR 0007).
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { getModels } from "../src/ai/models";
import { createPool } from "../src/db/pool";
import { cohorts } from "../src/db/schema";
import { syncCohort } from "../src/sync/index";
import { createNotionReader } from "../src/sync/notion";

config({ path: ".env.local" });

const [cohortName, rootPageId] = process.argv.slice(2);
if (!cohortName) {
  console.error("Usage: pnpm sync <cohort-name> [<notion-root-page-id>]");
  process.exit(1);
}
// Real Course material may only go to the provider that meets ADR 0006 (ADR 0008).
if (process.env.AI_PROVIDER !== "vertex") {
  console.error('pnpm sync sends real Course material to the AI provider, so it needs AI_PROVIDER="vertex"');
  process.exit(1);
}
if (!process.env.NOTION_TOKEN) {
  console.error("NOTION_TOKEN is not set");
  process.exit(1);
}

const pool = createPool();
try {
  const db = drizzle(pool);
  if (rootPageId) {
    await db
      .insert(cohorts)
      .values({ name: cohortName, notionRootPageId: rootPageId })
      .onConflictDoUpdate({ target: cohorts.name, set: { notionRootPageId: rootPageId } });
  }
  const [cohort] = await db.select({ id: cohorts.id }).from(cohorts).where(eq(cohorts.name, cohortName));
  if (!cohort) throw new Error(`No Cohort named ${cohortName}; pass its Notion root page id to create it`);

  const started = Date.now();
  const report = await syncCohort(
    { db, models: await getModels(), notion: createNotionReader(process.env.NOTION_TOKEN) },
    cohort.id,
  );
  console.log(`Synced ${report.sources} Sources into ${cohortName} in ${Math.round((Date.now() - started) / 1000)} s`);
  if (report.skipped.length > 0) {
    console.log(`\nSkipped (${report.skipped.length}):\n  ${report.skipped.join("\n  ")}`);
  }
  if (report.notFilledIn.length > 0) {
    console.log(`\nNot filled in (${report.notFilledIn.length}):\n  ${report.notFilledIn.join("\n  ")}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
