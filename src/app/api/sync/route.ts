import { timingSafeEqual } from "node:crypto";
import { isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { cohorts } from "@/db/schema";
import { syncForAWhile } from "@/sync";
import { SYNC_TIME_BUDGET_MS, syncDepsFromEnv } from "@/sync/env";

// A run reads a bounded number of pages (ADR 0005), so it finishes well within this.
export const maxDuration = 300;

/**
 * Syncs every Cohort that has a Notion root page. Called by the Vercel cron schedule, which
 * sends CRON_SECRET as a bearer token; nobody else can start a sync this way.
 */
export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return new Response("Unauthorized", { status: 401 });
  }
  const deps = await syncDepsFromEnv();
  if (!deps) return new Response("Sync needs AI_PROVIDER=vertex and NOTION_TOKEN", { status: 503 });
  const synced = await db
    .select({ id: cohorts.id, name: cohorts.name })
    .from(cohorts)
    .where(isNotNull(cohorts.notionRootPageId));
  const started = Date.now();
  const reports = [];
  for (const cohort of synced) {
    // A Cohort left out now is synced on the next call.
    const left = SYNC_TIME_BUDGET_MS - (Date.now() - started);
    if (left <= 0) break;
    for (const { status, pagesSynced, pagesRemaining, sourcesRemoved, failures } of await syncForAWhile(deps, cohort.id, {
      budgetMs: left,
    })) {
      reports.push({ cohort: cohort.name, status, pagesSynced, pagesRemaining, sourcesRemoved, failures });
    }
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
