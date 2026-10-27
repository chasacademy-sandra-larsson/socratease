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

## Decision (2026-10-27)

**Amazon Bedrock, called from `eu-central-1` (Frankfurt)**, on the Teacher's personal AWS account:

- **Chat:** Claude Haiku 5.5 through the EU geographic inference profile `eu.anthropic.claude-haiku-5-5`. From Frankfurt this routes only to EU member-state regions. Never use `global.*` profile IDs. Claude Sonnet 5.5 is the upgrade if the Evaluation Set shows Haiku isn't good enough. Adaptive thinking is turned off or set to low effort.
- **Embeddings:** Cohere Embed Multilingual v3, in-region in `eu-central-1`. It produces 1024 dimensions, and Swedish is supported. Chunks are stored as `vector(1024)`, so a later model swap only needs a re-embed, not a schema change.
- **Zero data retention:** `data_retention_mode: none` set via the Bedrock API in all six destination regions of the EU profile. Bedrock model invocation logging stays off (it would store prompts and undermine ADR 0003).
- Accessed through `@ai-sdk/amazon-bedrock`.

Bedrock was the only route that meets all four requirements self-serve. Anthropic's own API has no EU inference option. OpenAI, Azure and Mistral need an approval or sales process for zero data retention. Vercel AI Gateway can't combine EU and zero data retention for embeddings. Google Vertex AI (`eu` endpoint, same Claude models) is the fallback, pending an answer on its abuse-monitoring prompt logging. The evidence and cost estimate (about $2/month at realistic load) are in `docs/research/ai-provider-adr-0006.md`.

## Scope: portfolio first

SocratEase is run as a portfolio project. The Teacher tests it with "view as Student" (#20), and no real Students are let in for now. AWS, Vercel and Neon therefore live on personal accounts. **Before any real Cohort is let in,** two conditions must hold:

- data processing agreements must be in the name of the controller (Chas Academy), or Chas must explicitly accept the personal accounts;
- the Question Log (#7) and retention (#16) must be in place.
