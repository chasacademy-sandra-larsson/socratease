# Production runs on Vercel with managed Postgres in the EU; Docker Compose is local-only

SocratEase runs on Vercel, with a managed Postgres (pgvector) hosted in the EU. Docker Compose exists only for local development: Postgres plus anything else the app needs on a developer machine. We chose this over a self-hosted Docker Compose deployment because it gives a public URL for the portfolio with no operations work. Keeping student questions and course material in the EU also makes it easier to get the employer's approval.
