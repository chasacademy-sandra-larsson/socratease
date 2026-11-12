"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { currentViewer } from "@/access/viewer";
import { db } from "@/db/client";
import { cohorts } from "@/db/schema";
import { syncForAWhile } from "@/sync";
import { SYNC_TIME_BUDGET_MS, syncDepsFromEnv } from "@/sync/env";

export type SyncNowResult = { ok: boolean; message: string } | null;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The Teacher's "sync now": syncs the Cohort from Notion at once, respecting the lock. */
export async function syncNow(_previous: SyncNowResult, formData: FormData): Promise<SyncNowResult> {
  if ((await currentViewer())?.role !== "teacher") return { ok: false, message: "Bara läraren kan synka." };
  const cohortId = String(formData.get("cohortId") ?? "");
  if (!UUID.test(cohortId)) return { ok: false, message: "Okänd klass." };
  const [cohort] = await db.select({ root: cohorts.notionRootPageId }).from(cohorts).where(eq(cohorts.id, cohortId));
  if (!cohort?.root) return { ok: false, message: "Klassen synkas inte från Notion." };

  const deps = await syncDepsFromEnv();
  if (!deps) return { ok: false, message: "Synken kräver AI_PROVIDER=vertex och NOTION_TOKEN i miljön. Inget synkades." };

  const reports = await syncForAWhile(deps, cohortId, { budgetMs: SYNC_TIME_BUDGET_MS });
  revalidatePath("/larare");
  const last = reports.at(-1)!;
  const synced = reports.reduce((sum, r) => sum + r.pagesSynced, 0);
  const removed = reports.reduce((sum, r) => sum + r.sourcesRemoved, 0);
  switch (last.status) {
    case "locked":
      return { ok: false, message: "En annan synk pågick redan, så den här hoppades över. Försök igen om en stund." };
    case "failed":
      return { ok: false, message: `Synken stötte på fel (se nedan). ${synced} sidor uppdaterades.` };
    case "continues":
      return { ok: true, message: `${synced} sidor uppdaterade, ${last.pagesRemaining} kvar. Tryck igen för att fortsätta.` };
    default:
      return { ok: true, message: `Klart: ${synced} sidor uppdaterade, ${removed} källor borttagna.` };
  }
}
