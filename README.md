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
| `pnpm test` | Vitest. The tests need the migrated local database |

## Production

The app runs on Vercel (region `fra1`), with a managed Postgres with pgvector in the EU (ADR 0004). `DATABASE_URL` is set in the Vercel project.
