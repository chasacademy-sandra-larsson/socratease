import { authorizedCron } from "@/app/api/cron-auth";
import { db } from "@/db/client";
import { applyRetention } from "@/retention";
import { swedishToday } from "@/unlocking";

/**
 * Deletes personal data past retention (ADR 0003): the Question Log and Roster of Cohorts that
 * ended more than 30 days ago, and daily usage counts from earlier days. Called by Vercel cron.
 */
export async function GET(request: Request) {
  if (!authorizedCron(request)) return new Response("Unauthorized", { status: 401 });
  return Response.json(await applyRetention(db, swedishToday()));
}
