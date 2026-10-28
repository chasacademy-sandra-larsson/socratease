import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { embeddingModelId, embedTexts } from "@/ai/embed";
import type { AiModels } from "@/ai/models";
import { chunks, sources } from "@/db/schema";

export type SourceKind = (typeof sources.$inferInsert)["kind"];

/** Course material as it comes in, before it is split into Chunks. */
export type SourceInput = {
  externalId: string;
  kind: SourceKind;
  courseName: string;
  title: string;
  url: string;
  text: string;
};

const MAX_CHUNK_CHARS = 1500;

/**
 * Splits one Source's text into Chunks at paragraph boundaries. A Chunk never spans two
 * Sources, because it is always made from a single Source's text.
 */
export function chunkText(text: string, maxChars = MAX_CHUNK_CHARS): string[] {
  const result: string[] = [];
  let current = "";
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .flatMap((p) => splitLong(p, maxChars));
  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maxChars) {
      result.push(current);
      current = "";
    }
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  if (current) result.push(current);
  return result;
}

/** Splits a paragraph longer than maxChars at sentence ends, or hard as a last resort. */
function splitLong(paragraph: string, maxChars: number): string[] {
  if (paragraph.length <= maxChars) return [paragraph];
  const pieces: string[] = [];
  let current = "";
  // Split after sentence ends and line breaks without dropping any characters.
  for (const sentence of paragraph.split(/(?<=[.!?]\s+|\n)/)) {
    if (current && current.length + sentence.length > maxChars) {
      pieces.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) pieces.push(current.trim());
  return pieces.flatMap((piece) =>
    piece.length <= maxChars
      ? [piece]
      : Array.from({ length: Math.ceil(piece.length / maxChars) }, (_, i) =>
          piece.slice(i * maxChars, (i + 1) * maxChars),
        ),
  );
}

/** Adds or replaces a Source and its Chunks for a Cohort. */
export async function indexSource(
  db: NodePgDatabase,
  models: AiModels,
  cohortId: string,
  input: SourceInput,
) {
  const texts = chunkText(input.text);
  // Each Chunk is embedded with its Source's title, so a short Chunk keeps its context.
  const embeddings = await embedTexts(models, texts.map((t) => `${input.title}\n\n${t}`), "document");

  await db.transaction(async (tx) => {
    const source = {
      externalId: input.externalId,
      kind: input.kind,
      courseName: input.courseName,
      title: input.title,
      url: input.url,
    };
    const [row] = await tx
      .insert(sources)
      .values({ ...source, cohortId })
      .onConflictDoUpdate({ target: [sources.cohortId, sources.externalId], set: source })
      .returning({ id: sources.id });
    await tx.delete(chunks).where(eq(chunks.sourceId, row.id));
    if (texts.length > 0) {
      await tx.insert(chunks).values(
        texts.map((text, position) => ({
          sourceId: row.id,
          position,
          text,
          embeddingModel: embeddingModelId(models),
          embedding: embeddings[position],
        })),
      );
    }
  });
}
