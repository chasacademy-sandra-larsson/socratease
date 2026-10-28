import { and, asc, cosineDistance, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { streamText, type ModelMessage } from "ai";
import { embeddingModelId, embedTexts } from "@/ai/embed";
import type { AiModels } from "@/ai/models";
import { chunks, sources } from "@/db/schema";

export type AnswerKind = "direct";

export type AnsweredSource = {
  number: number;
  title: string;
  url: string;
  kind: (typeof sources.$inferSelect)["kind"];
};

export type AnswerInput = {
  question: string;
  /** Earlier turns of the Conversation, not including the question. */
  conversation: ModelMessage[];
  cohortId: string;
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
  const [queryEmbedding] = await embedTexts(models, [input.question], "query");

  const retrieved = await db.transaction(async (tx) => {
    // The HNSW index is scanned before the Cohort filter applies. Iterative scan keeps
    // reading the index until enough of this Cohort's Chunks are found.
    await tx.execute(sql`set local hnsw.iterative_scan = strict_order`);
    return tx
      .select({
        sourceId: sources.id,
        title: sources.title,
        url: sources.url,
        kind: sources.kind,
        text: chunks.text,
      })
      .from(chunks)
      .innerJoin(sources, eq(chunks.sourceId, sources.id))
      .where(and(eq(sources.cohortId, input.cohortId), eq(chunks.embeddingModel, embeddingModelId(models))))
      .orderBy(asc(cosineDistance(chunks.embedding, queryEmbedding)))
      .limit(RETRIEVED_CHUNKS);
  });

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
    text: result.text,
    result,
  };
}

const INSTRUCTIONS = `Du är SocratEase, en kursassistent för studenter i fullstack JavaScript/TypeScript.

- Lär bara ut det som står i kursmaterialet nedan. Varje påstående som lär ut ett begrepp ska hänvisa till sin källa med dess nummer, till exempel [1].
- Om materialet inte täcker frågan, säg det tydligt i stället för att svara utifrån allmän kunskap.
- Svara på samma språk som studenten skriver på.
- Citera kursmaterial ordagrant när du citerar. Översätt aldrig kodbegrepp som useEffect, Promise eller map.
- Var kortfattad och tydlig.`;
