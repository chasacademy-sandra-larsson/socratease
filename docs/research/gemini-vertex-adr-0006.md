# Gemini på Vertex AI mot ADR 0006 (ersättare för Claude Haiku som chattmodell)

Alla källor nedan lästes **2026-10-28**. Bara primärkällor: Google Clouds dokumentation, Google Clouds villkor, Googles prissida och AI SDK:s dokumentation och källkod i `node_modules/@ai-sdk/google-vertex` (5.0.123, som är installerad). Där en källa är tyst eller tvetydig står det här, i stället för att luckan fylls i.

> **Namnnotis.** Vertex AI heter nu **Gemini Enterprise Agent Platform**. Gamla `cloud.google.com/vertex-ai/...`-adresser omdirigeras till `docs.cloud.google.com/gemini-enterprise-agent-platform/...`. API-värdnamnen är oförändrade. "Vertex" betyder den plattformen här, precis som i `vertex-ai-adr-0006.md`.

> **Metodnotis.** Tillgänglighetstabellerna på Googles sidor ritas med ikoner (`compare-yes`) i tomma celler. En AI-sammanfattning av sidan påstod felaktigt att alla Gemini-modeller finns i alla europeiska regioner. Tabellerna nedan är därför tolkade direkt ur sidornas HTML, cell för cell.

## 1. Utlåtande

Frågan: kan vi byta chattmodell från Claude Haiku 5.5 (kvot 0, Google vägrar höja) till en Gemini-modell på Vertex i EU, **utan kvotansökan**, och fortfarande uppfylla ADR 0006?

**Svar: ja.** Gemini-modellerna är Googles egna, körs på Standard PayGo utan per-projekt-kvot och finns på `eu`-multiregionen med EU-garanterad ML-bearbetning. Kraven uppfylls på samma nivå som Claude-beslutet, med samma accepterade undantag (abuse-loggning).

| # | ADR 0006-krav | Utlåtande | Varför |
|---|---|---|---|
| 1 | Ingen träning på datan | ✅ | Service Specific Terms §18: "Google will not use Customer Data to train or fine-tune any AI/ML models without Customer's prior permission or instruction." ZDR-sidan: gäller "all managed models … including GA and pre-GA models". |
| 2 | Noll datalagring | ⚠️ (samma som idag) | Caching stängs av per projekt, request-response-loggning är av som standard, grounding och Interactions API undviks. **Abuse-monitoringens promptloggning (upp till 90 dagar vid flaggning, mänsklig granskning möjlig) går inte att stänga av självbetjänt.** För Gemini är det dessutom *otvetydigt* att regimen gäller – för Claude var det oklart. Det är exakt det undantag ADR:en redan accepterat för portfoliofasen. |
| 3 | Bearbetning inom EU | ✅ | `gemini-3.5-flash-lite`, `gemini-3.5-flash`, `gemini-3.6/3.7/3.8-flash` och `gemini-3.1-flash-lite` finns på `eu`-multiregionen med "EU multi-region" ML-bearbetning. `eu` täcker endast EU:s medlemsstater. |
| 4 | Inga personuppgifter utöver vad studenten skriver | ✅ (genom design) | Oförändrat: API:t kräver inga slutanvändar-ID:n. Skicka inga. |
| – | DPA (Cloud Data Processing Addendum) | ✅ (bättre än Claude) | Gemini är en Google-tjänst, inte en "Separate Offering". CDPA gäller direkt via ToS; inga Anthropic-villkor är inblandade. Kontrollant-frågan (personligt konto, inte Chas) kvarstår som i ADR:en. |
| – | Kvot utan ansökan | ✅ (med reservation) | Gemini 3.x Flash/Flash-Lite körs på **Standard PayGo**: "Fixed quota: Not supported". Ingen kvot att ansöka om och ingen Provisioned Throughput krävs. Reservation: dokumentationen säger inget om konton under $10 i 30-dagarsutgift (lägsta tier), och `eu` är en separat kapacitetspool med högre risk för 429. |

**Rekommendation:** byt chattmodell till **`gemini-3.5-flash-lite` på location `eu`**. Behåll `gemini-embedding-001` i `europe-west3`. Uppgraderingsväg om Evaluation Set visar att kvaliteten inte räcker: `gemini-3.5-flash` (samma `eu`), därefter `gemini-3.8-flash`. Billigare alternativ: `gemini-3.1-flash-lite`. Detaljer i §3.

## 2. Fynd

### 2.1 Datahemvist: vilka Gemini-modeller finns i EU? (fråga 1)

**Två olika tabeller, två olika frågor.** [Deployments and endpoints](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/locations) säger *vilket värdnamn som serverar modellen*. [Data residency](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/data-residency) säger *var ML-bearbetningen garanterat sker*. Endpoint-sidan varnar själv: "Endpoints don't guarantee data residency or in-region ML processing."

**Endpoint-tillgänglighet** (tolkad ur HTML:en till [Deployments and endpoints](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/locations), lästa 2026-10-28). Bara text-Gemini; bild-, TTS-, Live-, Cyber- och Omni-varianter är utelämnade.

| Modell (ID) | `global` | `eu` | EU-regioner |
|---|---|---|---|
| Gemini 4 Argon (`gemini-4-argon`) | ✅ | ✅ | (bara `europe-west2` London, utanför EU) |
| Gemini 3.8 Flash (`gemini-3.8-flash`) | ✅ | ✅ | – |
| Gemini 3.7 Flash (`gemini-3.7-flash`) | ✅ | ✅ | – |
| Gemini 3.6 Flash (`gemini-3.6-flash`) | ✅ | ✅ | – |
| Gemini 3.5 Flash-Lite (`gemini-3.5-flash-lite`) | ✅ | ✅ | – |
| Gemini 3.5 Flash (`gemini-3.5-flash`) | ✅ | ✅ | `europe-west3` (och `europe-west2`, utanför EU) |
| Gemini 3.1 Flash-Lite (`gemini-3.1-flash-lite`) | ✅ | ✅ | – |
| Gemini 3.1 Pro preview (`gemini-3.1-pro-preview`) | ✅ | ❌ | ❌ → **bara `global`** |
| Gemini 3 Flash preview (`gemini-3-flash-preview`) | ✅ | ❌ | ❌ → **bara `global`** |
| Gemini 2.5 Pro / Flash / Flash-Lite | ✅ | ❌ | flera EU-regioner, men **pensionerade 2026-10-20** (se nedan) |

**ML-bearbetning** (tolkad ur HTML:en till [Data residency → Google models](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/data-residency), lästa 2026-10-28):

| Modell | EU multi-region | Tyskland (`europe-west3`) |
|---|---|---|
| `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash` | ✅ | – |
| `gemini-3.5-flash-lite` | ✅ | – |
| `gemini-3.5-flash` | ✅ | ✅ |
| `gemini-3.1-flash-lite` | ✅ | – |
| `gemini-embedding-001` (det vi redan använder) | ✅ | – |

Modellsidorna bekräftar samma sak i sina "Supported regions"-rutor ([3.5 Flash-Lite](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash-lite), [3.5 Flash](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash), [3.8 Flash](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-flash), [3.1 Flash-Lite](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-1-flash-lite), lästa 2026-10-28). Till exempel 3.5 Flash-Lite: "Model availability: Global; Multi-region: us, eu; Asia Pacific: asia-south1. ML processing: Multi-region: us, eu …".

**Vad `eu` lovar** ([Data residency](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/data-residency), läst 2026-10-28):
- "Jurisdictional multi-region endpoints: When you use jurisdictional endpoints, ML processing stays within that specific geographical region (such as the United States or the European Union)."
- "The European Union multi-region (`eu`) endpoint strictly covers data residency within EU member states. Geographies outside the European Union political boundary, including the United Kingdom and Switzerland, are excluded from this endpoint."
- `global`: "may be processed in any Google Cloud location around the world, and therefore don't provide any data residency guarantees." Endpoint-sidan: "Don't use the global endpoint if you have ML processing requirements."
- Värdnamn: `https://aiplatform.eu.rep.googleapis.com` ([Deployments and endpoints, Multi-region endpoints](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/locations)).

**Fälla 1: `gemini-3.5-flash` i `europe-west3` är bara Provisioned Throughput.** Modellsidan listar `europe-west3` under "Model availability", "ML processing" och "Provisioned Throughput", men "Standard PayGo" bara som "Global: global; Multi-region: us, eu" ([3.5 Flash](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash), läst 2026-10-28). Utan köpt kapacitet ska vi alltså använda `eu`, inte Frankfurt. Detsamma gäller alla rekommenderade modeller: Standard PayGo finns på `global`, `us` och `eu`.

**Fälla 2: Gemini 2.5 är pensionerad.** "Important: This model is being retired on October 20th, 2026" och "Retirement date†: October 20, 2026" på både [2.5 Flash](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/2-5-flash) och [2.5 Flash-Lite](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/2-5-flash-lite) (lästa 2026-10-28). Trots att de finns i många EU-regioner och är billigast ska de inte väljas.

### 2.2 Ingen träning, datalagring och abuse-loggning (fråga 2)

**Träning.**
- Service Specific Terms §18 "Training Restriction": "Google will not use Customer Data to train or fine-tune any AI/ML models without Customer's prior permission or instruction." ([Service Specific Terms](https://cloud.google.com/terms/service-terms), läst 2026-10-28; "Last modified October 27, 2026").
- ZDR-sidan: "This applies to all managed models on Gemini Enterprise Agent Platform, including GA and pre-GA models." ([Agent Platform and zero data retention](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention), läst 2026-10-28).

**Implicit caching (in-memory och durable)** ([ZDR](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention), läst 2026-10-28):
- "By default, Google's published Gemini models cache Customer Data to reduce latency and accelerate responses." Båda nivåerna är "Enabled by default for supported Gemini models". 3.5 Flash-Lite listar "Implicit context caching, explicit context caching: Supported" ([modellsida](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash-lite)).
- In-memory: "stored only in memory, not at rest", "deleted no later than 24 hours after it's written", "processed in the region that serves the request", "never used to train or fine-tune models".
- Durable: "stored at rest", raderas inom 24 timmar, "stays within the selected location … when you use a regional or multi-regional endpoint".
- Avstängning: "Turning off caching disables both in-memory caching and durable caching. When you disable or re-enable caching, the change applies to all Google Cloud regions." Det är samma `cacheConfig`-PATCH med `"disableCache": true` som redan står i ADR:en och i `vertex-ai-adr-0006.md` §3 steg 6. **Det här är nu viktigare än med Claude**, eftersom implicit caching faktiskt gäller Gemini-anrop. Verifiera med GET att svaret innehåller `"disableCache": true`.
- Explicit caching (`cachedContents`) skapar vi aldrig, och AI SDK gör det bara om man anger `cachedContent` ([AI SDK-dokumentationen](node_modules/@ai-sdk/google-vertex/docs/16-google-vertex.mdx), avsnittet "Cached Content").

**Abuse-monitoring – skiljer det sig från Claude?** ([Abuse monitoring](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/abuse-monitoring), läst 2026-10-28; "Last updated 2026-10-28 UTC")
- Gemini 3.x Flash/Flash-Lite hör till regimen **"Google models not designated as 'Google Frontier Models' or 'Advanced AI'"**. "Google Frontier Models" omfattar bara "Gemini 4 Argon (Cyber Permissive)". "Advanced AI" omfattar bara Claude Mythos, Fable och Claude i CVP.
- Innehåll: "If automated safety classifiers detect suspicious activity … then Google may log customer prompts solely for the purpose of examining whether a violation of the AUP or Prohibited Use Policy has occurred. This data won't be used to train or fine-tune any AI/ML models. This data is stored securely for up to 90 days in the same region or multi-region selected by the customer for their project …" och "Authorized Google employees may assess the flagged prompts".
- Omfattning: "Only customers whose use of Google Cloud is governed by the Google Cloud Platform Terms of Service. This means that customers with a Google Cloud Master Agreement are exempt". Juridisk grund: ToS §4.3 "Google may log Customer prompts solely for the purpose of reviewing and determining whether a violation has occurred" ([Google Cloud Terms of Service](https://cloud.google.com/terms), läst 2026-10-28; "Last modified October 12, 2026").
- ZDR-sidan rubricerar det "Prompt logging for abuse monitoring **for Google models**".

**Jämförelse med det ADR:en accepterade:** exakt samma regim (a) – samma 90 dagar, samma lagring i vald (multi)region, samma mänskliga granskning, samma enda undantag (Master Agreement). Skillnaden är att det för Claude var *tvetydigt* om regimen gällde (se `vertex-ai-adr-0006.md` §2.2), medan det för Gemini är *otvetydigt*. Exponeringen ändras alltså inte i sak. ADR-undantaget täcker det redan ("Vertex's abuse monitoring logs prompts that Google's classifiers flag … 90 days … the project's region"). Embedding-anropen var redan i samma regim.

**Finns ett ZDR-alternativ?** Inget självbetjänt. Abuse-sidan nämner bara Master Agreement som undantag, och ZDR-sidan beskriver ingen annan väg ([ZDR](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention)). En Master Agreement är ett offline-avtal, alltså en säljprocess. Samma läge som för Claude.

**Funktioner att undvika** ([ZDR](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/zero-data-retention), läst 2026-10-28):
- **Grounding with Google Search:** loggar sparas "for up to three (3) days … There is no way to disable the storage". ZDR-sidan rekommenderar "Web Grounding for Enterprise" om man behöver webbgrounding; vi behöver ingen.
- **Grounding with Google Maps:** 30 dagar, går inte att stänga av.
- **Interactions API:** "If you do not specify a value for store, it defaults to true for all models." Använd inte `vertex.interactions(...)` i AI SDK. Vanliga `vertex('…')` går mot `generateContent` (`GoogleLanguageModel` i `dist/index.js`; `provider.interactions` är en separat fabrik).
- **Request-response logging:** "disabled by default … To achieve zero data retention, do not enable this feature." Konfigureras per modell och projekt, så den är av även för de nya Gemini-modellerna om ingen slår på den.
- **Gemini Live session resumption**, Deep Research, CodeMender och Sandbox-snapshots: används inte.
- **AI SDK express mode** (`apiKey` / `GOOGLE_VERTEX_API_KEY`): i 5.0.123 är `EXPRESS_MODE_BASE_URL = "https://aiplatform.googleapis.com/v1/publishers/google"`, alltså `global`-värden oavsett location (`node_modules/@ai-sdk/google-vertex/dist/index.js`, rad 1252 och 1297).
- Verktyg i AI SDK som `googleVertex.tools.googleSearch`, `googleMaps` och `urlContext` ska inte användas.

### 2.3 DPA och övriga villkor (fråga 3)

- Gemini Enterprise Agent Platform API är en listad tjänst: "Gemini Enterprise Agent Platform API (formerly Vertex AI API) enables customers to access generative AI foundation models via an API", under "Generative AI Services" ([Services summary](https://cloud.google.com/terms/services), läst 2026-10-28).
- ToS §5.2 hänvisar till CDPA för all behandling av Customer Data ([ToS](https://cloud.google.com/terms), läst 2026-10-28); CDPA:n är inkorporerad i avtalet ([CDPA](https://cloud.google.com/terms/data-processing-addendum), läst 2026-10-28; "Last modified June 8, 2026").
- **Skillnad mot Claude:** Claude är en "Separate Offering" som styrs av Anthropics Commercial Terms ([Abuse monitoring, "Partner-specific terms"](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/abuse-monitoring)). Gemini är Googles egen modell, så avtalskedjan blir kortare: bara Google ToS + Service Specific Terms + CDPA. Ingen Model Garden-"Enable" och inga partnervillkor.
  - Att Google-modeller inte kräver Model Garden-aktivering är **min slutsats**: aktiveringssteget och rollen `consumerprocurement.entitlementManager` beskrivs bara för partnermodeller ([Partner models](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/partner-models/use-partner-models)). Det bekräftas av att `gemini-embedding-001` redan fungerar i projektet utan aktivering.
- **Kontrollanten** är fortfarande läraren personligen (personligt Gmail-konto). Oförändrat från ADR:ens "Scope"-avsnitt.
- **Åldersgräns,** Service Specific Terms §20(d): "Customer will not, and will not allow End Users to, use a Generative AI Service as part of a website … that is directed towards or is likely to be accessed by individuals under the age of 18" ([Service Specific Terms](https://cloud.google.com/terms/service-terms), läst 2026-10-28). Gäller Gemini precis som Claude; FJS26-studenterna är vuxna.

### 2.4 Kvot: behövs någon ansökan? (fråga 4)

**Kort svar: nej.** Gemini 3.x Flash och Flash-Lite har ingen fast per-projekt-kvot.

- Varje modellsida (t.ex. [3.5 Flash-Lite](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash-lite)) listar under "Consumption options": "Pay-as-you-go: Standard PayGo with Usage Tiers, Flex PayGo, Priority PayGo – Supported" och "**Fixed quota: Not supported**". Provisioned Throughput är "Supported" men krävs inte.
- [Throughput quota](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/resources/throughput-quota) (läst 2026-10-28): "For the default pay-as-you-go model, Agent Platform uses Standard pay-as-you-go (Standard PayGo)."
- [Generative AI quotas and system limits](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/quotas) (läst 2026-10-28) listar per-projekt-kvoter för embeddings, Agent Runtime, multimodal input osv. – **inga** token- eller anropskvoter för Gemini-textgenerering. (Termen "Dynamic Shared Quota" används inte längre i dokumentationen; Standard PayGo med usage tiers är dess efterföljare.)

**Hur Standard PayGo fungerar** ([Standard PayGo](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/standard-paygo), läst 2026-10-28; "Last updated 2026-10-28 UTC"):
- "Standard PayGo lets you pay only for the resources that you consume, without requiring upfront financial commitments."
- Usage tiers sätter en *prioriterad* tröskel, inte ett tak: "Your traffic isn't strictly capped at your tier's TPM threshold. When spare shared capacity is available, Agent Platform serves traffic that exceeds this threshold opportunistically."
- Tiers för "Gemini Flash and Flash-Lite models": Tier 1 vid $10–$250 i 30-dagarsutgift = 2 000 000 TPM (org-nivå), Tier 2 $250–$2 000 = 4 000 000 TPM, osv. Tiern höjs automatiskt.
- "If you receive a 429 error, it doesn't indicate that you've hit a fixed quota. It indicates temporary high contention for a specific shared resource." Rekommendation: exponentiell backoff.
- Modellerna som stöder Standard PayGo med usage tiers inkluderar Gemini 3.8 Flash, 3.7 Flash, 3.6 Flash, 3.5 Flash-Lite, 3.5 Flash och 3.1 Flash-Lite. "These tiers don't apply to preview models."

**Reservationer för ett nytt eller nyligen uppgraderat konto:**
1. **Under $10 i 30-dagarsutgift** (vårt läge) täcks inte av någon tier i tabellen. Sidan säger inte vad som gäller då. Läsningen som stämmer med texten är att all trafik då är "excess burst traffic" som serveras när det finns ledig kapacitet och stryps först vid hög belastning. Det är en tolkning; **verifiera med ett riktigt anrop** och läs av tiern på Agent Platform Dashboard (kräver `roles/aiplatform.viewer` och `roles/billing.viewer`, enligt samma sida).
2. **`eu` är en egen kapacitetspool:** "The throughput thresholds apply to requests sent to the global endpoint … Multi-region endpoints … operate from separate regional capacity pools and don't share the global endpoint's worldwide throughput capacity." Risken för 429 är högre än på `global`, men vi får ändå inte använda `global`. Lägg in retry med backoff (AI SDK:s `maxRetries`, standard 2).
3. **Free Trial:** den gamla begränsningen gällde partnermodeller ("You can't access or use the $300 credit for a generative AI partner model that is offered as a managed API") och att man under Free Trial inte kan "Request a quota increase" eller "Use Google Cloud Marketplace" ([Free Trial features](https://docs.cloud.google.com/free/docs/free-cloud-features), läst 2026-10-28). Ingen av dem rör Gemini på Standard PayGo. Efter uppgradering finns "remaining credit … available for use on products and services covered by the Free Trial"; Gemini på Vertex är inte undantaget i texten, så kvarvarande kredit bör kunna täcka anropen (min läsning, inte uttryckligt).
4. **Organisationsnivå:** tiers räknas per organisation. Projektet har ingen organisation; sidan säger inte hur det hanteras. Samma öppna fråga som punkt 1.

### 2.5 Praktiskt: modeller, priser, svenska och kodändring (fråga 5)

**Kandidater** (alla GA, alla på `eu` med EU-bearbetning, alla Standard PayGo). Priser i USD per 1M tokens, kolumnen "Non-global" (gäller `eu`), kontext ≤ 200K ([Pricing → Gemini 3](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing), läst 2026-10-28). Releasedatum och pensionering från respektive modellsida.

| Modell | Input | Output (inkl. reasoning) | Cachad input | Release | Pension tidigast | Kommentar från Google |
|---|---|---|---|---|---|---|
| `gemini-3.1-flash-lite` | $0.275 | $1.65 | $0.0275 | 2026-05-07 | 2027-05-07 | "our most cost-efficient Gemini model"; "Aims to match 2.5 Flash performance" |
| **`gemini-3.5-flash-lite`** | **$0.33** | **$2.75** | $0.033 | 2026-07-21 | 2027-07-21 | "a suitable replacement model for Gemini 2.5 Flash and less complex Gemini 3 Flash workloads"; "precise document understanding" |
| `gemini-3.5-flash` | $1.65 | $9.90 | $0.165 | 2026-05-19 | 2027-05-19 | "near-Pro intelligence at Flash-tier cost" |
| `gemini-3.6/3.7/3.8-flash` | $0.825 (t.o.m. 2026-12-31), sedan $1.65 | $4.125, sedan $8.25 | – | 3.8: 2026-09-02 | 3.8: 2027-09-02 | 3.8: "our most intelligent workhorse model yet" |
| *Jämförelse: `claude-haiku-5-5` på `eu`* | *$0.11* | *$0.55* | | | | *från `vertex-ai-adr-0006.md`* |

Fotnot på prissidan: "For non-global endpoints, pricing will go into effect for the Generally available Gemini 3 and later families of all Google models starting on July 1, 2026." Alltså gäller Non-global-priset nu. Det är 10 % över Global ($0.30/$2.50 för 3.5 Flash-Lite).

**Kostnadsexempel** för `gemini-3.5-flash-lite` på `eu`: en fråga med ~8 000 tokens kursmaterial plus samtal in och ~500 tokens ut ≈ 8 000 × 0.33/1M + 500 × 2.75/1M ≈ **$0.004 per fråga**. Thinking-tokens debiteras som output. 3.5 Flash-Lite har "minimal thinking" som standard, så de blir få om vi inte höjer nivån. Gemini är alltså ungefär 3–5 gånger dyrare per token än Haiku 5.5, men i portfoliofasen handlar det om ören.

**Svenska.** "All Gemini models can understand the following languages. Gemini models that are capable of text responses can also respond in these languages: … Swedish (sv) …" ([Google models → Language support](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/google-models), läst 2026-10-28). Det är ett påstående om stöd, inte om kvalitet. Google publicerar ingen svensk kvalitetsmätning per modell. Kvaliteten avgörs av Evaluation Set.

**Beteendeskillnader att känna till för 3.5 Flash-Lite** ([modellsida](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash-lite), läst 2026-10-28):
- "Custom values for parameters like temperature, top-K, and top-P aren't supported. If you set a custom value for these parameters, that value will be ignored." Vår `streamText` i `src/answering/index.ts` sätter inga sådana, så det påverkar inget.
- "Custom values for frequency and presence penalty parameters aren't supported. Setting a custom value for these parameters will throw an error." Vi sätter inga.
- "API requests where the last input turn has a role of Model aren't supported." Vår sista tur är alltid `role: "user"`, så det är okej.
- "3.5 Flash-Lite defaults to minimal thinking". Om källhänvisningarna ([1]) eller "säg att materialet inte täcker frågan" brister, testa `thinkingLevel: 'low'` innan modellbyte.
- 3.8 Flash: "thinking_level="MINIMAL" is not available for 3.8 Flash" ([3.8 Flash](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-flash)).

**AI SDK** (`@ai-sdk/google-vertex` 5.0.123, `ai` 7.0.154, installerade):
- `createVertex` är ett alias för `createGoogleVertex` (`dist/index.d.ts`, export-raden).
- `location: "eu"` ger värden `aiplatform.eu.rep.googleapis.com` (`dist/index.js` rad 1303–1304: `else if (region === "eu" || region === "us") return \`aiplatform.${region}.rep.googleapis.com\``). Det är exakt Googles dokumenterade värd.
- `GoogleVertexModelId` innehåller `'gemini-3.8-flash' | 'gemini-3.7-flash' | 'gemini-3.6-flash' | 'gemini-3.5-flash' | 'gemini-3.5-flash-lite'` (`dist/index.d.ts` rad 83). `gemini-3.1-flash-lite` finns bara som `-preview` i listan, men typen tar också `(string & {})`, så GA-ID:t fungerar.
- Thinking styrs via `providerOptions.vertex.thinkingConfig.thinkingLevel` ([AI SDK-dokumentationen](node_modules/@ai-sdk/google-vertex/docs/16-google-vertex.mdx), avsnittet "Reasoning (Thinking Tokens)"). Värdena är `minimal | low | medium | high` (`@ai-sdk/google` 4.0.106, `dist/index.js` rad 807–808).

**Vad som ändras i `src/ai/vertex.ts`** (beskrivning, ingen kod är ändrad):
1. Ta bort `import { createVertexAnthropic } from "@ai-sdk/google-vertex/anthropic"` och `claude`-instansen.
2. Skapa en andra `createVertex`-instans för chatt med `location: "eu"` (`CHAT_LOCATION` är redan `"eu"`). Embeddings behåller sin egen instans i `europe-west3`, eftersom `gemini-embedding-001` inte serveras på `eu` (se `vertex-ai-adr-0006.md` §2.5). Två instanser behövs alltså fortfarande, nu båda från `createVertex`.
3. `chat: gemini("gemini-3.5-flash-lite")` i stället för `claude("claude-haiku-5-5")`.
4. Uppdatera kommentaren ("Claude on the EU multi-region endpoint" → Gemini). Kontrollen "aldrig `global`" står kvar.
5. Valfritt: om vi vill styra `thinkingLevel` behöver `AiModels` en `chatOptions` (motsvarande `embeddingOptions`), som `streamText` i `src/answering/index.ts` skickar som `providerOptions`. Gör det bara om Evaluation Set kräver det.
6. Inget nytt paket och ingen ny auth: samma projekt, samma ADC/WIF och samma `roles/aiplatform.user`.

Ungefärlig form:
```ts
const gemini = createVertex({ project, location: CHAT_LOCATION });            // "eu"
const vertex = createVertex({ project, location: EMBEDDING_LOCATION });       // "europe-west3"
return { chat: gemini("gemini-3.5-flash-lite"), embedding: vertex.embeddingModel("gemini-embedding-001"), … };
```

## 3. Rekommendation och nästa steg

**Modell:** `gemini-3.5-flash-lite` på `eu`.
- Den nyaste GA Flash-Lite-modellen, med EU-garanterad bearbetning och Standard PayGo på `eu`.
- Google beskriver den som ersättare för 2.5 Flash och enklare 3 Flash-laster, med "precise document understanding". Det passar RAG med källhänvisningar.
- Billig nog att inte spela roll i portfoliofasen. Pension tidigast juli 2027.
- **Uppgradering** om Evaluation Set underkänner: först `thinkingLevel: 'low'`, sedan `gemini-3.5-flash` (eller `gemini-3.8-flash`, som är billigare än 3.5 Flash till och med 2026-12-31). **Billigare alternativ:** `gemini-3.1-flash-lite`.
- **Använd inte:** `gemini-3.1-pro-preview` och `gemini-3-flash-preview` (bara `global`), Gemini 2.5 (pensionerad 2026-10-20), `gemini-3.5-flash` i `europe-west3` (bara Provisioned Throughput där).

**Steg:**
1. **Caching:** kontrollera att `cacheConfig` är `"disableCache": true` (GET-kommandot i `vertex-ai-adr-0006.md` §3 steg 6). Nu är det skarpt, eftersom implicit caching gäller Gemini.
2. **Röktest** från ett lokalt skal: `POST https://aiplatform.eu.rep.googleapis.com/v1/projects/PROJECT_ID/locations/eu/publishers/google/models/gemini-3.5-flash-lite:generateContent` (mönstret från [Deployments and endpoints](https://docs.cloud.google.com/gemini-enterprise-agent-platform/resources/locations), REST-exemplet under "Multi-region endpoints"). Väntat: 200, inte 403/429.
3. **Request-response logging:** verifiera att den är av för den nya modellen (`fetchPublisherModelConfig`, mönster i `vertex-ai-adr-0006.md` §3 steg 7, med `publishers/google/models/gemini-3.5-flash-lite`).
4. **Kod:** ändringen i §2.5 och retry med backoff mot 429.
5. **Evaluation Set:** kör hela, inklusive svenska frågor och läckage-kontrollen för inlämningsuppgifter, innan PR:en mergas (enligt CLAUDE.md).
6. **ADR 0006:** uppdatera "Decision"-avsnittet. Chattmodellen blir `gemini-3.5-flash-lite` på `eu`, och "Accessed through" blir bara `@ai-sdk/google-vertex`. Undantaget för abuse-loggning står kvar oförändrat; det gäller nu otvetydigt. Skälet: Claude Haiku har kvot 0 och Google hänvisade till sälj.

## 4. Öppna frågor

1. **Vad gäller under $10 i 30-dagarsutgift, och för ett projekt utan organisation?** Standard PayGo-sidan börjar på Tier 1 vid $10 och räknar på organisationsnivå. Röktestet och Agent Platform Dashboard ger svaret i praktiken.
2. **Hur stor är `eu`-poolen?** Google anger inga siffror för multiregionerna. Det syns först som 429:or under belastning.
3. **Täcker kvarvarande Free Trial-kredit Gemini-anrop på Vertex?** Texten undantar bara partnermodeller och AI Studio. Kontrollera på första fakturan.
4. **Svensk kvalitet** per modell är inte dokumenterad. Evaluation Set avgör.
5. **Exakt hur abuse-klassificerarna behandlar kursmaterial** (t.ex. säkerhetsrelaterad kod i FJS26) är inte dokumenterat. Exponeringen är densamma som ADR:en redan accepterat.
6. **Kontrollanten:** avtalen är med läraren personligen. Oförändrat från ADR 0006.
