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

  // A run reads a bounded number of pages; keep going until everything is in sync.
  const models = await getModels();
  const notion = createNotionReader(process.env.NOTION_TOKEN);
  for (;;) {
    const report = await syncCohort({ db, models, notion }, cohort.id);
    console.log(
      `${report.status}: ${report.pagesSynced} pages synced, ${report.pagesRemaining} left, ${report.sourcesRemoved} Sources removed`,
    );
    for (const failure of report.failures) console.log(`  Failed: ${failure}`);
    if (report.status !== "continues") {
      if (report.skipped.length > 0) console.log(`\nSkipped (${report.skipped.length}):\n  ${report.skipped.join("\n  ")}`);
      if (report.notFilledIn.length > 0) {
        console.log(`\nNot filled in (${report.notFilledIn.length}):\n  ${report.notFilledIn.join("\n  ")}`);
      }
      if (report.status !== "completed") process.exitCode = 1;
      break;
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
