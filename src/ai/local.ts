import { createAnthropic } from "@ai-sdk/anthropic";
import type { EmbeddingModel } from "ai";
import type { AiModels, EmbeddingPurpose } from "./models";

/**
 * Development-only provider (ADR 0006): Claude via the Anthropic API, and embeddings
 * computed on this machine with multilingual-e5-large (Swedish, 1024 dims).
 * Anthropic's API has no EU option, so this may only see the fictional test Course and
 * the developer's own questions. It refuses to run on Vercel, where real material lives.
 */
export function createLocalModels(): AiModels {
  if (process.env.VERCEL) {
    throw new Error('AI_PROVIDER "local" is for local development only and must not run on Vercel');
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  return {
    chat: createAnthropic({ apiKey })("claude-haiku-5-5"),
    embedding: localE5Embedding,
    embeddingOptions: (purpose) => ({ local: { purpose } }),
  };
}

const E5_MODEL = "Xenova/multilingual-e5-large";

type Extractor = (texts: string[], options: { pooling: "mean"; normalize: boolean }) => Promise<{
  tolist(): number[][];
}>;
let extractor: Promise<Extractor> | undefined;

function loadExtractor(): Promise<Extractor> {
  // Downloaded once (about 0.5 GB) to the local cache, then runs offline.
  extractor ??= import("@huggingface/transformers").then(
    ({ pipeline }) => pipeline("feature-extraction", E5_MODEL) as unknown as Promise<Extractor>,
  );
  return extractor;
}

const localE5Embedding: Exclude<EmbeddingModel, string> = {
  specificationVersion: "v4",
  provider: "local",
  modelId: E5_MODEL,
  maxEmbeddingsPerCall: 16,
  supportsParallelCalls: false,
  async doEmbed({ values, providerOptions }) {
    // e5 expects a prefix that says whether the text is a question or a passage to find.
    const purpose = (providerOptions?.local?.purpose ?? "document") as EmbeddingPurpose;
    const prefix = purpose === "query" ? "query: " : "passage: ";
    const output = await (await loadExtractor())(values.map((v) => prefix + v), {
      pooling: "mean",
      normalize: true,
    });
    return { embeddings: output.tolist(), warnings: [] };
  },
};
