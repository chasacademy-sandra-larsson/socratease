---
status: accepted (employer approval received 2026-10-27)
---

# Requirements on the AI provider

Course material and student questions are sent to an external AI provider. Any provider used must:

1. not train on the data,
2. offer zero data retention,
3. process data within the EU where possible,
4. receive no personal data beyond what the student types.

The provider is accessed through a swappable layer, so the provider can change without touching the rest of the system.

On 2026-10-27 the employer approved:

- sending FJS26 course material to an external AI provider that meets these requirements,
- real FJS26 students using the assistant,
- a copy of the material being shown publicly as a portfolio demo.

## Decision (2026-10-28)

**Google Vertex AI**, on the Teacher's personal Google Cloud project (the same project as the Google login):

- **Chat:** Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`) on the `eu` multi-region endpoint, which is EU member states only. Gemini 3.5 Flash or 3.8 Flash is the upgrade if the Evaluation Set shows Flash-Lite isn't good enough. Never use `global`, and avoid models that are only served there (e.g. preview models).
- **Embeddings:** `gemini-embedding-001` in `europe-west3` (Frankfurt), at 1024 dimensions. Swedish is supported. Vectors are L2-normalized in code and stored as `vector(1024)`, so a later model swap only needs a re-embed.
- **Retention:** context caching (including implicit caching) disabled for the project. Request-response logging and Data Access audit logs stay off, which is the default. No Search or Maps grounding, Interactions API, express-mode API keys or other features that store data.
- **Auth from Vercel:** OIDC with Workload Identity Federation, to a service account with `roles/aiplatform.user` only. No long-lived keys.
- Accessed through `@ai-sdk/google-vertex`.

**Why Gemini and not Claude on Vertex:** Claude is a partner model with a quota of zero on new projects. Google support declined to raise it for a personal project and referred us to sales. Gemini is Google's own model, billed pay-as-you-go with no quota request, and is covered directly by the Cloud Data Processing Addendum. It costs more per token than Claude Haiku, but only around $0.004 per question. Evidence: `docs/research/gemini-vertex-adr-0006.md`.

**Accepted exception to requirement 2:** Vertex's abuse monitoring for Gemini logs prompts that Google's classifiers flag. Flagged prompts are kept for up to 90 days in the project's region (the EU), may be reviewed by authorized Google staff, and are never used for training. A personal project can't opt out; the only exemption is a negotiated agreement. We accept this **for the portfolio phase only**, because the questions come from the Teacher testing the tool, not from Students.

**Why not Bedrock**, the first choice of the research: on paper it met all four requirements self-serve. In practice the new AWS account was blocked several times over: account verification, a daily token quota of zero, "access not allowed" errors, and a service control policy in the AWS-managed projects organization denying Bedrock. A support case is open; Bedrock can be reconsidered if it is resolved. Anthropic's own API has no EU option, and OpenAI, Azure and Mistral need a sales process for zero data retention. The evidence is in `docs/research/ai-provider-adr-0006.md` and `docs/research/vertex-ai-adr-0006.md`.

## Scope: portfolio first

SocratEase is run as a portfolio project. The Teacher tests it with "view as Student" (#20), and no real Students are let in for now. Google Cloud, Vercel and Neon therefore live on personal accounts. **Before any real Cohort is let in,** three conditions must hold:

- data processing agreements must be in the name of the controller (Chas Academy), or Chas must explicitly accept the personal accounts;
- the Question Log (#7) and retention (#16) must be in place;
- the abuse-logging exception to requirement 2 must be resolved, either through an agreement that exempts the project or by moving to a route with true zero data retention.
