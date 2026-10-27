# AI provider research for ADR 0006 (issue #2)

All facts below are **as of 2026-10-27** (the date every source was accessed). Prices and terms change often, so re-check the linked pages before you sign anything. Prices are list prices in USD per million tokens (MTok) unless stated otherwise. Only primary sources were used: official docs, terms, DPAs, pricing pages and the provider's own model catalog API. Where a primary source was ambiguous, missing or could not be fetched, that is said explicitly.

## 1. Summary

**Primary route: Amazon Bedrock, called directly from the app.** Use the source region `eu-central-1` (Frankfurt).
- Chat: Claude Haiku 5.5 via the EU geographic inference profile `eu.anthropic.claude-haiku-5-5`. Claude Sonnet 5.5 is the upgrade if the Evaluation Set shows Haiku is not good enough.
- Embeddings: Cohere Embed Multilingual v3, run in-region in Frankfurt (1024 dims, Swedish listed).
- Why: Bedrock is the only candidate where all four ADR 0006 requirements can be met **self-serve, without a sales conversation**:
  - zero data retention is an account setting (`data_retention_mode: none`) that you can enforce with an IAM/SCP policy;
  - the EU profile called from Frankfurt routes only to EU member-state regions;
  - AWS states that inputs and outputs are not used for training and are not shared with model providers;
  - the AWS DPA and SCCs apply through the Service Terms;
  - `@ai-sdk/amazon-bedrock` supports both chat and embeddings.
- It also sits in the same AWS region as Neon (`eu-central-1`) and next to Vercel `fra1`.
- Estimated cost at a realistic load: **about $2/month** for chat. Embedding the whole course material costs **less than $0.10**.

**Fallback route: Google Vertex AI on the `eu` multi-region endpoint.** It offers the same Claude Haiku/Sonnet 5.5 (so prompts carry over) or Gemini 3.x Flash, plus `gemini-embedding-001` or `text-multilingual-embedding-002`. Its EU guarantee is the strictest of all routes: EU member states only, with the UK and Switzerland excluded. ZDR, however, is several configuration steps, and Google's documented abuse-monitoring prompt logging has no exception path that the docs describe. That needs confirming before it can be called ✅.

The Anthropic API directly cannot keep inference in the EU (only `global` or `us`). OpenAI direct and Azure OpenAI can, but only after an approval or sales/account-team process for ZDR or modified abuse monitoring. Vercel AI Gateway works well as an optional routing layer for chat: with ZDR plus `inferenceRegion: eu` it routes Claude Haiku 5.5 to Bedrock `eu-central-1` or Vertex EU. It cannot currently satisfy ZDR and EU together for embeddings, and it requires the Pro plan for ZDR.

## 2. Requirements matrix

Legend: ✅ met / documented; ⚠️ possible but with conditions, approval or an unresolved ambiguity; ❌ not met.

Requirement 4 ("no personal data beyond what the Student types") is mostly **our** architecture: send no names, emails, Roster IDs or user identifiers. It is not a separate column. Every route below can meet it, as long as we do not use optional per-user fields such as OpenAI/Vercel safety identifiers or Bedrock invocation logging (see section 3).

| Route | No training | ZDR (and how obtained) | EU processing guarantee | DPA | Chat models in EU | Embedding models in EU | AI SDK fit |
|---|---|---|---|---|---|---|---|
| **AWS Bedrock (eu-central-1 + EU profile)** | ✅ Contractual FAQ statement; providers have no access | ✅ Self-serve: `data_retention_mode: none` per region via API; enforce with SCP. Fable 5/5.1 excluded | ✅ EU geo profile from Frankfurt routes to 6 EU-member regions only; in-region also possible for some models | ✅ AWS DPA + SCCs via Service Terms | ✅ Claude Haiku 5.5, Sonnet 5.5, Opus 5.5 (EU geo profile) | ✅ Cohere Embed Multilingual v3 (in-region FRA), Cohere Embed v4 (EU profile), Titan Text Embeddings V2 (in-region) | ✅ `@ai-sdk/amazon-bedrock` (chat + embeddings) |
| **Google Vertex AI (`eu` multi-region)** | ✅ "won't use your data to train" | ⚠️ Achievable by configuration (disable caching, no Search/Maps grounding, logging off), but abuse-monitoring prompt logging applies under GCP ToS; Claude-on-Vertex retention not covered by that page | ✅ `eu` endpoint = EU member states only (UK and CH excluded); ❌ if `global` is used | ✅ Cloud DPA (accept in console) | ✅ Gemini 3.x Flash / Flash-Lite, Claude Haiku/Sonnet/Opus 5.5 | ✅ `gemini-embedding-001`, `gemini-embedding-2` (preview), `text-multilingual-embedding-002`, Multilingual E5 | ✅ `@ai-sdk/google-vertex` (+ `/anthropic`) |
| **Mistral La Plateforme (`api.eu.mistral.ai`)** | ⚠️ Terms forbid training except where not opted out; API default not stated, so toggle "Anonymous improvement data" off. Preview/Labs models are always trainable | ⚠️ By request to support, "may approve or deny"; paid plans; stateless endpoints incl. embeddings | ⚠️ EU endpoint = "EU and EFTA countries"; control-plane data may leave; embeddings on EU endpoint not confirmed | ✅ DPA linked from terms; SCCs; subprocessors list | ✅ Mistral Medium 3.5, Small 4 (verify with `models.list` on EU endpoint) | ⚠️ `mistral-embed` (1024) – EU-endpoint availability unverified | ✅ `@ai-sdk/mistral` (custom `baseURL`) |
| **Vercel AI Gateway** (routing layer) | ✅ Vercel does not train; per-request "disallow prompt training" | ⚠️ Vercel retains no content. Provider ZDR via `zeroDataRetention: true` (Pro/Enterprise) | ⚠️ `inferenceRegion: {scope:'zone', geoRegion:'eu'}` pins provider inference; **the request may terminate in any Vercel region** first | ✅ Vercel DPA (Pro/Enterprise), SCCs | ✅ Claude Haiku/Sonnet 5.5 via Bedrock eu-central-1 or Vertex EU, both ZDR | ❌ Only `text-embedding-3-small` has EU, and its EU endpoint is not ZDR | ✅ Native (`ai` + `@ai-sdk/gateway`) |
| **OpenAI API direct (EU residency)** | ✅ Not used for training unless you opt in | ⚠️ ZDR/MAM "subject to prior approval by OpenAI"; via sales | ⚠️ `eu.api.openai.com` processes in EEA + Switzerland, but **requires** ZDR/MAM approval and a Modified Retention amendment | ⚠️ DPA page returned 403 to us; not verified | ✅ `gpt-6-luna`, `gpt-5.6-luna`, GPT-5.x mini (EU-eligible) | ✅ `text-embedding-3-small/large` | ✅ `@ai-sdk/openai` |
| **Azure OpenAI / Foundry (EU Data Zone)** | ✅ Not used to train; OpenAI has no access | ❌ for us: human-review storage is on by default; turning it off ("modified abuse monitoring") is "only to customers and partners managed by a Microsoft account team or under an eligible program" | ⚠️ EU Data Zone = Azure EU Data Boundary, "can include EFTA" (NO, CH) | ✅ Microsoft Products and Services DPA | ⚠️ Not verified per model for EU Data Zone | ⚠️ Not verified | ✅ `@ai-sdk/azure` |
| **Anthropic API direct** | ✅ "may not train models on Customer Content" | ⚠️ By request to sales; content "not retained by default" per docs, but the privacy article says 30 days (conflict) | ❌ `inference_geo` only `global` or `us`; workspace geo only `us` | ✅ DPA incorporated in Commercial Terms; SCCs | ❌ No EU option | ❌ No embedding model offered | ✅ `@ai-sdk/anthropic` |

## 3. Per-route details

### 3.1 AWS Bedrock (recommended)

**Training.** The Bedrock FAQ says: "AWS and the third-party model providers will not use any inputs to or outputs from Amazon Bedrock to train Amazon Nova, Amazon Titan, or any third-party models", and "Users' inputs and model outputs are not shared with any model providers" ([source](https://aws.amazon.com/bedrock/faqs/), accessed 2026-10-27). Models run in Bedrock-owned "Model Deployment Accounts", and model providers "don't have access to Amazon Bedrock logs or to customer prompts and completions" ([source](https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html), accessed 2026-10-27).

**Retention and ZDR.**
- Retention is controlled by a per-region **mode**: `none`, `default`, `aws_review`, or the legacy `provider_data_share`. With `none`, "No request or response data is written to durable storage by AWS or shared with the model provider." You set it per AWS region with `PUT /data-retention` (bedrock-runtime) or `PUT /v1/data_retention` (bedrock-mantle), and you can enforce it org-wide with an SCP that denies any mode other than `none`. A Region you have not configured stays at `inherit`, which falls back to the model's default. At launch there was no console UI, so this is done with the API only ([source](https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html), accessed 2026-10-27).
- Exceptions:
  - Claude Fable 5 and 5.1 require `aws_review`, with 30-day retention and possible AWS human review. They are unavailable under `none`.
  - For OpenAI models on Bedrock, classifier-flagged traffic is kept for up to 30 days.
  - CSAM detection may store flagged content. This applies to image inputs, which we do not use.
  - Retained data is stored in the *destination* region of a cross-region request ([source](https://docs.aws.amazon.com/bedrock/latest/userguide/abuse-detection.html), accessed 2026-10-27).
- Example on the same page: Claude Opus 4.8 lists `none` in `allowed_modes`. The page does not show `allowed_modes` for Haiku 5.5 or Sonnet 5.5. They are not on the abuse-detection retention list, but we should verify with `GET /v1/models/anthropic.claude-haiku-5-5` (see section 6).
- "ZDR eligibility for Claude models is managed by Anthropic" for models that require retention ([source](https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html), accessed 2026-10-27). That is only relevant if we wanted Fable.
- **Our own logging:** do not enable Bedrock model invocation logging (CloudWatch/S3). It would store prompts in our account and undermine ADR 0003 (anonymous aggregate Question Log). CloudTrail records request metadata, including the `inferenceRegion` field ([source](https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html), accessed 2026-10-27).

**EU processing.**
- Claude Haiku 5.5 and Sonnet 5.5 are **not** available in-region in any EU region. They are available through the Geo (EU) and Global profiles ([source](https://docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.html), accessed 2026-10-27).
- The EU profile `eu.anthropic.claude-haiku-5-5`, called from source region `eu-central-1`, has these destination regions: eu-central-1 (Frankfurt), eu-north-1 (Stockholm), eu-south-1 (Milan), eu-south-2 (Spain), eu-west-1 (Ireland), eu-west-3 (Paris). All are EU member states. Other source regions differ: Zurich as source adds eu-central-2 ([Haiku 5.5 model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-5-5.html), [Sonnet 5.5 model card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-sonnet-5-5.html), accessed 2026-10-27). **Always call from eu-central-1, never from eu-central-2 or eu-west-2 (London).**
- "Cross-Region inference requests to an inference profile tied to a geography … stay within that geography" ([source](https://docs.aws.amazon.com/bedrock/latest/userguide/geographic-cross-region-inference.html), accessed 2026-10-27). The `global.` profile routes worldwide, so do **not** use `global.*` IDs ([source](https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html), accessed 2026-10-27).
- Anthropic's docs give the endpoint types: global, or regional/geo with "a 10 percent pricing premium" ([source](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock), accessed 2026-10-27).
- Abuse review stays inside AWS. Under `aws_review`, "Your content is not shared with the model provider" ([source](https://docs.aws.amazon.com/bedrock/latest/userguide/data-retention.html), accessed 2026-10-27).

**DPA and sub-processors.** The AWS Service Terms include the 2021 SCCs, which apply automatically to transfers to third countries. The sub-processor list is at aws.amazon.com/compliance/sub-processors ([source](https://aws.amazon.com/compliance/gdpr-center/), accessed 2026-10-27). This does not require a separate signature for a small customer.

**Models in the EU.**
- Chat (EU geo profile): Claude Haiku 5.5, Sonnet 5.5, Opus 5.5, Fable 5.1 (not usable with ZDR) ([source](https://docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.html), accessed 2026-10-27).
- Model access for Haiku 5.5 and Sonnet 5.5 is "See Access", not "Open" ([source](https://platform.claude.com/docs/en/build-with-claude/claude-in-amazon-bedrock), accessed 2026-10-27). Check this in the console.
- The Haiku 5.5 model card says "adaptive thinking is on by default", with effort `medium` by default ([source](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-anthropic-claude-haiku-5-5.html), accessed 2026-10-27). Thinking tokens are billed as output, so set the effort or turn thinking off.
- Embeddings:
  - Cohere Embed Multilingual (v3) is in-region in eu-central-1, eu-west-1, eu-west-2 and eu-west-3, with no geo profile.
  - Cohere Embed v4 is in-region only in eu-west-1, or through the EU geo profile (same 6 EU destinations from eu-central-1).
  - Titan Text Embeddings V2 is in-region in all EU regions ([source](https://docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.html), [Embed v4 card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-cohere-embed-v4.html), accessed 2026-10-27).

**Price.**
- The AWS pricing page did not render Claude or Cohere per-token prices in our fetch ([source](https://aws.amazon.com/bedrock/pricing/), accessed 2026-10-27). That is a gap.
- Secondary-but-official figures: the Vercel AI Gateway catalog lists Bedrock `eu-central-1` Claude Haiku 5.5 at $0.11 in / $0.55 out. This is consistent with Anthropic's list price of $0.10/$0.50 plus the documented 10% regional premium ([gateway endpoints API](https://ai-gateway.vercel.sh/v1/models/anthropic/claude-haiku-5.5/endpoints), [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing), accessed 2026-10-27).
- Sonnet 5.5 is therefore ≈ $2.20 / $11.00 in the EU ($2/$10 list plus 10%).
- Embeddings (gateway catalog list prices, not AWS's page): Cohere Embed v4 $0.12/MTok, Titan Text Embeddings V2 $0.02/MTok ([source](https://ai-gateway.vercel.sh/v1/models), accessed 2026-10-27).
- AWS's pricing page gives one worked example: "Embed English or Embed Multilingual" for 10K tokens costs $0.001, i.e. ≈ $0.10/MTok, region not stated ([source](https://aws.amazon.com/bedrock/pricing/), accessed 2026-10-27).

**AI SDK.**
- `@ai-sdk/amazon-bedrock` supports chat, including the `eu.anthropic.*` profile IDs used in its examples. It also supports embeddings via `.embedding()`, with `cohere.embed-multilingual-v3` (1024) and `amazon.titan-embed-text-v2:0` (1024) in its table. Cohere models need `inputType` ([source](https://ai-sdk.dev/providers/ai-sdk-providers/amazon-bedrock), accessed 2026-10-27).
- `cohere.embed-v4:0` is not in that table, so it is unverified with the SDK.

**Setup cost and lock-in.**
- Setup: an AWS account with billing, and an IAM user or role allowed `bedrock:InvokeModel` on the EU profile **and** on all of its destination regions ([source](https://docs.aws.amazon.com/bedrock/latest/userguide/geographic-cross-region-inference.html), accessed 2026-10-27). Then request model access, run one API call to set `data_retention_mode: none` in eu-central-1, and put the credentials in Vercel env vars.
- Lock-in on the chat side is low: the same Claude models exist on Vertex and Anthropic. On the embedding side, switching later means re-embedding every Chunk (cost < $0.10, see section 5).

### 3.2 Google Vertex AI (fallback)

**Training.** "Google won't use your data to train or fine-tune any AI/ML models without your prior permission or instruction" ([source](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/vertex-ai-zero-data-retention), accessed 2026-10-27; page last updated 2026-10-26).

**Retention and ZDR.** The same page lists what to do to reach ZDR:
- Disable in-memory and durable caching per project (default retention up to 24 h).
- Do not enable request-response logging.
- Set `store=false` in the Interactions API.
- Avoid Grounding with Google Search (stored up to 3 days, cannot be disabled) and Maps (30 days).
- Do not use Live session resumption or the Deep Research agent.

Prompt logging for abuse monitoring: "Google may log prompts to detect potential abuse … Only customers whose use of Google Cloud is governed by the Google Cloud Platform Terms of Service are subject to prompt logging for abuse monitoring" ([source](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/vertex-ai-zero-data-retention), accessed 2026-10-27). **Ambiguous:** we would be on the GCP ToS, and the page describes no self-serve exception. We could not read the separate abuse-monitoring page body. The page also does not cover partner (Claude) models. For those, Anthropic says Google is the data processor ([source](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention), accessed 2026-10-27). Vercel lists Vertex as ZDR-capable under *its* agreement, not ours ([source](https://vercel.com/docs/ai-gateway/security-and-compliance/zdr), accessed 2026-10-27).

**EU processing.** "The European Union multi-region (`eu`) endpoint strictly covers data residency within EU member states. Geographies outside the European Union political boundary, including the United Kingdom and Switzerland, are excluded." By contrast, "Requests submitted to a `global` endpoint may be processed in any Google Cloud location around the world" ([source](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/learn/data-residency), accessed 2026-10-27).

**Models in the EU multi-region** (same source):
- Chat: Gemini 3.8 / 3.7 / 3.6 / 3.5 Flash, 3.5 / 3.1 Flash-Lite, Gemini 4 Argon, and Claude Haiku 5.5 / Sonnet 5.5 / Opus 5.5 / Sonnet 5.
- Embeddings: `gemini-embedding-001`, `gemini-embedding-2`, `text-multilingual-embedding-002`, Multilingual E5 Large/Small.

**Price** ([source](https://cloud.google.com/vertex-ai/generative-ai/pricing), accessed 2026-10-27). "Non-global" is +10%.
- Gemini 3.8 Flash non-global: $0.825 / $4.125 through 2026-12-31 (introductory), then $1.65 / $8.25.
- Gemini 3.1 Flash-Lite non-global: $0.275 / $1.65.
- Claude Haiku 5.5, EU multi-region: $0.11 / $0.55. Sonnet 5.5: $2.20 / $11.00.
- Gemini Embedding: "$0.00015 per 1,000 count". The page does not name the unit (tokens or characters), so treat it as ambiguous. "Embeddings for Text (Excluding Gemini Embedding)": $0.000025 per 1,000 count.
- Gemini Embedding 2 is marked **Preview**: $0.20/MTok.
- A footnote says "Promotional pricing provided through 50% credits back on net spend on select models", and it is unclear which rows it applies to.

**DPA.** The Cloud Data Processing Addendum takes effect "on the date on which Customer accepted" it. You accept it in the console; we did not read the transfer section ([source](https://cloud.google.com/terms/data-processing-addendum), accessed 2026-10-27).

**AI SDK.** `@ai-sdk/google-vertex` (Gemini plus embeddings via `.embeddingModel()`) and `@ai-sdk/google-vertex/anthropic` for Claude ([source](https://ai-sdk.dev/providers/ai-sdk-providers/google-vertex), accessed 2026-10-27). Set the location to `eu`, never `global`.

**Setup cost:** a GCP project with billing, a service account key in Vercel env, caching disabled via API, and the DPA accepted.

### 3.3 Vercel AI Gateway (routing layer)

**Training and retention at Vercel.** "Vercel does not train on your prompts, and AI Gateway itself does not retain prompt or response content: it is deleted once the request completes." Metadata (model, tokens, cost, routing attempts) is kept for 30 days in Logs ([source](https://vercel.com/docs/ai-gateway/faq), accessed 2026-10-27).

**Provider ZDR.**
- ZDR is "available for Pro and Enterprise users". Per-request ZDR (`providerOptions.gateway.zeroDataRetention: true`) has "No additional cost". Team-wide ZDR costs "$0.10 per 1,000 requests".
- With ZDR enabled, BYOK keys are skipped unless you mark them ZDR-compliant.
- Listed ZDR providers include Anthropic, Bedrock, Google Vertex AI, Azure, Mistral, and OpenAI ("ZDR with safety retention").
- `anthropic/claude-fable-5` "does not support ZDR on any provider" ([source](https://vercel.com/docs/ai-gateway/security-and-compliance/zdr), accessed 2026-10-27).

**EU processing.**
- `inferenceRegion: { scope: 'zone', geoRegion: 'eu' }` pins where the *provider* runs inference and stores data. If it cannot be honoured, the request fails.
- But: "your request can terminate and be processed in any Vercel region before AI Gateway forwards it to the provider. Region-pinned gateway hosts … are coming."
- Also: "a provider handles and retains requests it flags for abuse or safety review under its own policies, which can fall outside your region" ([source](https://vercel.com/docs/ai-gateway/security-and-compliance/regional-inference), accessed 2026-10-27).

**Models with EU plus ZDR** (gateway catalog, [source](https://ai-gateway.vercel.sh/v1/models/anthropic/claude-haiku-5.5/endpoints), accessed 2026-10-27):
- Claude Haiku 5.5 is served in the EU by `bedrock` (provider_region `eu-central-1`, `has_zdr: true`) and by `vertexAnthropic` (EU zone, `has_zdr: true`), at $0.11 / $0.55. The `anthropic` endpoint has only a `us` region.
- Embeddings: the only embedding model with an `eu` region is `openai/text-embedding-3-small`, and its OpenAI endpoint has `has_zdr: false` ([source](https://ai-gateway.vercel.sh/v1/models/openai/text-embedding-3-small/endpoints), accessed 2026-10-27). So **ZDR plus EU for embeddings fails through the Gateway with system credentials.**

**Pricing.** "No platform markup on tokens", the same for BYOK ([source](https://vercel.com/docs/ai-gateway/faq), accessed 2026-10-27).

**DPA.** The Vercel DPA covers "Enterprise and Pro plans" and uses 2021 SCCs. Sub-processors are listed at security.vercel.com. The DPA page does not mention AI Gateway providers ([source](https://vercel.com/legal/dpa), accessed 2026-10-27).

**Fit and lock-in.** This is the most native fit for the AI SDK, because model strings like `'anthropic/claude-haiku-5.5'` work with no provider package. It is useful later for failover between Bedrock EU and Vertex EU. Lock-in is low (zero markup, BYOK possible). But it adds a third party to the data path, and it needs the Pro plan for ZDR. **We do not know which Vercel plan SocratEase is on** (see section 6).

### 3.4 Mistral La Plateforme

**Training.** Commercial Terms §4.2: "Mistral AI will not use Customer Data or Outputs to train its artificial intelligence models except…". The exceptions include products where the customer has not opted out. §4.3: Labs or Preview models may be used for training, regardless of ZDR ([source](https://legal.mistral.ai/terms/commercial-terms-of-service/), accessed 2026-10-27).
- The API opt-out is the Admin → Privacy toggle "Anonymous improvement data". The help article does not state whether it is on by default ([source](https://help.mistral.ai/en/articles/455207-can-i-opt-out-of-my-input-or-output-data-being-used-for-training), accessed 2026-10-27).
- **Mistral Large 4 is "Public Preview"** ([source](https://docs.mistral.ai/models/mistral-large-4-0), accessed 2026-10-27), so it is excluded by ADR 0006 requirement 1.

**Retention and ZDR.**
- "ZDR is available on paid plans for supported stateless API calls." You request it from support with a reason, and Mistral "may approve or deny".
- It covers chat completions and embeddings. It does not cover Agents, Batch, Conversations or Files ([source](https://docs.mistral.ai/admin/monitor-comply/zero-data-retention), accessed 2026-10-27).
- The DPA says Mistral is a controller for "abuse monitoring on our APIs (except … when zero data retention has been activated)" ([source](https://legal.mistral.ai/terms/data-processing-addendum/), accessed 2026-10-27).
- We found no primary statement of the default retention period without ZDR.

**EU processing.**
- Data is "hosted in the European Union by default" ([source](https://help.mistral.ai/en/articles/347629-where-do-you-store-my-data-or-my-organization-s-data), accessed 2026-10-27).
- Inference location is not committed on `api.mistral.ai`. `api.eu.mistral.ai` covers "Multiple data centers in EU and EFTA countries" at 1.1× price. Control-plane data "may still be handled … outside the selected inference geography". Models vary by region, so check `models.list` ([source](https://docs.mistral.ai/inference/regional-inference), accessed 2026-10-27).
- Embeddings on the EU endpoint are **not confirmed**.

**DPA and sub-processors.** The DPA uses SCCs and does not mention the DPF. Sub-processors are listed at trust.mistral.ai/subprocessors ([source](https://legal.mistral.ai/terms/data-processing-addendum/), accessed 2026-10-27).

**Models and prices.**
- Mistral Medium 3.5: "$1.5 … and $7.5" per MTok, with input and output not labelled on the page ([source](https://docs.mistral.ai/models/mistral-medium-3-5-26-04), accessed 2026-10-27).
- Mistral Small 4 (`mistral-small-2603`): $0.15 / $0.60, also not labelled ([source](https://docs.mistral.ai/models/mistral-small-4-0-26-03), accessed 2026-10-27).
- `mistral-embed-2312`: $0.10/MTok ([source](https://docs.mistral.ai/models/mistral-embed-23-12), accessed 2026-10-27). "Mistral Embed produces 1024-dimensional vectors" (docs glossary, [source](https://docs.mistral.ai/llms-full.txt), accessed 2026-10-27).
- No primary source found on Swedish quality.

**AI SDK.** `@ai-sdk/mistral` (chat plus `.embedding('mistral-embed')`). The default base URL is `https://api.mistral.ai/v1`, so set `baseURL` to the EU host ([source](https://ai-sdk.dev/providers/ai-sdk-providers/mistral), accessed 2026-10-27).

### 3.5 OpenAI API direct

**Training.** "Data sent to the OpenAI API is not used to train or improve OpenAI models" unless you opt in. Abuse-monitoring logs are kept for up to 30 days by default ([source](https://developers.openai.com/api/docs/guides/your-data), accessed 2026-10-27).

**ZDR and MAM.** "These controls are subject to prior approval by OpenAI and acceptance of additional requirements"; "Contact our sales team" (same source). `/v1/embeddings` is ZDR-eligible.

**EU processing.**
- `eu.api.openai.com` gives regional storage and processing in "Europe (EEA + Switzerland)". It "Requires Zero Data Retention, Modified Abuse Monitoring, Private Retention with PSP, or Safety Retention". Non-US regions also require that you "must be approved for abuse monitoring controls, and execute a Modified Retention amendment".
- System data (billing, usage) may be processed outside the region (same source).

**Models in the EU** (same source):
- Chat: `gpt-6-luna`, `gpt-5.6-luna`, `gpt-5.4-mini-2026-03-17`, `gpt-5-mini-2025-08-07`, among others.
- Embeddings: `text-embedding-3-small` and `text-embedding-3-large`.

**Price** ([source](https://developers.openai.com/api/docs/pricing), accessed 2026-10-27).
- `gpt-6-luna` $0.10 / $0.50; `gpt-5.6-luna` $0.20 / $1.20.
- `text-embedding-3-small` $0.02; `-large` $0.13.
- "Regional processing (data residency) endpoints are charged a 10% uplift for models released on or after March 5, 2026."
- Embeddings: 1536 dims (small) and 3072 (large) by default, shortenable with `dimensions` ([source](https://developers.openai.com/api/docs/guides/embeddings), accessed 2026-10-27).

**DPA.** openai.com/policies/data-processing-addendum returned HTTP 403 to our fetch, so it is **not verified**.

**AI SDK.** `@ai-sdk/openai`.

**Verdict:** this route is technically viable, but blocked on a sales approval whose outcome for a ~31-Student school project is unknown.

### 3.6 Azure OpenAI / Microsoft Foundry

**Training.** Prompts and completions "are NOT available to OpenAI", "are NOT used to train any generative AI foundation models without your permission" ([source](https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/openai/data-privacy), accessed 2026-10-27).

**Retention.**
- Flagged prompts and completions may be stored for human review in the resource's geography, and reviewers are in the EEA for EEA deployments. The page we read does not state the retention period.
- Modified abuse monitoring removes that storage, but it is "available only to customers and partners managed by a Microsoft account team or under an eligible program" ([source](https://learn.microsoft.com/en-us/azure/ai-foundry/responsible-ai/openai/limited-access), [source](https://learn.microsoft.com/en-us/azure/ai-foundry/openai/concepts/abuse-monitoring), accessed 2026-10-27).
- We do not know whether Chas Academy has a managed Microsoft account. If it does not, ZDR is effectively unavailable.

**EU processing.** Data Zone Standard processes "within the Azure EU Data Boundary, which can include … EFTA … Norway and Switzerland". "Microsoft can add regions to either data zone without prior notice" ([source](https://learn.microsoft.com/en-us/azure/ai-foundry/foundry-models/concepts/deployment-types), accessed 2026-10-27).

**DPA.** Microsoft Products and Services DPA (aka.ms/DPA).

**Models and prices in the EU Data Zone:** not verified in this research.

**AI SDK.** `@ai-sdk/azure`.

### 3.7 Anthropic API direct

**Training.** "Anthropic may not train models on Customer Content from Services" ([source](https://www.anthropic.com/legal/commercial-terms), accessed 2026-10-27).

**Retention.**
- The developer docs say: "Conversation content (your prompts and Claude's outputs) is not retained by default; the exception is Covered Models [Fable/Mythos], which require 30-day retention." ZDR is obtained by contacting sales. Flagged content may be kept "for up to 2 years" even under ZDR ([source](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention), accessed 2026-10-27).
- **Conflict:** the privacy center says "we automatically delete inputs and outputs on our backend within 30 days of receipt or generation" ([source](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data), accessed 2026-10-27).

**EU processing.** **None.**
- `inference_geo` has only `"global"` (default: "any available geography") and `"us"`.
- "Workspace geo: Only `"us"` is currently available" ([source](https://platform.claude.com/docs/en/manage-claude/data-residency), accessed 2026-10-27).

**DPA.** Incorporated into the Commercial Terms, with SCC Modules 2 and 3. Sub-processors are at anthropic.com/subprocessors ([source](https://www.anthropic.com/legal/data-processing-addendum), accessed 2026-10-27).

**Embeddings.** The pricing page lists only Claude models, and there is no embedding endpoint ([source](https://platform.claude.com/docs/en/about-claude/pricing), accessed 2026-10-27).

**Verdict:** this route fails requirement 3, because better EU routes exist for the same models (Bedrock, Vertex).

### 3.8 Data transfers outside the EU

- On Bedrock with the EU profile, and on Vertex with `eu`, inference stays in the EU. Account, billing and metadata are still handled by US-headquartered companies under SCCs.
- None of the DPAs we read (Anthropic, Mistral, Vercel) mention the EU-US Data Privacy Framework. They rely on SCCs. We did not check DPF list entries, because that would mean visiting a secondary register. Check dataprivacyframework.gov if legal asks.

## 4. Embeddings shortlist for Swedish

pgvector limits, verified from the README: HNSW and IVFFlat indexes support `vector` "up to 2,000 dimensions" and `halfvec` "up to 4,000 dimensions". Storage allows up to 16,000 ([source](https://github.com/pgvector/pgvector/blob/master/README.md), accessed 2026-10-27).

| Model | Route (EU) | Dims | Swedish (primary source) | Price/MTok | Notes |
|---|---|---|---|---|---|
| **Cohere Embed Multilingual v3** | Bedrock in-region eu-central-1 | 1024 | ✅ "sv" listed ([Cohere](https://docs.cohere.com/docs/cohere-embed)) | ≈ $0.10 (AWS example) | 512-token input limit, so keep Chunks small. Launched 2023, lifecycle "Active" ([card](https://docs.aws.amazon.com/bedrock/latest/userguide/model-card-cohere-embed-multilingual.html)). **Recommended.** |
| Cohere Embed v4 | Bedrock EU geo profile (in-region only eu-west-1) | 256/512/1024/1536 (default 1536) | Not stated for v4 on the Cohere page | $0.12 (gateway catalog) | 128k context. Not in the AI SDK Bedrock table. |
| Titan Text Embeddings V2 | Bedrock in-region, all EU regions | 1024/512/256 | Swedish in the language list, but "optimized for English", "100+ languages in preview" ([AWS](https://docs.aws.amazon.com/bedrock/latest/userguide/titan-embedding-models.html)) | $0.02 (gateway catalog) | Cheapest. Multilingual quality caveated by AWS itself. |
| `gemini-embedding-001` | Vertex `eu` | up to 3072 (default); set `outputDimensionality` ≤ 2000 | Language list linked, not inline | $0.00015 / 1,000 "count" (unit ambiguous) | Max 2048 input tokens ([source](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/embeddings/get-text-embeddings)) |
| `text-multilingual-embedding-002` | Vertex `eu` | 768 | Language list linked, not inline | $0.000025 / 1,000 "count" | |
| `mistral-embed` | Mistral (EU endpoint unconfirmed) | 1024 | Not stated | $0.10 | |
| `text-embedding-3-small/large` | OpenAI EU (approval needed) | 1536 / 3072 (shortenable) | Not stated | $0.02 / $0.13 | `-large` must be shortened to ≤ 2000 for HNSW `vector` |

Recommendation: store embeddings as `vector(1024)`. Most EU candidates can produce 1024 dims (Cohere v3/v4, Titan v2, Mistral, Gemini via `outputDimensionality`, OpenAI via `dimensions`), so a later swap needs only a re-embed, not a schema change. The Evaluation Set should include Swedish retrieval checks before the embedding model is locked in.

## 5. Cost estimate

**Assumptions.**
- 31 Students.
- Realistic load: 5 messages per Student per day × 22 study days = **3,410 messages/month**.
- Ceiling load: 50/day × 30 days = **46,500 messages/month**.
- Per message: 3,000 input tokens (system prompt, retrieved Chunks, Conversation) and 400 output tokens. That gives 10.2 MTok in / 1.36 MTok out per month (realistic) and 139.5 MTok in / 18.6 MTok out (ceiling).
- No prompt caching assumed. Caching the fixed system prompt would lower input cost; Bedrock supports prompt caching.
- Thinking tokens are counted as zero, which assumes thinking is turned off or kept at low effort. If it is left on, output may be several times larger.
- Embeddings: 150k words of material, roughly 300–400k tokens including overlap (our assumption: Swedish uses about 2 tokens per word). Query embeddings add about 50 tokens per message, which is negligible.

| Route / chat model (EU price, in/out per MTok) | Realistic / month | Ceiling / month |
|---|---|---|
| **Bedrock EU, Claude Haiku 5.5 ($0.11 / $0.55)** | **$1.88** | **$25.58** |
| Bedrock or Vertex EU, Claude Sonnet 5.5 ($2.20 / $11.00) | $37.51 | $511.50 |
| Vertex EU, Gemini 3.8 Flash, intro until 2026-12-31 ($0.825 / $4.125) | $14.07 | $191.81 |
| Vertex EU, Gemini 3.8 Flash from 2027 ($1.65 / $8.25) | $28.13 | $383.62 |
| Vertex EU, Gemini 3.1 Flash-Lite ($0.275 / $1.65) | $5.06 | $69.05 |
| Mistral EU, Medium 3.5 ($1.65 / $8.25, assuming the first price is input) | $28.13 | $383.62 |
| Mistral EU, Small 4 ($0.165 / $0.66) | $2.59 | $35.29 |
| OpenAI EU, gpt-6-luna ($0.11 / $0.55), if approved | $1.88 | $25.58 |

- **Embeddings:** one full embed of 400k tokens costs $0.04–0.05 with Cohere ($0.10–0.12/MTok) and under $0.01 with Titan. Re-embedding changed pages costs cents per year.
- **Other costs:**
  - Vercel AI Gateway, only if used: per-request ZDR is free but needs the Pro plan; team-wide ZDR adds $0.34 (realistic) or $4.65 (ceiling) per month.
  - AWS and GCP have no platform fee for on-demand use.
- **Setup cost (time):**
  - Bedrock: about 1–2 hours (AWS account, IAM policy for 6 destination regions, model access request, one API call to set `none`).
  - Vertex: about 1–2 hours plus caching-disable calls and DPA acceptance.
  - OpenAI EU, Azure and Anthropic ZDR: days to weeks, depending on a sales or account team.

## 6. Open questions to verify with providers

1. **AWS:** confirm that `GET /v1/models/anthropic.claude-haiku-5-5` (and Sonnet 5.5, Cohere Embed Multilingual) lists `"none"` in `allowed_modes`. The data retention page shows this only for Opus 4.8.
2. **AWS:** the data retention setting is "per-Region". Does a request from source `eu-central-1` through the EU profile honour the eu-central-1 setting in the destination region, or must `none` be set in all 6 destination regions? The docs are ambiguous. The safe move is to set `none` in all 6.
3. **AWS:** what are the model access criteria for Haiku 5.5 and Sonnet 5.5 ("See Access")? Also check the exact EU on-demand prices for Claude and Cohere on aws.amazon.com/bedrock/pricing, which did not render for us.
4. **Google:** is there an exception to abuse-monitoring prompt logging for a small, self-serve billing account? How long are logged prompts kept, and where? Does Vertex's ZDR guidance apply to Claude on Vertex (Google-managed)?
5. **Mistral:** what is the default retention without ZDR? Is the API training toggle on by default for pay-as-you-go? Is `mistral-embed` served on `api.eu.mistral.ai`? Which EFTA countries are used?
6. **OpenAI:** would a ~31-user educational project be approved for ZDR/MAM plus the Modified Retention amendment needed for EU residency? Can the DPA be signed self-serve? (The page returned 403.)
7. **Azure:** does Chas Academy have a Microsoft account team? If not, modified abuse monitoring is not available.
8. **Anthropic:** resolve the conflict between "not retained by default" (developer docs) and "delete … within 30 days" (privacy center). Is an EU `inference_geo` planned?
9. **Vercel:** which plan is the SocratEase project on? ZDR needs Pro. When will region-pinned gateway hosts ship? Are gateway providers listed as Vercel sub-processors at security.vercel.com?
10. **Internal (Chas Academy legal):** is EU+EFTA (Mistral, Azure) or EU+UK/CH (some AWS source regions) acceptable, or must it be strictly EU member states? The recommended route (Bedrock from eu-central-1, or Vertex `eu`) is strictly EU.
