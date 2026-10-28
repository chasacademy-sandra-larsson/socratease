# Vertex AI research for ADR 0006 (fallback after Bedrock was blocked)

Every source below was accessed on **2026-10-28**. Only primary sources were used: Google Cloud docs, Google Cloud terms, Google's pricing page, Anthropic's docs and terms, the AI SDK docs plus the published `@ai-sdk/google-vertex` package source, and Vercel's docs. Where a source is silent, ambiguous or contradicts another, this document says so instead of filling the gap.

> **Naming note.** Google has renamed Vertex AI to **Gemini Enterprise Agent Platform**. The old `cloud.google.com/vertex-ai/generative-ai/docs/...` URLs now redirect to `docs.cloud.google.com/gemini-enterprise-agent-platform/...`. The API hostnames are unchanged (`aiplatform.googleapis.com`, `aiplatform.eu.rep.googleapis.com`). In this document, "Vertex" means that platform.

## 1. Verdict

| # | ADR 0006 requirement | Verdict | Why |
|---|---|---|---|
| 1 | No training on the data | ✅ | Service Specific Terms §18: "Google will not use Customer Data to train or fine-tune any AI/ML models without Customer's prior permission or instruction." Abuse logs are also excluded from training. |
| 2 | Zero data retention | ⚠️ | Caching, request-response logging, grounding and the Interactions API can all be turned off or avoided. **Abuse-monitoring prompt logging cannot be turned off self-serve.** |
| 3 | EU processing | ✅ (with one caveat) | The `eu` endpoint covers EU member states only. Claude Haiku 5.5 runs there. **Caveat:** `gemini-embedding-001` and `text-multilingual-embedding-002` are *not* served on `eu`. Use an EU regional endpoint such as `europe-west3`, which processes within the EU boundary. |
| 4 | No personal data beyond what the student types | ✅ (by design) | Nothing in the API requires end-user identifiers. Don't send any (no `metadata.userId`, no personal labels). Data Access audit logs and request-response logging are off by default. |

**What remains under requirement 2:**
- **When:** only when Google's automated safety classifiers flag a request as suspected abuse. It is not a log of every prompt.
- **What:** the customer *prompt* only. The text does not mention responses for Google models or for non-"Advanced AI" models such as Haiku 5.5.
- **How long:** up to **90 days**.
- **Where:** "in the same region or multi-region selected by the customer for their project". With `eu` or `europe-west3`, that is the EU. The logs are not CMEK-encrypted.
- **Human review:** **yes**. "Authorized Google employees may assess the flagged prompts."
- **Opt-out:** no self-serve opt-out and no request form. The only exemption is a Google Cloud **Master Agreement**, which is an offline contract. Self-serve projects on the online Terms of Service are in scope.
- **Training:** never used to train models.
- **Scope:** It certainly covers the embedding calls, because the Embeddings API is a listed "Generative AI Service". Whether it covers Claude calls is **ambiguous** in Google's docs (see §2.2). Assume it does.

For a portfolio project where only the Teacher tests and no real Students are let in, the exposure is small: only flagged prompts are logged, they stay in the EU, and they are deleted within 90 days. Before real Students are let in, Chas should explicitly accept this residual, or obtain a Master Agreement.

## 2. Findings

### 2.1 Abuse-monitoring prompt logging (question 1)

I read the dedicated page in full ([Abuse monitoring](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/abuse-monitoring), accessed 2026-10-28; "Last updated 2026-10-28 UTC"). It has three regimes:

**a) "Google models not designated as 'Google Frontier Models' or 'Advanced AI'"** applies to `gemini-embedding-001`, `gemini-embedding-2` and `text-multilingual-embedding-002`, and probably to Claude Haiku 5.5 (see §2.2).
- Detection: "Google uses automated safety classifiers to detect potential abuse and violations."
- Logging: "If automated safety classifiers detect suspicious activity that requires further investigation … then Google may log customer prompts solely for the purpose of examining whether a violation of the AUP or Prohibited Use Policy has occurred."
- Training: "This data won't be used to train or fine-tune any AI/ML models."
- Retention and location: "stored securely for up to 90 days in the same region or multi-region selected by the customer for their project and adheres to Google Cloud assurances, such as Data Residency, Access Transparency and VPC Service Controls." The logs "are not encrypted by Customer-managed encryption keys (CMEK)."
- Human review: "Authorized Google employees may assess the flagged prompts and may reach out to the customer for clarification." Recurring or severe abuse "may result in suspension or termination".
- Who is in scope: "Only customers whose use of Google Cloud is governed by the Google Cloud Platform Terms of Service. This means that customers with a Google Cloud Master Agreement are exempt from prompt logging for this abuse monitoring by default."

**b) "Google Frontier Models"** covers only Gemini 4 Argon (Cyber Permissive). We don't use it.

**c) "Non-Google Advanced AI models"** logs *all* prompts **and responses** for up to 30 days. "It may not be possible to opt-out." In scope are Claude Mythos, Claude Fable, and "Claude Opus >=4.7 and Sonnet >=5 when `advanced_ai_enabled` is set to true" for Anthropic's Cyber Verification Program. **Claude Haiku 5.5 is not on this list.** Using these models requires per-project consent to the Advanced AI Safety Addendum in Model Garden. We should never give that consent.

**Does it apply to a self-serve, pay-as-you-go project on a personal Gmail account?** Yes.
- The Google Cloud Terms of Service govern "the entity or person agreeing to these terms" unless you "signed an offline variant of this Agreement" ([Google Cloud Terms of Service](https://cloud.google.com/terms), accessed 2026-10-28; last modified 2026-10-12).
- A personal project that was set up in the console has accepted the online ToS, so it falls under "customers whose use of Google Cloud is governed by the Google Cloud Platform Terms of Service".
- ToS §4.3 is the legal basis: "if these tools detect potential abuse … Google may log Customer prompts solely for the purpose of reviewing and determining whether a violation has occurred" ([source](https://cloud.google.com/terms), accessed 2026-10-28).

**Self-serve opt-out or exception?** None.
- The current English page has no request form and no opt-out for regime (a). The only exemption it names is a Master Agreement.
- I also checked the Italian and German versions of the same page. Neither has a form either ([it](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/abuse-monitoring?hl=it), [de](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/abuse-monitoring?hl=de), accessed 2026-10-28).
- Google's ZDR page says the same and describes no exception path ([Agent Platform and zero data retention](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention), accessed 2026-10-28; the old `vertex-ai/.../data-governance` URL redirects here).
- A web search snippet suggested an older version mentioned an exception form and "invoiced billing" accounts. I could not find that text on any current primary page, so I am not relying on it.

### 2.2 Does this apply to Claude on Vertex? (question 2)

**Who is the processor:**
- Anthropic: "On Amazon Bedrock and Claude Models on Google Cloud (Google managed), the cloud provider is the data processor" ([API and data retention](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention), accessed 2026-10-28).
- Anthropic: "Google Cloud governs data handling for Claude Models on Google Cloud (Google managed)", and links to Google's ZDR page ([Claude Models on Google Cloud (Google managed)](https://platform.claude.com/docs/en/build-with-claude/claude-models-on-google-cloud/google-managed), accessed 2026-10-28).
- The `aiplatform.*` hosts with `/publishers/anthropic/models/...:rawPredict` are this Google-managed offering. The separate "Anthropic managed" offering uses `claude.googleapis.com` ([overview](https://platform.claude.com/docs/en/build-with-claude/claude-models-on-google-cloud/overview), accessed 2026-10-28). We use the Google-managed one.

**Data sharing with Anthropic:**
- Google: "Customer prompts and model responses are not shared with third-parties when using the Gemini Enterprise API, including partner models." Also: "Your data is stored at rest within the selected region or multi-region for partner models" ([Partner models](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/use-partner-models), accessed 2026-10-28).
- The exception is sharing with Anthropic for Fable 5 and Mythos 5 only ([Abuse monitoring](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/abuse-monitoring); [Request-response logging, "Sharing … with MaaS partners"](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/request-response-logging), accessed 2026-10-28).

**Separate terms:**
- Claude is a "Separate Offering" ([Claude on Agent Platform](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/claude), accessed 2026-10-28). Separate Offerings are "subject to separate terms and conditions" ([Service Specific Terms §19](https://cloud.google.com/terms/service-terms), accessed 2026-10-28; last modified 2026-10-27).
- "Use of Anthropic models on Gemini Enterprise Agent Platform is governed by Anthropic's Commercial Terms of Service … The abuse monitoring systems described on this page are used to ensure adherence to these terms" ([Abuse monitoring](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/abuse-monitoring), accessed 2026-10-28).
- Anthropic's Commercial Terms: "Anthropic may not train models on Customer Content from Services." They say nothing about cloud-provider access ([Commercial Terms](https://www.anthropic.com/legal/commercial-terms), accessed 2026-10-28; effective 2025-06-17).

**The ambiguity:**
- Google's ZDR page labels the 90-day item "Prompt logging for abuse monitoring **for Google models**".
- The abuse-monitoring page says the abuse systems are used for Anthropic models, but does not say which regime (a or c) applies to non-Advanced Claude models.
- The "Gemini Enterprise Agent Platform API … enables customers to access generative AI foundation models via an API" is listed as a Generative AI Service ([Services summary](https://cloud.google.com/terms/services), accessed 2026-10-28), and ToS §4.3 covers Generative AI Services.

**Conclusion:** assume the 90-day, classifier-triggered prompt logging with possible human review can also apply to Claude Haiku 5.5 calls. The 30-day log-everything regime does **not** apply to Haiku 5.5. Google's docs do not state Claude-specific retention for the regime-(a) case. That is an open question.

**ZDR configuration and Claude.** The ZDR page's caching controls are under "Google models: implicit data caching" for "Google's published Gemini models". The page says nothing about Claude's own prompt caching (`cache_control`), which is opt-in per request. We don't use it (see §2.6).

### 2.3 Claude Haiku 5.5 on Vertex in the EU (question 3)

**Model and availability:**
- Model ID: **`claude-haiku-5-5`**. Launch stage: **GA**, released 2026-10-07, "Retirement date not sooner than: October 7, 2027" ([Haiku 5.5 model page](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/claude/haiku-5-5), accessed 2026-10-28). Anthropic lists the same ID ([source](https://platform.claude.com/docs/en/build-with-claude/claude-models-on-google-cloud/google-managed), accessed 2026-10-28).
- Availability: "United States Multi-region, **Europe Multi-region**, Global". ML processing for the EU entry: "Europe Multi-region". There are **no EU single-region endpoints** for Haiku 5.5 (same page).
- Anthropic: "Regional endpoints serve Claude Sonnet 4.6 and earlier models only. For newer models, use a global or multi-region endpoint" ([source](https://platform.claude.com/docs/en/build-with-claude/claude-models-on-google-cloud/google-managed), accessed 2026-10-28).
- The data-residency table marks Haiku 5.5 as supported for "EU multi-region" ML processing ([Data residency](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/data-residency), accessed 2026-10-28).

**Endpoint:**
- `https://aiplatform.eu.rep.googleapis.com/v1/projects/PROJECT_ID/locations/eu/publishers/anthropic/models/claude-haiku-5-5:rawPredict` (`:streamRawPredict` for streaming) ([Partner models, "EU" tab](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/use-partner-models), accessed 2026-10-28).
- "The European Union multi-region (`eu`) endpoint strictly covers data residency within EU member states … including the United Kingdom and Switzerland, are excluded." Also, "Requests submitted to a global endpoint may be processed in any Google Cloud location around the world" ([Data residency](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/data-residency), accessed 2026-10-28).

**Price on `eu`:** from the "EU Multi-Region (EU)" tab of the pricing page, USD per 1M tokens ([Pricing](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing), accessed 2026-10-28).

| Haiku 5.5, EU multi-region | Input context < 100K tokens | Input context ≥ 100K tokens |
|---|---|---|
| Input | $0.11 | $0.55 |
| Output | $0.55 | $2.75 |
| 5m cache write / cache hit | $0.1375 / $0.011 | $0.6875 / $0.055 |

- Footnote: "If a query input context is longer than or equal to 100k tokens, all tokens (input and output) are charged at long context rates."
- The Global tab lists $0.10 / $0.50. EU is 10% higher, which matches Anthropic's statement: "Multi-region and regional endpoints cost 10 percent more than global endpoints" ([source](https://platform.claude.com/docs/en/build-with-claude/claude-models-on-google-cloud/google-managed), accessed 2026-10-28).
- The earlier research's "$0.11 / $0.55" was input/output below 100K, so it is consistent.

**How access is enabled** ([Request predictions with Claude models](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/claude/use-claude), [Partner models](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/use-partner-models), accessed 2026-10-28):
1. Billing must be enabled on the project, and the Agent Platform API (`aiplatform.googleapis.com`) must be enabled.
2. The person who enables the model needs **Consumer Procurement Entitlement Manager** (`roles/consumerprocurement.entitlementManager`): "Anyone who's been granted this role can enable partner models in Model Garden." The caller needs `aiplatform.endpoints.predict`, which is in `roles/aiplatform.user`.
3. Open the [Haiku 5.5 Model Garden card](https://console.cloud.google.com/agent-platform/publishers/anthropic/model-garden/claude-haiku-5-5) and click **Enable**.
   - "If your Google Cloud billing account is managed by a prohibited reseller, you will be unable to accept the Terms of Service or enable Claude models." That doesn't apply to a direct personal billing account.
   - The docs don't reproduce the exact terms-acceptance dialog. It runs through Cloud Marketplace procurement (`cloudcommerceconsumerprocurement.googleapis.com`). See the free-trial trap in §2.4.
4. The page says "Anthropic recommends that you enable 30-day logging of your prompt and completion activity". **Don't do this.** It stores prompts in BigQuery and conflicts with ZDR (§2.6).

### 2.4 Quotas for a brand-new project (question 4)

**Defaults (on paper):**
- Haiku 5.5 on multi-region: **QPM 1,500; input TPM 15,000,000** ("uncached and cache write"); **output TPM 1,500,000**; context 1,000,000 ([Haiku 5.5 page](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/claude/haiku-5-5), accessed 2026-10-28).
- Haiku 5.5 launched after 2026-05-26, so it uses a **shared lineage quota**. Quota dimension: `base_model: anthropic-claude-haiku`. Metrics: `eu_multi_region_online_prediction_{requests,input_tokens_per_minute,output_tokens_per_minute}_per_base_model` (the docs write `LOCATION_multi_region_…`). The `eu` bucket is independent of `global` ([Quotas for Claude](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/claude/quotas), accessed 2026-10-28).
- The docs call these "the default quotas". **No primary source says they are zero for new projects.**
- Embeddings: `gemini-embedding` (001) has 100,000,000 input TPM and 100,000 RPM. `gemini-embedding-2` has 200,000,000 input TPM and 60,000 RPM. Both are "global quotas" ([Gen AI quotas](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/quotas), accessed 2026-10-28). A "global" quota bucket is a quota-accounting term. It is not the processing location.

**Traps that could reproduce the AWS experience:**
1. **Free Trial billing accounts** ([Free Trial features](https://docs.cloud.google.com/free/docs/free-cloud-features), accessed 2026-10-28):
   - "You can't access or use the $300 credit for a generative AI partner model that is offered as a managed API."
   - While the account is a non-billable Free Trial, "you can't … Use Google Cloud Marketplace" or "Request a quota increase".
   - Upgrading unlocks "third-party generative AI models". To upgrade, go to the console Welcome page and click **Activate**.
   - **Check this first.** The owner's billing account must be a Paid account.
2. **Per-account variation:** "the maximum quotas might vary by account and, in some cases, access might be restricted" ([Quotas for Claude, per-model section](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/claude/quotas), accessed 2026-10-28). That sentence sits in the section for older models, so it is unclear whether it applies to Haiku 5.5.
3. **Unbilled projects:** "Some APIs set very low limits until you enable billing on your project" ([View and manage quotas](https://docs.cloud.google.com/docs/quotas/view-manage), accessed 2026-10-28).
4. **Increase requests can be denied.** "Most quota adjustment requests are evaluated by automated systems … based on criteria including … the length of time you've used Google Cloud … Requests that don't meet the criteria are denied." You "might be asked to pay in advance" ([About quota adjustments](https://docs.cloud.google.com/docs/quotas/overview), accessed 2026-10-28).

**How to check and request:**
1. Open IAM & Admin → [Quotas & System Limits](https://console.cloud.google.com/iam-admin/quotas) and filter on `anthropic-claude-haiku`.
2. To raise a quota: select it → Edit → New value. If needed, choose "Apply for higher quota", then Submit. Requests "are subject to review" and you get the result by email. If the console doesn't allow it, contact Cloud Customer Care ([View and manage quotas](https://docs.cloud.google.com/docs/quotas/view-manage), accessed 2026-10-28).
3. Before writing any code, look at the real values the project shows. The docs can't tell us what *this* project got.

### 2.5 Embeddings in the EU (question 5)

The language list was read on the [Text embeddings API reference](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/text-embeddings-api) (accessed 2026-10-28).

**Endpoint availability.** Two Google pages disagree, and this matters:
- The ML-processing table on [Data residency](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/data-residency) marks "EU multi-region" for all three embedding models. That page defines the columns as *ML processing* commitments. It also says locational endpoints keep ML processing "within the broader multi-regional or country jurisdiction associated with that region".
- The *endpoint availability* table on [Deployments and endpoints](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/locations) (accessed 2026-10-28) shows:
  - **`gemini-embedding-2`**: `global`, `us`, `eu`, and no regional endpoints.
  - **`gemini-embedding-001`** and **"Embeddings for Text"**: **not** on `us` or `eu`, but available in every listed European region (europe-west1/2/3/4/6/8/9, europe-north1, europe-central2, europe-southwest1).

  My reading is that the first table says *where processing happens* and the second says *which hostname serves the model*. **So calling `gemini-embedding-001` with location `eu` will likely fail. Use `europe-west3` (Frankfurt).** This is unverified until we test it.

| | `gemini-embedding-001` | `text-multilingual-embedding-002` | `gemini-embedding-2` |
|---|---|---|---|
| Swedish | ✅ "Swedish" is in the explicit gemini-embedding-001 language list | ✅ "Swedish" is in the "Supported languages" list (not in the smaller "Evaluated languages" list) | ⚠️ **Not documented.** The language section names only the other two models. The model page says "multilingual" but gives no list ([Gemini Embedding 2](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/embedding-2)) |
| Dimensions | "up to 3072"; `outputDimensionality` truncates | **"up to 768"**, so it **cannot output 1024** | "Up to 3,072 (with MRL support)"; supported range 128–3072; Google *recommends* 128, 768 or 1536 ([Multimodal embeddings](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/embeddings/get-multimodal-embeddings)) |
| 1024 for `vector(1024)` | ✅ via `outputDimensionality: 1024`. **Normalize yourself:** Google says gemini-embedding-2 outputs "are already L2 normalized for non-default dimensions (unlike gemini-embedding-001)" | ❌ (would need `vector(768)`) | ✅, already normalized |
| Input limit | 2048 tokens per text, silently truncated (`autoTruncate` defaults to true); 250 texts and 20,000 tokens per request. The REST section also says "For gemini-embedding-001, each request can only include a single input text", which conflicts with the 250 figure; see §4 | 2048 tokens per text | 8192 tokens |
| Location | `europe-west3` (not `eu`) | `europe-west3` (not `eu`) | `eu` |
| Launch stage | GA (stable version ID) | GA | Model page: **GA** since 2026-04-22. Pricing page still labels it "(Unified Multimodal, Preview)" |
| Price (online) | "$0.00015" per "1,000 count", input only, output "No charge". **The unit is not defined on the pricing page.** If count = tokens, that is $0.15 per 1M tokens; if characters, $0.15 per 1M characters | "$0.000025" per "1,000 count" (same ambiguity) | **$0.20 per 1M tokens** (text input; header "Price /1M tokens (USD)") |
| Abuse logging | Yes. "Embeddings API" is a listed Generative AI Service ([Services summary](https://cloud.google.com/terms/services)); regime (a) of §2.1 | Same | Same |

More notes on the table:
- Sources: dimensions and limits from [Get text embeddings](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/embeddings/get-text-embeddings) and [Text embeddings API](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/models/text-embeddings-api); prices from [Pricing → Embedding costs / MultiModal Embeddings](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing). All accessed 2026-10-28.
- The embedding price rows list only the region "Global". The pricing page does not say whether the 10% multi-region or regional premium applies to embeddings.
- Either way, the cost of embedding the course material is negligible, at cents.
- pgvector's 2,000-dimension HNSW limit rules out the default 3072 for both Gemini models. 1024 is fine.

### 2.6 ZDR checklist for our usage (question 6)

Source unless stated: [Agent Platform and zero data retention](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention), accessed 2026-10-28.

**Change at the project level:**
1. **Turn off implicit caching (in-memory and durable).**
   - Both are "Enabled by default". Durable cache data is "stored at rest" for up to 24 hours.
   - "Turning off caching disables both in-memory caching and durable caching … the change applies to all Google Cloud regions."
   - Needs `roles/aiplatform.admin`. The exact commands are in §3.
   - Note that the documented config endpoint is `us-central1-aiplatform.googleapis.com`. It carries a configuration flag, not content.
2. **Request-response logging: leave it off.** "This feature is disabled by default … To achieve zero data retention, do not enable this feature." For Claude it can only be configured over REST ([Request-response logging](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/request-response-logging), accessed 2026-10-28). Verify with the fetch command in §3.
3. **Data Access audit logs: leave them off.** The doc says "you need to enable" them. They include "data read" and "data write" operations ([Enable Data Access audit logs](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/enable-audit-logs), accessed 2026-10-28). The page doesn't say whether prompt text ends up in them, so we leave them off.
4. **Never consent to the Advanced AI Safety Addendum** in Model Garden. It is only needed for Fable, Mythos and CVP models, which log all prompts and responses for 30 days ([Abuse monitoring](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/abuse-monitoring)).

**Features to avoid:**
- Grounding with Google Search: kept "up to three (3) days … no way to disable".
- Grounding with Google Maps: kept 30 days.
- The Interactions API: `store` "defaults to `true`". The AI SDK has "Interactions models", so don't use them.
- Gemini Live session resumption.
- Agent products: Deep Research, CodeMender, Sandbox snapshots.
- The `global` location, because it has no data residency guarantee.
- Claude's server-side web search tool. It is supported on Vertex ([Haiku 5.5 page](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/claude/haiku-5-5)), but I found no retention statement for it.
- Claude prompt caching (`cache_control`). It is opt-in, and I found no retention statement for it on Vertex.
- **AI SDK "express mode" (`apiKey` / `GOOGLE_VERTEX_API_KEY`).** In `@ai-sdk/google-vertex@5.0.125` it uses `EXPRESS_MODE_BASE_URL = "https://aiplatform.googleapis.com/v1/publishers/google"`, which is the global host, whatever location you set (source: `dist/index.js` of the [npm package](https://www.npmjs.com/package/@ai-sdk/google-vertex), accessed 2026-10-28).

**Logging off by default?** Yes for request-response logging (ZDR page) and for Data Access audit logs (see above). Abuse logging (§2.1) is not a setting.

**Blocking `global` with policy:** `constraints/gcp.restrictEndpointUsage` "to block requests to the global API endpoint" is an *organization policy* constraint ([Partner models](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/use-partner-models), accessed 2026-10-28). Whether it can be set on a project with no organization above it is not documented in what I read. Enforce it in code instead (§3).

### 2.7 AI SDK fit (question 7)

**Location `eu`:** supported. I read the published source of `@ai-sdk/google-vertex@5.0.125`, which is the latest on npm (modified 2026-10-27, accessed 2026-10-28).
- For both `dist/index.js` (Gemini and embeddings) and `dist/anthropic/index.js` (Claude):
  ```js
  if (location === "global") return "aiplatform.googleapis.com";
  else if (location === "eu" || location === "us") return `aiplatform.${location}.rep.googleapis.com`;
  else return `${location}-aiplatform.googleapis.com`;
  ```
  The Claude base URL becomes `https://aiplatform.eu.rep.googleapis.com/v1/projects/${project}/locations/eu/publishers/anthropic/models`, which matches Google's documented host. With `europe-west3`, it becomes `europe-west3-aiplatform.googleapis.com`.
- The AI SDK docs list `location` (env `GOOGLE_VERTEX_LOCATION`), `project` (env `GOOGLE_VERTEX_PROJECT`), `googleAuthOptions` and `baseURL` ([AI SDK Google Vertex](https://ai-sdk.dev/providers/ai-sdk-providers/google-vertex), accessed 2026-10-28). The docs page itself doesn't mention `eu` for chat. The source does.
- Embeddings use `outputDimensionality` plus `taskType` (`RETRIEVAL_DOCUMENT` / `RETRIEVAL_QUERY`).
- In the source, `maxEmbeddingsPerCall` is 250 for `:predict` models such as gemini-embedding-001, and 1 for `gemini-embedding-2` (`:embedContent`).
- Package requirement: Node ≥ 22.

**Authentication from Vercel:**

| Option | What | Effort | Notes |
|---|---|---|---|
| **Service account key JSON in env vars** | Node: pass `googleAuthOptions: { credentials: { client_email, private_key } }`. The AI SDK docs say the Node provider uses Application Default Credentials or a credentials object. Edge: `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY` ([AI SDK](https://ai-sdk.dev/providers/ai-sdk-providers/google-vertex)) | **Simplest**: one service account, one key, two env vars | Google: keys "can become a security risk … You should choose a more secure alternative for authentication whenever possible" (threats: leakage, privilege escalation). Key creation is blocked by default only for *organizations* created on or after 2024-05-03 ([SA key best practices](https://docs.cloud.google.com/iam/docs/best-practices-for-managing-service-account-keys), accessed 2026-10-28). Our project has no organization, so keys can be created. |
| **Vercel OIDC + Workload Identity Federation** | Create a WIF pool and an OIDC provider with issuer `https://oidc.vercel.com/[TEAM_SLUG]`, map `google.subject` = `assertion.sub`, and let the principal `…/subject/owner:[TEAM]:project:[PROJECT]:environment:production` impersonate a service account. In code, `ExternalAccountClient.fromJSON({... subject_token_supplier: { getSubjectToken: getVercelOidcToken } })` is passed as `googleAuthOptions.authClient` ([Vercel: Connect to GCP](https://vercel.com/docs/oidc/gcp), accessed 2026-10-28; "available on all plans") | About 6 console steps and 5 env vars (`GCP_PROJECT_ID`, `GCP_PROJECT_NUMBER`, `GCP_SERVICE_ACCOUNT_EMAIL`, `GCP_WORKLOAD_IDENTITY_POOL_ID`, `GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID`) | **Recommended.** No long-lived secret, and access is scoped per Vercel project and environment. Vercel's own sample uses `createVertex` with exactly this auth client. The same `googleAuthOptions` works for `createVertexAnthropic`, because both call `new GoogleAuth({ scopes, ...options })` in the source. |

**Recommendation:** use Vercel OIDC + WIF. It is the documented, recommended path. The service account key is an acceptable stopgap for a portfolio project, provided it is stored only as a Vercel sensitive env var and rotated.

### 2.8 DPA for a personal project (question 8)

- The ToS incorporates the Cloud Data Processing Addendum by reference. ToS §5.2: "Google will only access, use, and otherwise process Customer Data in accordance with the Cloud Data Processing Addendum". The definition points to the then-current CDPA at `cloud.google.com/terms/data-processing-addendum` ([ToS](https://cloud.google.com/terms), accessed 2026-10-28).
- The CDPA "is incorporated into the Agreement(s) … between Google and Customer". It is effective on the "date on which Customer accepted, or the parties otherwise agreed to, this Addendum" ([CDPA](https://cloud.google.com/terms/data-processing-addendum), accessed 2026-10-28).
- Google's help page: "You need to opt into the CDPA only if your Google Cloud agreement does not already incorporate [it]". If an opt-in is shown, it is under IAM & Admin → Privacy & Security, where you click "Review and Accept", then "I Accept". Doing it in one project is enough ([Privacy compliance and records](https://support.google.com/cloud/answer/6329727), accessed 2026-10-28).
- **For a personal, organization-less project on the online ToS, the CDPA already applies. Opening the Privacy & Security page to confirm costs nothing.**
- The "certify European Data Protection Law applies" step is only needed if the billing address is outside EMEA (same help page).
- **Caveat for ADR scope:** under a personal Gmail account, the "Customer" in the ToS and DPA is the Teacher personally, not Chas Academy. That is the same controller issue the ADR already flags for real Students.
- CDPA §10.1: "Subject to Google's data location commitments … Customer Data may be processed in any country where Google or its Subprocessors maintain facilities." The model-processing guarantee comes from the `eu`/regional endpoint commitments in §2.3 and §2.5.

**Unrelated term worth knowing:** Service Specific Terms §20(d): Customer will not "use a Generative AI Service as part of a website … that is directed towards or is likely to be accessed by individuals under the age of 18" ([Service Specific Terms](https://cloud.google.com/terms/service-terms), accessed 2026-10-28). That is fine for adult FJS26 students, but it should be on record.

## 3. Recommended setup

**Configuration:**
- **Chat model:** `claude-haiku-5-5` via `@ai-sdk/google-vertex/anthropic`, **location `eu`** (host `aiplatform.eu.rep.googleapis.com`). The upgrade path is `claude-sonnet-5-5`, which is in the same `eu` multi-region quota family but in the Sonnet lineage bucket.
- **Embedding model:** `gemini-embedding-001` via `@ai-sdk/google-vertex`, **location `europe-west3`**, `outputDimensionality: 1024`. Use `taskType: 'RETRIEVAL_DOCUMENT'` for chunks and `'RETRIEVAL_QUERY'` for questions, and **L2-normalize in code** before storing into `vector(1024)`.
  - Why not `eu` + `gemini-embedding-2`? Swedish is not documented for it, and the pricing page still calls it Preview.
  - It is the fallback if we want a single location string. It also gives 1024 dims and is pre-normalized.
  - Whichever model wins, check it with the Swedish retrieval checks in the Evaluation Set.
- **Never** use `location: 'global'`, `GOOGLE_VERTEX_API_KEY` (express mode), grounding, Interactions models, Claude web search, or `cache_control`. Assert on startup that `location ∈ {'eu','europe-west3'}`.
- **Auth:** Vercel OIDC → WIF → a service account with `roles/aiplatform.user` only.

**Enablement steps, in order:**
1. **Billing:** confirm the project's billing account is a **Paid** account, not a Free Trial. If it is a trial, go to the console Welcome page and click **Activate** ([source](https://docs.cloud.google.com/free/docs/free-cloud-features), accessed 2026-10-28). This is the step most likely to recreate the AWS dead end.
2. **API:** enable the Agent Platform API ([console link](https://console.cloud.google.com/apis/enableflow?apiid=aiplatform.googleapis.com), from [use-claude](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/claude/use-claude), accessed 2026-10-28).
3. **IAM for the human enabling the model** ([Partner models](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/use-partner-models), accessed 2026-10-28):
   ```bash
   gcloud projects add-iam-policy-binding PROJECT_ID \
     --member=user:OWNER_EMAIL --role=roles/consumerprocurement.entitlementManager
   gcloud projects add-iam-policy-binding PROJECT_ID \
     --member=user:OWNER_EMAIL --role=roles/aiplatform.user
   ```
4. **Model Garden:** open the [Claude Haiku 5.5 card](https://console.cloud.google.com/agent-platform/publishers/anthropic/model-garden/claude-haiku-5-5) → **Enable** and accept Anthropic's terms there. **Do not** consent to the Advanced AI Safety Addendum. The `gemini-embedding-001` model needs no Model Garden enablement in the docs I read.
5. **Quotas:** open [Quotas & System Limits](https://console.cloud.google.com/iam-admin/quotas) and filter `anthropic-claude-haiku` (eu multi-region metrics) and `gemini-embedding`. Record the actual values. If any is 0, request an increase now (§2.4).
6. **Turn off all caching** (exact commands from the [ZDR page](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention), accessed 2026-10-28; needs `roles/aiplatform.admin`):
   ```bash
   gcloud config set project PROJECT_ID
   curl -X PATCH \
     -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
     -H "Content-Type: application/json" \
     https://us-central1-aiplatform.googleapis.com/v1/projects/PROJECT_ID/cacheConfig \
     -d '{
       "name": "projects/PROJECT_ID/cacheConfig",
       "disableCache": true
     }'
   # Verify. Expected: {"name": "projects/PROJECT_ID/cacheConfig", "disableCache": true}
   curl -X GET \
     -H "Authorization: Bearer $(gcloud auth application-default print-access-token)" \
     -H "Content-Type: application/json" \
     https://us-central1-aiplatform.googleapis.com/v1/projects/PROJECT_ID/cacheConfig
   ```
7. **Verify request-response logging is not enabled.** The documented pattern from [Request-response logging](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/capabilities/request-response-logging) (accessed 2026-10-28) is `GET https://LOCATION-aiplatform.googleapis.com/v1beta1/projects/PROJECT_ID/locations/LOCATION/publishers/PUBLISHER/models/MODEL:fetchPublisherModelConfig`.
   - For Claude on `eu`, the matching multi-region host would be the one below. **That host substitution is my inference, not shown verbatim in the docs.** If it errors, check in the console instead.
     ```bash
     curl -X GET -H "Authorization: Bearer $(gcloud auth print-access-token)" \
       "https://aiplatform.eu.rep.googleapis.com/v1beta1/projects/PROJECT_ID/locations/eu/publishers/anthropic/models/claude-haiku-5-5:fetchPublisherModelConfig"
     ```
   - Expected: no `loggingConfig`, or `"enabled": false`.
8. **Leave Data Access audit logs off** for the Agent Platform API, which is the default.
9. **Runtime identity:** create a service account (e.g. `socratease-vercel`) and grant it `roles/aiplatform.user` only. Then set up the WIF pool and provider and the impersonation binding exactly as in [Vercel: Connect to GCP](https://vercel.com/docs/oidc/gcp) (accessed 2026-10-28). Add the five `GCP_*` env vars to the Vercel project.
10. **Smoke test** from a local shell, using the call from [Partner models](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/use-partner-models) with `LOCATION=eu`, `ENDPOINT=aiplatform.eu.rep.googleapis.com` and `MODEL_ID=claude-haiku-5-5`, `anthropic_version: "vertex-2023-10-16"`. Then run one `gemini-embedding-001` call at `europe-west3` with `outputDimensionality: 1024`, and confirm that the vector length is 1024.
11. **DPA:** open IAM & Admin → Privacy & Security. If "Review and Accept" is shown for the CDPA, accept it.

Code sketch (package versions checked on npm on 2026-10-28: `ai` 7.0.155, `@ai-sdk/google-vertex` 5.0.125, `@vercel/oidc` 4.0.4, `google-auth-library` 11.3.1):
```ts
import { getVercelOidcToken } from '@vercel/oidc';
import { ExternalAccountClient } from 'google-auth-library';
import { createVertex } from '@ai-sdk/google-vertex';
import { createVertexAnthropic } from '@ai-sdk/google-vertex/anthropic';

const authClient = ExternalAccountClient.fromJSON({ /* exactly as in vercel.com/docs/oidc/gcp */ });
const googleAuthOptions = { authClient, projectId: process.env.GCP_PROJECT_ID };

const claude = createVertexAnthropic({ project: process.env.GCP_PROJECT_ID, location: 'eu', googleAuthOptions });
const vertexEmbed = createVertex({ project: process.env.GCP_PROJECT_ID, location: 'europe-west3', googleAuthOptions });

export const chatModel = claude('claude-haiku-5-5');
export const embeddingModel = vertexEmbed.embeddingModel('gemini-embedding-001');
// embed(..., { providerOptions: { vertex: { outputDimensionality: 1024, taskType: 'RETRIEVAL_DOCUMENT' } } })
// then L2-normalize before insert.
```
The `embeddingModel` method name and the `vertex` provider-options key come from the package source (it also accepts `googleVertex` and `google`). Confirm them against the AI SDK docs when implementing.

## 4. Open questions

1. **Does regime (a) abuse logging (90 days, human review) apply to Claude Haiku 5.5 on Vertex?** Google's ZDR page scopes it to "Google models". The abuse page says the abuse systems also enforce Anthropic's terms. Only Google can settle this, through Cloud support or the account team. Until then, assume yes.
2. **Is there any route to an exemption without a Master Agreement?** None is documented. A Master Agreement implies a sales process, which conflicts with "self-serve".
3. **What does this project actually get for quotas?** We need the real `anthropic-claude-haiku` eu multi-region values and the billing account type (Paid or Free Trial). Only the console shows these.
4. **Is `gemini-embedding-001` really unavailable on `eu`?** The availability table says not available; the residency table says EU-multi-region processing. Test with one call. If `eu` works, everything can use one location.
5. **Is the `gemini-embedding-001` price unit tokens or characters?** The pricing page says "count". Check the SKU on the first invoice.
6. **Does gemini-embedding-001 accept more than one input per request?** The SDK sends up to 250 per call; one doc sentence says "a single input text". Test this. If it fails, set `maxParallelCalls` or batch to 1.
7. **Does gemini-embedding-2 support Swedish?** It is not documented. It is also unclear why the pricing page still says Preview while the model page says GA.
8. **Can `constraints/gcp.restrictEndpointUsage` be applied to a project with no organization?** Not found. We rely on the code-level guard instead.
9. **What are the retention terms for Claude prompt caching and the web search tool on Vertex?** Not found. We avoid both.
10. **What exactly does the Model Garden "Enable" dialog for Claude make you accept?** The docs don't reproduce it. Record the terms shown at enablement time.
11. **Controller:** the ToS and DPA are with the Teacher personally. Before real Students are let in, Chas must accept this, or the account must move to Chas. This is unchanged from ADR 0006.
