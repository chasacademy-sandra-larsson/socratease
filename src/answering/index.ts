import { and, asc, cosineDistance, eq, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { streamText, type ModelMessage } from "ai";
import { embeddingModelId, embedTexts } from "@/ai/embed";
import type { AiModels } from "@/ai/models";
import { chunks, cohorts, sources } from "@/db/schema";
import { cohortToday, formatSwedishDate, isUnlocked, type IsoDate } from "@/unlocking";

export type AnswerKind = "direct" | "upcoming";

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
};

const RETRIEVED_CHUNKS = 6;

/**
 * Answers a Student's question from their Cohort's material, citing Sources.
 * The deep module behind the primary test seam (spec v1).
 */
export async function answer(
  { db, models }: { db: NodePgDatabase; models: AiModels },
  input: AnswerInput,
) {
  const [[queryEmbedding], [cohort]] = await Promise.all([
    embedTexts(models, [input.question], "query"),
    db.select({ fixedToday: cohorts.fixedToday }).from(cohorts).where(eq(cohorts.id, input.cohortId)),
  ]);
  // A missing Cohort must not fall back to the real date: that would unlock a Demo Cohort's material.
  if (!cohort) throw new Error(`Cohort ${input.cohortId} not found`);
  const today = cohortToday(cohort, input.today);

  const nearestChunks = (onlyUnlocked: boolean) =>
    db.transaction(async (tx) => {
      // The HNSW index is scanned before the filters apply. Iterative scan keeps reading
      // the index until enough of this Cohort's (Unlocked) Chunks are found.
      await tx.execute(sql`set local hnsw.iterative_scan = strict_order`);
      return tx
        .select({
          sourceId: sources.id,
          title: sources.title,
          url: sources.url,
          kind: sources.kind,
          unlocksOn: sources.unlocksOn,
          text: chunks.text,
        })
        .from(chunks)
        .innerJoin(sources, eq(chunks.sourceId, sources.id))
        .where(
          and(
            eq(sources.cohortId, input.cohortId),
            eq(chunks.embeddingModel, embeddingModelId(models)),
            // Same rule as isUnlocked, in SQL.
            onlyUnlocked ? lte(sources.unlocksOn, today) : undefined,
          ),
        )
        .orderBy(asc(cosineDistance(chunks.embedding, queryEmbedding)))
        .limit(RETRIEVED_CHUNKS);
    });

  // If the closest material of all is Upcoming, the question is about something that hasn't
  // been reached yet: say when it comes. Its content never reaches the model.
  const nearest = await nearestChunks(false);
  if (nearest[0] && !isUnlocked(nearest[0].unlocksOn, today)) {
    // Only Upcoming material closer to the question than anything Unlocked.
    const upcoming = new Map<string, UpcomingSource>();
    for (const { sourceId, title, kind, unlocksOn } of nearest) {
      if (isUnlocked(unlocksOn, today)) break;
      if (!upcoming.has(sourceId)) upcoming.set(sourceId, { title, kind, unlocksOn });
    }
    return upcomingAnswer(models, input, [...upcoming.values()]);
  }

  const retrieved = nearest.every((chunk) => isUnlocked(chunk.unlocksOn, today)) ? nearest : await nearestChunks(true);

  // Group Chunks by Source, numbered in order of first appearance.
  const bySource = new Map<string, AnsweredSource & { excerpts: string[] }>();
  for (const { sourceId, title, url, kind, text } of retrieved) {
    const source = bySource.get(sourceId) ?? { number: bySource.size + 1, title, url, kind, excerpts: [] };
    source.excerpts.push(text);
    bySource.set(sourceId, source);
  }
  const grouped = [...bySource.values()];
  const material = grouped
    .map(({ number, title, excerpts }) => `[${number}] ${title}\n${excerpts.join("\n\n")}`)
    .join("\n\n---\n\n");

  const result = streamText({
    model: models.chat,
    instructions: `${INSTRUCTIONS}\n\nKursmaterial:\n\n${material}`,
    messages: [...input.conversation, { role: "user", content: input.question }],
  });

  return {
    kind: "direct" as AnswerKind,
    sources: grouped.map(({ number, title, url, kind }) => ({ number, title, url, kind })),
    upcoming: [] as UpcomingSource[],
    result,
  };
}

function upcomingAnswer(models: AiModels, input: AnswerInput, upcoming: UpcomingSource[]) {
  const list = upcoming.map(({ title, kind, unlocksOn }) => `- ${title}: ${whenItComes(kind, unlocksOn)}`).join("\n");
  const result = streamText({
    model: models.chat,
    instructions: `${UPCOMING_INSTRUCTIONS}\n\nKommande material:\n${list}`,
    messages: [...input.conversation, { role: "user", content: input.question }],
  });
  return { kind: "upcoming" as AnswerKind, sources: [] as AnsweredSource[], upcoming, result };
}

function whenItComes(kind: UpcomingSource["kind"], unlocksOn: IsoDate): string {
  const date = formatSwedishDate(unlocksOn);
  return kind === "session" ? `tas upp i passet den ${date}` : `kommer när kursen startar den ${date}`;
}

const INSTRUCTIONS = `Du är SocratEase, en kursassistent för studenter i fullstack JavaScript/TypeScript.

- Lär bara ut det som står i kursmaterialet nedan. Varje påstående som lär ut ett begrepp ska hänvisa till sin källa med dess nummer, till exempel [1].
- Om materialet inte täcker frågan, säg det tydligt i stället för att svara utifrån allmän kunskap.
- Svara på samma språk som studenten skriver på.
- Citera kursmaterial ordagrant när du citerar. Översätt aldrig kodbegrepp som useEffect, Promise eller map.
- Var kortfattad och tydlig.`;

const UPCOMING_INSTRUCTIONS = `Du är SocratEase, en kursassistent för studenter i fullstack JavaScript/TypeScript.

Studentens fråga handlar om material som klassen inte har nått än. Säg vänligt vad det heter och när det kommer, enligt listan nedan. Förklara inte innehållet och svara inte på frågan i sak, inte ens utifrån allmän kunskap. Svara på samma språk som studenten skriver på, och var kortfattad.`;
