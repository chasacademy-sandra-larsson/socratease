import { timingSafeEqual } from "node:crypto";

/**
 * Whether a request comes from the Vercel cron schedule: it sends CRON_SECRET as a bearer token.
 * Compared in constant time, so the secret can't be learned from timing.
 */
export function authorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (!secret || !header) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
