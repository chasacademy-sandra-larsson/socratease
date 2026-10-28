# A local development provider outside ADR 0006, for fictional material only

Until the production AI provider (ADR 0006) has quota, development runs with `AI_PROVIDER=local`:

- **Chat:** Claude Haiku 5.5 via the Anthropic API, with the developer's own key.
- **Embeddings:** `multilingual-e5-large` computed on the developer's machine with transformers.js (Swedish, 1024 dimensions). No data leaves the machine.

The Anthropic API has no EU processing option, so this route does **not** meet ADR 0006. That is acceptable because ADR 0006 protects Chas Academy's course material and Students' questions, and this route only ever sees the fictional test Course in `fixtures/` and the developer's own test questions.

Guardrails:

- The provider throws if it runs on Vercel (`VERCEL` is set), so it can't reach production or preview deployments.
- It must never be used with real Course material, such as a Notion sync of FJS26.

Every Chunk records its embedding model, so material indexed locally can't be mixed with production vectors. `AI_PROVIDER=fake` remains for tests and for development without any provider.
