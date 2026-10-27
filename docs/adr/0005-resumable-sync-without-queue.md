# Notion sync is a resumable scheduled job, not a job queue

The original plan included a job queue for syncing from Notion. We dropped it for v1. Sync runs on a schedule (about every 15 minutes, plus a manual "sync now" for teachers). Each run processes a bounded number of pages, saves its position and continues on the next run. A Postgres lock prevents overlapping runs, and Notion rate-limit responses are retried within the run. A sync log records what was synced and what failed.

A queue would mainly help with the first full sync. Because the Notion API returns nested content (toggles, callouts) one level per request at roughly 3 requests per second, that sync can come close to the function time limit. Resumable runs solve this without another moving part to operate. Revisit when v2 adds external sources (slides, repos) and sync becomes heavy.
