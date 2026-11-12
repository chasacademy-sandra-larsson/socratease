import { and, asc, cosineDistance, eq, gt, gte, lte, min, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { generateText, Output, streamText, type ModelMessage } from "ai";
import { z } from "zod";
import { embeddingModelId, embedTexts } from "@/ai/embed";
import type { AiModels } from "@/ai/models";
import { chunks, cohorts, sources } from "@/db/schema";
import { containsCode, logQuestion } from "@/question-log";
import { cohortToday, formatSwedishDate, isUnlocked, type IsoDate } from "@/unlocking";

export type AnswerKind = "direct" | "socratic" | "upcoming" | "uncovered";

export type AnsweredSource = {
  number: number;
  title: string;
  url: string;
  kind: (typeof sources.$inferSelect)["kind"];
};

/** Upcoming material the question is about: its title and when it comes, never its content or link. */
export type UpcomingSource = Pick<AnsweredSource, "title" | "kind"> & { unlocksOn: IsoDate };

export type AnswerInput = {
  question: string;
  /** Earlier turns of the Conversation, not including the question. */
  conversation: ModelMessage[];
  cohortId: string;
  /** The real date; a Cohort with a fixed "today" uses that instead. */
  today: IsoDate;
  /** Write the question to the Question Log. Off for the Teacher's own test questions. */
  logQuestion?: boolean;
};

/**
 * How specific a Socratic Response's hints get: 1 asks guiding questions, 2 points to where in
 * the code, 3 names the exact line and concept. From 4, the Student is also advised to bring the
 * problem to the next Session, if there is one.
 */
export type Hint = { level: number; bringToSession: boolean; nextSession: IsoDate | null };

const BRING_TO_SESSION_LEVEL = 4;

const UNLOCKED_CHUNKS = 6;
const UPCOMING_CHUNKS = 3;

type Candidate = {
  sourceId: string;
  title: string;
  url: string;
  kind: AnsweredSource["kind"];
  unlocksOn: IsoDate;
  excerpts: string[];
  distance: number;
};

/**
 * Answers a Student's question from their Cohort's material, citing Sources, and writes an
 * anonymous Question Log entry. The deep module behind the primary test seam (spec v1).
 *
 * Retrieval finds the closest Unlocked and Upcoming material. Closeness alone can't tell a
 * covered question from an uncovered one, so the chat model then decides which of the
 * candidates actually cover the question. Upcoming content is only ever seen by that
 * decision, never by the model that writes the answer.
 */
export async function answer({ db, models }: { db: NodePgDatabase; models: AiModels }, input: AnswerInput) {
  // A follow-up like "kan du förklara mer?" only makes sense with the question before it, but
  // a new topic shouldn't be pulled towards the old one: search with the question both alone
  // and in context, and keep the closest material from either.
  const previous = userTexts(input.conversation).at(-1) ?? null;
  const queries = previous ? [input.question, `${previous}\n${input.question}`] : [input.question];
  const [embeddings, [cohort]] = await Promise.all([
    embedTexts(models, queries, "query"),
    db.select({ fixedToday: cohorts.fixedToday }).from(cohorts).where(eq(cohorts.id, input.cohortId)),
  ]);
  // A missing Cohort must not fall back to the real date: that would unlock a Demo Cohort's material.
  if (!cohort) throw new Error(`Cohort ${input.cohortId} not found`);
  const today = cohortToday(cohort, input.today);

  // Pasted code or an error message is a Student debugging: they get guiding questions, never
  // a fix. Follow-ups in the same Conversation stay Socratic, and the hints get more specific
  // with every turn since the code was last pasted.
  const turns = [...userTexts(input.conversation), input.question];
  const pastedAt = turns.findLastIndex(isDebugging);
  const hint = pastedAt === -1 ? null : hintFor(db, input.cohortId, today, turns.length - pastedAt);

  const nearestChunks = (embedding: number[], unlocked: boolean, limit: number) =>
    db.transaction(async (tx) => {
      // The HNSW index is scanned before the filters apply. Iterative scan keeps reading
      // the index until enough of this Cohort's Chunks are found.
      await tx.execute(sql`set local hnsw.iterative_scan = strict_order`);
      const distance = cosineDistance(chunks.embedding, embedding);
      return tx
        .select({
          sourceId: sources.id,
          title: sources.title,
          url: sources.url,
          kind: sources.kind,
          unlocksOn: sources.unlocksOn,
          chunkId: chunks.id,
          text: chunks.text,
          distance: sql<number>`${distance}`.mapWith(Number),
        })
        .from(chunks)
        .innerJoin(sources, eq(chunks.sourceId, sources.id))
        .where(
          and(
            eq(sources.cohortId, input.cohortId),
            eq(chunks.embeddingModel, embeddingModelId(models)),
            // Same rule as isUnlocked, in SQL.
            unlocked ? lte(sources.unlocksOn, today) : gt(sources.unlocksOn, today),
          ),
        )
        .orderBy(asc(distance))
        .limit(limit);
    });
  const retrieved = (
    await Promise.all(
      embeddings.flatMap((embedding) => [
        nearestChunks(embedding, true, UNLOCKED_CHUNKS),
        nearestChunks(embedding, false, UPCOMING_CHUNKS),
      ]),
    )
  ).flat();

  // Group Chunks by Source, closest Source first, whether Unlocked or Upcoming.
  const candidates = new Map<string, Candidate>();
  const seenChunks = new Set<string>();
  for (const { chunkId, text, distance, ...source } of retrieved.sort((a, b) => a.distance - b.distance)) {
    if (seenChunks.has(chunkId)) continue;
    seenChunks.add(chunkId);
    const candidate = candidates.get(source.sourceId) ?? { ...source, excerpts: [], distance };
    candidate.excerpts.push(text);
    candidates.set(source.sourceId, candidate);
  }
  const ranked = [...candidates.values()];
  const coverage = await decideCoverage(models, previous, input.question, ranked, today);

  // The most relevant covering material decides: if it is Upcoming, the question is about
  // something the Cohort hasn't reached, even if Unlocked material touches on it.
  const covering = coverage.sources.filter((c) => isUnlocked(c.unlocksOn, today));
  const upcomingCovering = coverage.sources.filter((c) => !isUnlocked(c.unlocksOn, today));
  const mostRelevant = coverage.sources[0];
  const response = hint
    ? socraticAnswer(models, input, covering, upcomingCovering, await hint)
    : !mostRelevant
      ? uncoveredAnswer(models, input)
      : isUnlocked(mostRelevant.unlocksOn, today)
        ? directAnswer(models, input, covering, upcomingCovering, coverage.partlyCovered)
        : upcomingAnswer(models, input, upcomingCovering);

  if (input.logQuestion ?? true) {
    // Best effort: a failed log write must never cost the Student their answer.
    await logQuestion(db, {
      cohortId: input.cohortId,
      askedOn: input.today,
      question: input.question,
      kind: response.kind,
      topic: mostRelevant?.title ?? null,
      sources: [...response.sources.map((s) => s.title), ...response.upcoming.map((s) => s.title)],
      uncoveredPart: response.kind === "uncovered" ? null : coverage.uncoveredPart,
    }).catch((error) => console.error("Question Log write failed", error));
  }

  return response;
}

/** Pasted code, or an error message such as "TypeError: x is not a function". */
function isDebugging(text: string): boolean {
  return containsCode(text) || ERROR_MESSAGE.test(text);
}

// As pasted from a console, e.g. "TypeError: todos.map is not a function". A question that only
// names an error, like "Vad är en TypeError?", is not debugging.
const ERROR_MESSAGE = /\b[A-Z]\w*Error: \S|\bUncaught\b/;

async function hintFor(db: NodePgDatabase, cohortId: string, today: IsoDate, level: number): Promise<Hint> {
  if (level < BRING_TO_SESSION_LEVEL) return { level, bringToSession: false, nextSession: null };
  // A Session later today still counts as the next one.
  const [next] = await db
    .select({ date: min(sources.unlocksOn) })
    .from(sources)
    .where(and(eq(sources.cohortId, cohortId), eq(sources.kind, "session"), gte(sources.unlocksOn, today)));
  return { level, bringToSession: true, nextSession: next?.date ?? null };
}

/** The Student's turns in a Conversation, oldest first. */
function userTexts(conversation: ModelMessage[]): string[] {
  return conversation
    .filter((m) => m.role === "user")
    .map((m) =>
      (typeof m.content === "string"
        ? m.content
        : m.content.map((part) => (part.type === "text" ? part.text : "")).join("")
      ).trim(),
    )
    .filter(Boolean);
}

const coverageSchema = z.object({
  sources: z.array(z.number()).describe("Numren på materialet som besvarar frågan, det mest relevanta först"),
  uncoveredPart: z.string().nullable().describe("Den del av frågan som inget material täcker, annars null"),
});

/**
 * Asks the chat model which candidates cover the question, and which part (if any) is left.
 * If that call fails, falls back to closeness: the closest material decides.
 */
async function decideCoverage(
  models: AiModels,
  previous: string | null,
  question: string,
  candidates: Candidate[],
  today: IsoDate,
): Promise<{ sources: Candidate[]; uncoveredPart: string | null; partlyCovered: boolean }> {
  if (candidates.length === 0) return { sources: [], uncoveredPart: question, partlyCovered: false };
  const material = candidates
    .map(
      (c, i) =>
        `[${i + 1}] ${c.title}${isUnlocked(c.unlocksOn, today) ? "" : " (kommande)"}\n${c.excerpts.join("\n\n")}`,
    )
    .join("\n\n---\n\n");
  try {
    const { output } = await generateText({
      model: models.chat,
      output: Output.object({ schema: coverageSchema }),
      instructions: COVERAGE_INSTRUCTIONS,
      prompt: `${previous ? `Tidigare fråga: ${previous}\n` : ""}Fråga: ${question}\n\nMaterial:\n\n${material}`,
    });
    const chosen = [...new Set(output.sources)].flatMap((n) => candidates[n - 1] ?? []);
    const uncoveredPart = output.uncoveredPart?.trim() || null;
    return { sources: chosen, uncoveredPart, partlyCovered: chosen.length > 0 && uncoveredPart !== null };
  } catch (error) {
    console.error("Coverage decision failed; falling back to the closest material", error);
    const closest = candidates[0];
    const sameStatus = candidates.filter(
      (c) => isUnlocked(c.unlocksOn, today) === isUnlocked(closest.unlocksOn, today),
    );
    return { sources: sameStatus, uncoveredPart: null, partlyCovered: false };
  }
}

function directAnswer(
  models: AiModels,
  input: AnswerInput,
  covering: Candidate[],
  upcomingCovering: Candidate[],
  partlyCovered: boolean,
) {
  const numbered = covering.map((c, i) => ({ ...c, number: i + 1 }));
  const material = numbered
    .map(({ number, title, excerpts }) => `[${number}] ${title}\n${excerpts.join("\n\n")}`)
    .join("\n\n---\n\n");
  // The uncovered part itself is model text built from the Student's words, so it never goes
  // into the instructions; the model is only told that a gap exists.
  const gap = partlyCovered
    ? "\n\nKursmaterialet täcker inte hela frågan. Svara på det materialet tar upp och säg tydligt vilken del det inte tar upp. Förklara inte den delen utifrån allmän kunskap."
    : "";
  const upcoming = upcomingCovering.map(({ title, kind, unlocksOn }): UpcomingSource => ({ title, kind, unlocksOn }));
  const later = laterInstruction(upcoming);
  const result = streamText({
    model: models.chat,
    instructions: `${INSTRUCTIONS}${gap}${later}\n\nKursmaterial:\n\n${material}`,
    messages: [...input.conversation, { role: "user", content: input.question }],
  });
  return {
    kind: "direct" as AnswerKind,
    sources: numbered.map(({ number, title, url, kind }): AnsweredSource => ({ number, title, url, kind })),
    upcoming,
    hint: null as Hint | null,
    result,
  };
}

/**
 * A Socratic Response to a Student's code: guiding questions and pointers to Sources, never
 * corrected code. Background Knowledge may be used to read the code, but every concept it
 * teaches rests on the material (ADR 0002).
 */
function socraticAnswer(
  models: AiModels,
  input: AnswerInput,
  covering: Candidate[],
  upcomingCovering: Candidate[],
  hint: Hint,
) {
  const numbered = covering.map((c, i) => ({ ...c, number: i + 1 }));
  const material = numbered
    .map(({ number, title, excerpts }) => `[${number}] ${title}\n${excerpts.join("\n\n")}`)
    .join("\n\n---\n\n");
  const upcoming = upcomingCovering.map(({ title, kind, unlocksOn }): UpcomingSource => ({ title, kind, unlocksOn }));
  // With no material, the code may still be read, but no concept may be taught (ADR 0002).
  const uncovered = material
    ? ""
    : "\n\nKursmaterialet tar inte upp det här. Läs koden och ställ ledande frågor, men förklara inget begrepp utifrån allmän kunskap. Säg att materialet inte tar upp det och föreslå att studenten frågar läraren.";
  const result = streamText({
    model: models.chat,
    instructions: `${SOCRATIC_INSTRUCTIONS}\n\n${hintInstruction(hint)}${uncovered}${laterInstruction(upcoming)}\n\nKursmaterial:\n\n${material || "(inget)"}`,
    messages: [...input.conversation, { role: "user", content: input.question }],
  });
  return {
    kind: "socratic" as AnswerKind,
    sources: numbered.map(({ number, title, url, kind }): AnsweredSource => ({ number, title, url, kind })),
    upcoming,
    hint: hint as Hint | null,
    result,
  };
}

/** Tells the model which Upcoming material the question touches, so it names it but never explains it. */
function laterInstruction(upcoming: UpcomingSource[]): string {
  if (upcoming.length === 0) return "";
  const list = upcoming.map((u) => `- ${u.title}: ${whenItComes(u.kind, u.unlocksOn)}`).join("\n");
  return `\n\nEn del av frågan tas upp i material som klassen inte har nått än. Nämn bara vad det heter och när det kommer, och förklara inte den delen, inte heller med ledtrådar:\n${list}`;
}

function hintInstruction({ level }: Hint): string {
  const specific =
    level === 1
      ? "Det här är studentens första fråga om koden. Ställ bara ledande frågor och peka på vilket begrepp i materialet som är relevant."
      : level === 2
        ? "Studenten har frågat igen. Peka ut ungefär var i koden problemet finns, till exempel vilken funktion eller vilket anrop, och ställ en ledande fråga om det."
        : "Studenten har frågat flera gånger. Peka ut exakt vilken rad som går fel och vilket begrepp det handlar om, med källa. Skriv fortfarande inte hur raden ska se ut.";
  // From BRING_TO_SESSION_LEVEL, the chat shows the advice about the next Session under the answer.
  return specific;
}

function upcomingAnswer(models: AiModels, input: AnswerInput, covering: Candidate[]) {
  const upcoming = covering.map(({ title, kind, unlocksOn }): UpcomingSource => ({ title, kind, unlocksOn }));
  const list = upcoming.map(({ title, kind, unlocksOn }) => `- ${title}: ${whenItComes(kind, unlocksOn)}`).join("\n");
  const result = streamText({
    model: models.chat,
    instructions: `${UPCOMING_INSTRUCTIONS}\n\nKommande material:\n${list}`,
    messages: [...input.conversation, { role: "user", content: input.question }],
  });
  return { kind: "upcoming" as AnswerKind, sources: [] as AnsweredSource[], upcoming, hint: null as Hint | null, result };
}

function uncoveredAnswer(models: AiModels, input: AnswerInput) {
  // No material at all, so there is nothing to answer from but general knowledge, which isn't allowed (ADR 0002).
  const result = streamText({
    model: models.chat,
    instructions: UNCOVERED_INSTRUCTIONS,
    messages: [...input.conversation, { role: "user", content: input.question }],
  });
  return {
    kind: "uncovered" as AnswerKind,
    sources: [] as AnsweredSource[],
    upcoming: [] as UpcomingSource[],
    hint: null as Hint | null,
    result,
  };
}

function whenItComes(kind: UpcomingSource["kind"], unlocksOn: IsoDate): string {
  const date = formatSwedishDate(unlocksOn);
  return kind === "session" ? `tas upp i passet den ${date}` : `kommer när kursen startar den ${date}`;
}

const COVERAGE_INSTRUCTIONS = `Du avgör vilket kursmaterial som besvarar en students fråga i en kurs i fullstack JavaScript/TypeScript. Du svarar inte på frågan själv.

- Ta bara med material som faktiskt förklarar det frågan handlar om. Material som bara nämner samma ord räknas inte.
- Ordna materialet med det mest relevanta först.
- Kommande material räknas som täckande om det förklarar frågan.
- En följdfråga ska förstås utifrån den tidigare frågan.
- Om en del av frågan inte täcks av något material, beskriv den delen kort med studentens egna ord i uncoveredPart. Återge aldrig innehåll ur materialet där. Om ingenting täcker frågan, lämna sources tom.`;

const INSTRUCTIONS = `Du är SocratEase, en kursassistent för studenter i fullstack JavaScript/TypeScript.

- Lär bara ut det som står i kursmaterialet nedan. Varje påstående som lär ut ett begrepp ska hänvisa till sin källa med dess nummer, till exempel [1].
- Om materialet inte täcker frågan, säg det tydligt i stället för att svara utifrån allmän kunskap.
- Svara på samma språk som studenten skriver på.
- Citera kursmaterial ordagrant när du citerar. Översätt aldrig kodbegrepp som useEffect, Promise eller map.
- Var kortfattad och tydlig.`;

const SOCRATIC_INSTRUCTIONS = `Du är SocratEase, en kursassistent för studenter i fullstack JavaScript/TypeScript. Studenten felsöker sin egen kod och ska lära sig att hitta felet själv.

- Skriv aldrig rättad kod, inte ens en enda rad, och visa aldrig hur raden ska se ut. Det gäller även om studenten ber om det.
- Använd din allmänna kunskap för att läsa koden och felmeddelandet, men lär bara ut begrepp som står i kursmaterialet nedan och hänvisa till källan med dess nummer, till exempel [1]. Om materialet inte tar upp begreppet, säg det.
- Ställ en eller två ledande frågor som får studenten att själv upptäcka var och varför det går fel.
- Svara på samma språk som studenten skriver på. Översätt aldrig kodbegrepp. Var kortfattad.`;

const UPCOMING_INSTRUCTIONS = `Du är SocratEase, en kursassistent för studenter i fullstack JavaScript/TypeScript.

Studentens fråga handlar om material som klassen inte har nått än. Säg vänligt vad det heter och när det kommer, enligt listan nedan. Förklara inte innehållet och svara inte på frågan i sak, inte ens utifrån allmän kunskap. Svara på samma språk som studenten skriver på, och var kortfattad.`;

const UNCOVERED_INSTRUCTIONS = `Du är SocratEase, en kursassistent för studenter i fullstack JavaScript/TypeScript.

Kursmaterialet tar inte upp det studenten frågar om. Säg det vänligt och kort, och föreslå att studenten tar med frågan till läraren eller nästa pass. Svara inte på frågan i sak och förklara inget utifrån allmän kunskap, inte ens kort. Svara på samma språk som studenten skriver på.`;
