import { and, asc, cosineDistance, eq, gt, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { generateText, Output, streamText, type ModelMessage } from "ai";
import { z } from "zod";
import { embeddingModelId, embedTexts } from "@/ai/embed";
import type { AiModels } from "@/ai/models";
import { chunks, cohorts, sources } from "@/db/schema";
import { logQuestion } from "@/question-log";
import { cohortToday, formatSwedishDate, isUnlocked, type IsoDate } from "@/unlocking";

export type AnswerKind = "direct" | "upcoming" | "uncovered";

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
  const previous = previousQuestion(input.conversation);
  const queries = previous ? [input.question, `${previous}\n${input.question}`] : [input.question];
  const [embeddings, [cohort]] = await Promise.all([
    embedTexts(models, queries, "query"),
    db.select({ fixedToday: cohorts.fixedToday }).from(cohorts).where(eq(cohorts.id, input.cohortId)),
  ]);
  // A missing Cohort must not fall back to the real date: that would unlock a Demo Cohort's material.
  if (!cohort) throw new Error(`Cohort ${input.cohortId} not found`);
  const today = cohortToday(cohort, input.today);

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
  const response = !mostRelevant
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

function previousQuestion(conversation: ModelMessage[]): string | null {
  const previous = conversation.findLast((m) => m.role === "user");
  if (!previous) return null;
  const text =
    typeof previous.content === "string"
      ? previous.content
      : previous.content.map((part) => (part.type === "text" ? part.text : "")).join("");
  return text.trim() || null;
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
  const later = upcoming.length
    ? `\n\nEn del av frågan tas upp i material som klassen inte har nått än. Nämn bara vad det heter och när det kommer, och förklara inte den delen:\n${upcoming.map((u) => `- ${u.title}: ${whenItComes(u.kind, u.unlocksOn)}`).join("\n")}`
    : "";
  const result = streamText({
    model: models.chat,
    instructions: `${INSTRUCTIONS}${gap}${later}\n\nKursmaterial:\n\n${material}`,
    messages: [...input.conversation, { role: "user", content: input.question }],
  });
  return {
    kind: "direct" as AnswerKind,
    sources: numbered.map(({ number, title, url, kind }): AnsweredSource => ({ number, title, url, kind })),
    upcoming,
    result,
  };
}

function upcomingAnswer(models: AiModels, input: AnswerInput, covering: Candidate[]) {
  const upcoming = covering.map(({ title, kind, unlocksOn }): UpcomingSource => ({ title, kind, unlocksOn }));
  const list = upcoming.map(({ title, kind, unlocksOn }) => `- ${title}: ${whenItComes(kind, unlocksOn)}`).join("\n");
  const result = streamText({
    model: models.chat,
    instructions: `${UPCOMING_INSTRUCTIONS}\n\nKommande material:\n${list}`,
    messages: [...input.conversation, { role: "user", content: input.question }],
  });
  return { kind: "upcoming" as AnswerKind, sources: [] as AnsweredSource[], upcoming, result };
}

function uncoveredAnswer(models: AiModels, input: AnswerInput) {
  // No material at all, so there is nothing to answer from but general knowledge, which isn't allowed (ADR 0002).
  const result = streamText({
    model: models.chat,
    instructions: UNCOVERED_INSTRUCTIONS,
    messages: [...input.conversation, { role: "user", content: input.question }],
  });
  return { kind: "uncovered" as AnswerKind, sources: [] as AnsweredSource[], upcoming: [] as UpcomingSource[], result };
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

const UPCOMING_INSTRUCTIONS = `Du är SocratEase, en kursassistent för studenter i fullstack JavaScript/TypeScript.

Studentens fråga handlar om material som klassen inte har nått än. Säg vänligt vad det heter och när det kommer, enligt listan nedan. Förklara inte innehållet och svara inte på frågan i sak, inte ens utifrån allmän kunskap. Svara på samma språk som studenten skriver på, och var kortfattad.`;

const UNCOVERED_INSTRUCTIONS = `Du är SocratEase, en kursassistent för studenter i fullstack JavaScript/TypeScript.

Kursmaterialet tar inte upp det studenten frågar om. Säg det vänligt och kort, och föreslå att studenten tar med frågan till läraren eller nästa pass. Svara inte på frågan i sak och förklara inget utifrån allmän kunskap, inte ens kort. Svara på samma språk som studenten skriver på.`;
