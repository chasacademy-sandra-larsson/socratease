# SocratEase

En sokratisk kursassistent för yrkeshögskoleutbildningen Fullstack JavaScript/TypeScript på Chas Academy. Studenter ställer frågor om kursen, och SocratEase svarar **bara utifrån kursmaterialet i Notion**, med länkar till källan. Klistrar en student in kod får den ledande frågor i stället för en lösning, och en inlämningsuppgift löses aldrig.

Projektet drivs som ett portfolioprojekt. Inga riktiga studenter släpps in förrän villkoren i [ADR 0006](docs/adr/0006-ai-provider-requirements.md) är uppfyllda.

- Ordlista med domänens begrepp: [`GLOSSARY.md`](GLOSSARY.md)
- Arkitekturbeslut (ADR): [`docs/adr/`](docs/adr/)
- Specifikation för v1: [`docs/spec-v1.md`](docs/spec-v1.md) och ärendena på GitHub

## Vad SocratEase gör

| För studenten | För läraren |
|---|---|
| Svar från **upplåst** kursmaterial, med numrerade källor och länkar till rätt avsnitt i Notion | **Lärarvy** med obesvarade frågor per vecka och kurs, frågor per ämne och mest använda källor |
| Material som inte är upplåst än: får veta **när** det kommer, inte vad det innehåller | **Synk från Notion** varje natt, och en knapp för att synka direkt |
| Inklistrad kod eller felmeddelanden: **ledande frågor** som blir mer specifika för varje tur, aldrig rättad kod | **Visa som student** för att prova appen precis som en student ser den |
| Frågor om inlämningsuppgifter: bara begrepp och hänvisningar, **aldrig en lösning** | Frågeloggen är **anonym**: ingen kan se vem som frågade |
| Säger tydligt när materialet inte tar upp något, i stället för att svara ur allmän kunskap | Personuppgifter raderas automatiskt 30 dagar efter att klassen har slutat |

## Kom igång lokalt

### Det här behöver du

- **Node.js 22** eller senare och **pnpm**
- **Docker**, för den lokala databasen
- Ett **Google OAuth-klient-id** för inloggningen (Google Cloud Console → APIs & Services → Credentials), med `http://localhost:3100/api/auth/callback/google` som tillåten adress

### Steg för steg

```sh
pnpm install
cp .env.example .env.local      # fyll i värdena, se nedan
pnpm db:up                      # startar Postgres med pgvector i Docker (port 54329)
pnpm db:migrate                 # skapar tabellerna
pnpm dev                        # http://localhost:3100
```

I `.env.local` behöver du minst:

| Inställning | Vad den är |
|---|---|
| `DATABASE_URL` | Den lokala databasen. Värdet i `.env.example` fungerar som det är |
| `AUTH_SECRET` | Krypterar inloggningen. Skapa med `openssl rand -base64 33` |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google-inloggningen |
| `TEACHER_EMAIL` | Lärarens adress, en `@chasacademy.se`-adress |
| `AI_PROVIDER` | `fake`, `local` eller `vertex`, se nedan |

### Välj AI-leverantör

| `AI_PROVIDER` | Vad som används | När |
|---|---|---|
| `fake` | En påhittad AI som listar källorna den fått, och embeddingar som räknas fram ur orden | De automatiska testerna, och för att prova gränssnittet utan AI |
| `local` | Claude via Anthropics API (`ANTHROPIC_API_KEY`) och embeddingar som körs på din egen dator | Utveckling med den **påhittade testkursen**. Får aldrig se riktigt material (ADR 0008) |
| `vertex` | Gemini på Google Vertex AI i EU | Produktion och allt riktigt kursmaterial |

För att komma igång snabbt utan Notion och utan AI-konto: sätt `AI_PROVIDER=fake` och läs in den påhittade testkursen:

```sh
pnpm seed:test-course FJS-DEMO-LOKAL
```

Logga sedan in som lärare, välj klassen och tryck på **Visa som student**.

### Med riktigt material från Notion

1. Skapa en **intern integration** på notion.so/profile/integrations i det workspace där materialet finns. Ge den bara **Read content** och **No user information**.
2. Ge den tillgång till **bara rotsidan** för klassen, via integrationens flik Access eller sidans ••• → Connections.
3. Lägg nyckeln i `.env.local` som `NOTION_TOKEN`.
4. Sätt `AI_PROVIDER=vertex` och `GCP_PROJECT_ID`, och logga in hos Google med `gcloud auth application-default login`.
5. Synka. Rotsidans id behövs bara första gången:

```sh
pnpm sync FJS26 3c389e315a7081598a0ef61addbcb228
```

## Tekniker och varför

| Teknik | Används till | Varför |
|---|---|---|
| **Next.js 16** (App Router, Cache Components) | Gränssnitt, API och schemalagda jobb i samma kodbas | En enda TypeScript-kodbas för allt. Serverkomponenter läser databasen direkt, och sidornas fasta delar byggs i förväg medan data hämtas per besök |
| **TypeScript** | All kod | Typerna fångar fel tidigt, och domänens begrepp (källa, pass, uppgift) blir typer som kompilatorn kontrollerar |
| **Vercel AI SDK 7** | Strömmande svar, strukturerade AI-bedömningar och embeddingar | Ett gränssnitt för alla AI-leverantörer, så att bytet från Claude till Gemini blev en liten ändring. Har också fejkade modeller för testerna |
| **Gemini 3.5 Flash-Lite** och **gemini-embedding-001** på **Vertex AI**, EU | Svaren och sökningen i materialet | Uppfyller kraven i ADR 0006: ingen träning på frågorna, ingen lagring, bearbetning i EU och ingen kvotansökan. Kostar ungefär 0,04 kr per fråga. Claude på Vertex krävde en kvot som Google inte beviljade |
| **PostgreSQL med pgvector**, hos **Neon** i EU | Kursmaterial, embeddingar, frågelogg och klasslista | En databas för både vanlig data och vektorsökning. Med ett HNSW-index går sökningen snabbt, och allt ligger i EU (ADR 0004) |
| **Drizzle ORM** | Databasschema och frågor | Schemat skrivs i TypeScript och ger typade frågor, och migreringarna blir vanliga SQL-filer som går att läsa |
| **Auth.js** med Google | Inloggning med skolans Google-konto | Studenterna har redan konton. Sessionen ligger krypterad i en cookie, så inga användartabeller behövs, och klasslistan avgör vem som får komma in |
| **Notion API**, med appens egen integration | Kursmaterialet | Notion är redan lärarens schema och material (ADR 0001). Integrationen når bara klassens rotsida, och synken söker aldrig (ADR 0007) |
| **Vitest** mot en riktig Postgres | Automatiska tester | Testerna går genom samma funktioner som appen, med en fejkad AI och en egen testdatabas. De visar vad appen gör, inte hur |
| **Utvärderingen** (`pnpm evaluate`) | Kontroll av vad den riktiga AI:n svarar | Ett fejkat test kan inte visa att Gemini aldrig skriver ut en lösning. 28 frågor körs mot den riktiga modellen, och ett enda läckage av en uppgiftslösning stoppar en release |
| **Vercel** (region `fra1`) med cron-jobb | Drift, förhandsvisning per PR och nattliga jobb | Next.js körs utan konfiguration. Varje PR får en egen förhandsvisning, och synk och radering körs som cron-jobb i stället för med en jobbkö (ADR 0005) |
| **Vercel OIDC** och **Workload Identity Federation** | Inloggning från Vercel till Google Cloud | Ingen nyckel sparas någonstans. Google litar bara på det här Vercel-projektet i produktion, och kontot får bara använda Vertex AI |
| **Tailwind CSS** | Utseende | Snabbt att bygga ett enkelt, tydligt gränssnitt utan separata stilfiler |
| **Docker Compose** och **GitHub Actions** | Lokal databas och kontroller vid varje PR | Samma Postgres med pgvector lokalt och i CI. Typkontroll, lint, migreringar, tester och bygge måste gå igenom innan merge |

## Hur koden hänger ihop

```text
src/
├── answering/      svarsfunktionen: sökning, AI-bedömning av täckning, direkt / sokratiskt / kommande / otäckt
├── unlocking/      vad som är upplåst idag (pass på sitt datum, kursmaterial när kursen startar)
├── material/       källor och textbitar (chunks), embeddingar
├── sync/           läsning från Notion: stegvis, med lås, logg och radering av borttaget material
├── question-log/   den anonyma frågeloggen; kod och hemligheter tas bort innan något sparas
├── teacher-view/   sammanställningar för lärarvyn
├── access/         inloggning, klasslista, "visa som student"
├── usage/          den dagliga gränsen per student
├── retention/      radering av personuppgifter 30 dagar efter att klassen har slutat
├── ai/             AI-leverantörerna: vertex, local och fake
├── db/             databasschema och anslutning
└── app/            sidorna och API:erna i Next.js
```

## Kommandon

| Kommando | Vad det gör |
|---|---|
| `pnpm dev` | Startar appen på http://localhost:3100 |
| `pnpm db:up` | Startar den lokala databasen (port 54329) och väntar tills den svarar |
| `pnpm db:migrate` | Kör migreringarna. På Vercel körs det som en del av bygget. Förhandsvisningar hoppar över det om inte `ALLOW_PREVIEW_MIGRATIONS=1`, så att en PR aldrig ändrar en databas som delas med produktionen |
| `pnpm db:generate` | Skapar en ny migrering utifrån schemat |
| `pnpm typecheck` | Skapar Next.js-routernas typer och kör `tsc` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest, mot en egen databas (`<namn>_test`) och med den fejkade AI:n |
| `pnpm evaluate` | Kör utvärderingen mot den riktiga AI:n, se nedan |
| `pnpm sync <klass> [<rotsida>]` | Läser in klassens kursmaterial från Notion, se nedan |
| `pnpm seed:test-course <klass>` | Läser in den påhittade testkursen i en klass |
| `pnpm roster:import <klass> <fil>` | Läser in en klasslista, en lista med adresser eller en CSV-export från Canvas |

## Utvärderingen

Utvärderingen är en fast lista med frågor om den påhittade testkursen, med det beteende som förväntas av varje svar. Frågorna finns i [`evaluation/cases.ts`](evaluation/cases.ts) och är grupperade som i specen:

1. ämnet finns i materialet → rätt källa citeras
2. ämnet finns inte i materialet → svaret säger det
3. kommande material → svaret säger när, utan att avslöja innehållet
4. inlämningsuppgift, även indirekt och efter upprepat tjat → ingen lösning
5. inklistrad buggig kod → ingen rättad kod

**Kör den före varje release, och på varje PR som ändrar hur assistenten svarar**, alltså instruktioner, sökning, uppdelning i textbitar eller AI-modell:

```sh
pnpm db:up
AI_PROVIDER=vertex pnpm evaluate     # eller AI_PROVIDER=local
```

Testkursen läses in i en egen databas (`<namn>_eval`), varje fråga ställs en gång till den riktiga AI:n, och misslyckade frågor skrivs ut med svaret och ett resultat per grupp. **Ett enda misslyckande i grupp 4 stoppar releasen**, och kommandot avslutas då med felkod 1. Misslyckanden i de andra grupperna får läraren bedöma, eftersom en riktig modells svar varierar mellan körningar.

Bara den påhittade testkursen skickas, så alla leverantörer får användas, även `local` (ADR 0008).

## Synk från Notion

`pnpm sync` läser en klass kursmaterial från Notion och gör om det till källor och textbitar:

| I Notion | Blir |
|---|---|
| *Översikt kurser* | Kurs, med period |
| Toggles under rubriken *Instudering* på kurssidan | Studiematerial, en källa per toggle, uppdelad per H3 om den är lång |
| *Schema* | Pass, med Innehåll och ifyllda callouts |
| *Examinationsmoment* | Inlämningsuppgift, en källa per H2-avsnitt |
| *Kursmål och Betygskriterier* | Kursmål med G och VG |

Synken läser **bara** under klassens rotsida, via SocratEase egen Notion-integration. Den går nedåt från roten, söker aldrig och följer aldrig länkar (ADR 0007). Riktigt material skickas bara till `vertex`, så kommandot vägrar med andra leverantörer (ADR 0008). Pass som bara innehåller mallens platshållartext läses inte in, utan listas som "inte ifyllda".

**När behöver den köras?** Synken läser allt som är ifyllt, även pass flera veckor fram. Varje källa sparas med sitt upplåsningsdatum, och vid varje fråga jämförs det med dagens datum. Kommande material låses alltså upp av sig självt på sin dag. Synka bara när du har ändrat något i Notion.

**Stegvis (ADR 0005).** Synken läser bara sidor som har ändrats sedan förra körningen, och tar bort källor för sidor och avsnitt som har raderats i Notion. En körning läser högst 25 sidor, så den första synken av en klass tar flera körningar. `pnpm sync` fortsätter tills allt är klart, och en körning utan ändringar tar några sekunder. Varje körning sparas i synkloggen (`sync_runs`), som visas i lärarvyn.

**På Vercel** anropar ett cron-jobb `/api/sync` varje natt kl. 02.00 UTC, och läraren kan trycka på **Synka nu** i lärarvyn.

## Radering av personuppgifter

Ett cron-jobb anropar `/api/retention` varje natt kl. 04.00 UTC, efter synken. Det raderar **frågeloggen och klasslistan** för klasser som slutade för mer än 30 dagar sedan, och räknarna för den dagliga gränsen från tidigare dagar (ADR 0003). Kursmaterialet ligger kvar.

Klassens slutdatum sätts av synken, från slutet på den sista kursens period i Notion. Synken flyttar **aldrig** slutdatumet bakåt i tiden, eftersom det skulle låsa ute studenterna och radera deras uppgifter. I stället rapporteras ett fel. Lärarvyn visar slutdatumet och vilken natt raderingen sker.

## Produktion

Appen körs på Vercel i Frankfurt (`fra1`), med Postgres och pgvector hos Neon i EU (ADR 0004). Produktionen driftsätts automatiskt från `main`.

Vercel loggar in hos Google Cloud **utan sparad nyckel**. Vercels OIDC-intyg byts via Workload Identity Federation mot tjänstekontot `socratease-vercel`, som bara får använda Vertex AI. Utöver databasen och inloggningen behöver produktionen:

| Inställning | Typ |
|---|---|
| `AI_PROVIDER=vertex`, `GCP_PROJECT_ID`, `GCP_PROJECT_NUMBER`, `GCP_WORKLOAD_IDENTITY_POOL_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER_ID`, `GCP_SERVICE_ACCOUNT_EMAIL` | Vanliga värden |
| `NOTION_TOKEN`, `CRON_SECRET`, `USAGE_KEY_SECRET` | Hemligheter |

Den första synken till produktionsdatabasen körs lokalt med produktionens `DATABASE_URL`. Därefter sköter cron-jobbet och knappen i lärarvyn resten.

## Arbetssätt

- **En gren per ärende**, med namnet `<nummer>-<kort-beskrivning>`, alltid från en uppdaterad `main`.
- **Aldrig direkt till `main`.** Allt går via en pull request som läraren granskar och mergar med squash.
- **CI måste gå igenom:** typkontroll, lint, migreringar, tester och bygge. PR:er som ändrar hur assistenten svarar måste också klara utvärderingen.
