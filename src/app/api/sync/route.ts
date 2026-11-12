import { timingSafeEqual } from "node:crypto";
import { isNotNull } from "drizzle-orm";
import { getModels } from "@/ai/models";
import { db } from "@/db/client";
import { cohorts } from "@/db/schema";
import { syncCohort } from "@/sync";
import { createNotionReader } from "@/sync/notion";

// A run reads a bounded number of pages (ADR 0005), so it finishes well within this.
export const maxDuration = 300;
// Runs keep starting until this much time has passed, so the first full sync of a Cohort takes
// a few calls, not one call per 25 pages. The last run may go on for a minute past it.
const TIME_BUDGET_MS = 200_000;

/**
 * Syncs every Cohort that has a Notion root page. Called by the Vercel cron schedule, which
 * sends CRON_SECRET as a bearer token; nobody else can start a sync this way.
 */
export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  // Real Course material may only go to the provider that meets ADR 0006 (ADR 0008).
  if (process.env.AI_PROVIDER !== "vertex" || !process.env.NOTION_TOKEN) {
    return new Response("Sync needs AI_PROVIDER=vertex and NOTION_TOKEN", { status: 503 });
  }

  const deps = { db, models: await getModels(), notion: createNotionReader(process.env.NOTION_TOKEN) };
  const synced = await db
    .select({ id: cohorts.id, name: cohorts.name })
    .from(cohorts)
    .where(isNotNull(cohorts.notionRootPageId));
  const started = Date.now();
  const reports = [];
  for (const cohort of synced) {
    // A Cohort left out now is synced on the next call.
    if (Date.now() - started >= TIME_BUDGET_MS) break;
    let report;
    do {
      report = await syncCohort(deps, cohort.id);
      const { status, pagesSynced, pagesRemaining, sourcesRemoved, failures } = report;
      reports.push({ cohort: cohort.name, status, pagesSynced, pagesRemaining, sourcesRemoved, failures });
    } while (report.status === "continues" && Date.now() - started < TIME_BUDGET_MS);
  }
  return Response.json(reports);
}

/** Compares the bearer token in constant time, so its value can't be learned from timing. */
function authorized(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
