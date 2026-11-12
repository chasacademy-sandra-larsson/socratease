# Notion sync is a resumable scheduled job, not a job queue

The original plan included a job queue for syncing from Notion. We dropped it for v1. Sync runs on a schedule (about every 15 minutes, plus a manual "sync now" for teachers). Each run processes a bounded number of pages, saves its position and continues on the next run. A Postgres lock prevents overlapping runs, and Notion rate-limit responses are retried within the run. A sync log records what was synced and what failed.

A queue would mainly help with the first full sync. Because the Notion API returns nested content (toggles, callouts) one level per request at roughly 3 requests per second, that sync can come close to the function time limit. Resumable runs solve this without another moving part to operate. Revisit when v2 adds external sources (slides, repos) and sync becomes heavy.

**Schedule: once a day, for now.** The project runs on Vercel's Hobby plan, which allows a cron job only once a day. Every 15 minutes would need the Pro plan. While SocratEase is a portfolio project without Students, a nightly run is enough: the Teacher plans material ahead, Upcoming material unlocks on its date without a sync, and a change can be pushed at once with `pnpm sync` or "sync now" (#15). Moving to every 15 minutes is a one-line change in `vercel.json`.

How the pieces landed:

- **Incremental:** each Notion page's version is stored: its `last_edited_time`, plus its Course's name and start, which its Sources also carry. A run lists the four databases, reads only the pages whose version changed, and removes the Sources of pages and sections that are gone. A database that can't be found removes nothing.
- **Resumable:** at most 25 pages per run, each saved as it is done. The stored versions are the cursor, so a run that stops part-way continues where it was. The cron route starts runs until about 200 seconds have passed.
- **Lock:** a lease on the Cohort row (`sync_locked_until`), not a session advisory lock. A session lock doesn't survive a transaction-mode connection pooler, and a lease is released by time if a run crashes.
