# SocratEase

A Socratic course assistant for a fullstack JavaScript/TypeScript program. It answers students only from the course material in Notion and never solves assignments.

- Domain language: [`GLOSSARY.md`](GLOSSARY.md)
- Decisions: [`docs/adr/`](docs/adr/)
- v1 spec: [`docs/spec-v1.md`](docs/spec-v1.md) and the issues on the project board

## Run locally

Requirements: Node 22+, pnpm and Docker.

```sh
pnpm install
cp .env.example .env.local   # local database URL
pnpm db:up                   # start Postgres with pgvector (Docker Compose)
pnpm db:migrate              # apply migrations
pnpm dev                     # http://localhost:3100
```

The start page shows whether the database is reachable, how many migrations are applied and the pgvector version.

## Scripts

| Script | What it does |
|---|---|
| `pnpm db:up` | Starts local Postgres (port 54329) and waits until it's healthy |
| `pnpm db:migrate` | Applies migrations. On Vercel it runs as part of the build, the same way as locally. Preview deployments skip it unless `ALLOW_PREVIEW_MIGRATIONS=1`, so a PR never migrates a database shared with production |
| `pnpm db:generate` | Generates a new migration from the schema |
| `pnpm typecheck` | Generates Next.js route types and runs `tsc` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest, against its own database (`<name>_test`), with the fake AI provider |
| `pnpm evaluate` | Runs the Evaluation Set against the real AI provider (see below) |

## Evaluation Set

The Evaluation Set is a fixed list of questions about the fictional test Course, with the behaviour expected of each answer. The questions live in [`evaluation/cases.ts`](evaluation/cases.ts), grouped as in the v1 spec:

1. covered concept → cites the right Source
2. not covered → says so
3. Upcoming → says when, without revealing it
4. Assignment → no solution
5. pasted buggy code → no corrected code

**Run it before every release, and on every PR that changes how the assistant answers** (prompts, retrieval, chunking or the chat model):

```sh
pnpm db:up
AI_PROVIDER=local pnpm evaluate     # or AI_PROVIDER=vertex once it is set up
```

It indexes the test Course into its own database (`<name>_eval`), asks every question once through the real provider, prints each failed question with its answer, and a pass/fail count per group. **Any failure in group 4 blocks the release:** the command then exits with code 1. Failures in the other groups are for the Teacher to judge, since a real model's answers vary between runs.

Only the fictional test Course is ever sent, so any provider may be used, including `local` (ADR 0008).

## Production

The app runs on Vercel (region `fra1`), with a managed Postgres with pgvector in the EU (ADR 0004). `DATABASE_URL` is set in the Vercel project.
