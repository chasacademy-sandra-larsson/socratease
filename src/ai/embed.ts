import { embedMany } from "ai";
import type { AiModels, EmbeddingPurpose } from "./models";

/** Embeds texts and L2-normalizes the vectors, so cosine distance is comparable across models. */
export async function embedTexts(
  models: AiModels,
  texts: string[],
  purpose: EmbeddingPurpose,
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const { embeddings } = await embedMany({
    // Vertex embeds one text per request; keep the burst under the per-minute quota.
    maxParallelCalls: 4,
    model: models.embedding,
    values: texts,
    providerOptions: models.embeddingOptions?.(purpose),
  });
  return embeddings.map(normalize);
}

function normalize(vector: number[]): number[] {
  const length = Math.hypot(...vector);
  return length === 0 ? vector : vector.map((x) => x / length);
}

/** Identifies the embedding model, so vectors from different models are never mixed. */
export function embeddingModelId(models: AiModels): string {
  const model = models.embedding;
  return typeof model === "string" ? model : `${model.provider}/${model.modelId}`;
}
