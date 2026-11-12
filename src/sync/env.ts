import { getModels } from "@/ai/models";
import { db } from "@/db/client";
import { createNotionReader } from "./notion";

/**
 * Runs keep starting until this much time has passed. The last run may go on for a minute past
 * it, so routes that sync declare maxDuration = 300 (ADR 0005).
 */
export const SYNC_TIME_BUDGET_MS = 200_000;

/**
 * What a sync needs from this deployment, or null if it isn't set up for it. Real Course
 * material may only go to the provider that meets ADR 0006 (ADR 0008).
 */
export async function syncDepsFromEnv() {
  if (process.env.AI_PROVIDER !== "vertex" || !process.env.NOTION_TOKEN) return null;
  return { db, models: await getModels(), notion: createNotionReader(process.env.NOTION_TOKEN) };
}
