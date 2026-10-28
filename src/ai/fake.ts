import { simulateReadableStream } from "ai";
import { MockEmbeddingModelV4, MockLanguageModelV4 } from "ai/test";
import { EMBEDDING_DIMENSIONS } from "@/db/schema";
import type { AiModels } from "./models";

/**
 * A deterministic stand-in for the AI provider, for tests and local development.
 * Embeddings hash words into a vector, so texts that share words are close.
 * The chat model answers by listing the Sources it was given, which shows
 * retrieval working without calling a real model.
 */
export function createFakeModels(): AiModels {
  return {
    chat: new MockLanguageModelV4({
      provider: "fake",
      modelId: "fake-chat",
      doStream: async ({ prompt }) => {
        const system = prompt
          .filter((message) => message.role === "system")
          .map((message) => message.content)
          .join("\n");
        const titles = [...system.matchAll(/^\[(\d+)\] (.+)$/gm)].map(([, n, title]) => `[${n}] ${title}`);
        const text = titles.length
          ? `(Låtsassvar) Jag hittade det här i kursmaterialet: ${titles.join(", ")}.`
          : "(Låtsassvar) Jag hittade inget i kursmaterialet.";
        return {
          stream: simulateReadableStream({
            chunks: [
              { type: "text-start", id: "t" },
              { type: "text-delta", id: "t", delta: text },
              { type: "text-end", id: "t" },
              {
                type: "finish",
                finishReason: { unified: "stop", raw: undefined },
                usage: {
                  inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
                  outputTokens: { total: 0, text: 0, reasoning: undefined },
                },
              },
            ],
          }),
        };
      },
    }),
    embedding: new MockEmbeddingModelV4({
      provider: "fake",
      modelId: "fake-embedding",
      doEmbed: async ({ values }) => ({
        embeddings: values.map(hashEmbedding),
        warnings: [],
      }),
    }),
  };
}

function hashEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const word of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) {
    let hash = 0;
    for (const char of word) hash = (hash * 31 + char.codePointAt(0)!) >>> 0;
    vector[hash % EMBEDDING_DIMENSIONS] += 1;
  }
  return vector;
}
