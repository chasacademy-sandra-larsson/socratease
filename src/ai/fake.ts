import { simulateReadableStream } from "ai";
import { MockEmbeddingModelV4, MockLanguageModelV4 } from "ai/test";
import { EMBEDDING_DIMENSIONS } from "@/db/schema";
import type { AiModels } from "./models";

/**
 * A deterministic stand-in for the AI provider, for tests and local development.
 * Embeddings hash words into a vector, so texts that share words are close.
 * The chat model answers by listing the Sources it was given, which shows
 * retrieval working without calling a real model. Asked which material covers a question,
 * it picks the material that shares a meaningful word with the question.
 */
export function createFakeModels(): AiModels {
  return {
    chat: new MockLanguageModelV4({
      provider: "fake",
      modelId: "fake-chat",
      doGenerate: async ({ prompt }) => {
        const text = prompt
          .filter((message) => message.role === "user")
          .flatMap((message) => message.content)
          .map((part) => (part.type === "text" ? part.text : ""))
          .join("\n");
        return {
          content: [{ type: "text", text: JSON.stringify(fakeCoverage(text)) }],
          finishReason: { unified: "stop", raw: undefined },
          usage: {
            inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
            outputTokens: { total: 0, text: 0, reasoning: undefined },
          },
          warnings: [],
        };
      },
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

const STOP_WORDS = new Set(
  "vad hur varför när vilken vilka finns fungerar gör göra gäller efter från inte till eller också mellan skillnaden betyder kan jag det den som med och för har".split(" "),
);

function words(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((w) => w.length >= 4 && !STOP_WORDS.has(w)),
  );
}

/** The fake coverage decision: material that shares a meaningful word with the question. */
function fakeCoverage(prompt: string): { sources: number[]; uncoveredPart: null } {
  // A follow-up is understood from the question before it.
  const question = words([...prompt.matchAll(/^(?:Tidigare fråga|Fråga): (.*)$/gm)].map((m) => m[1]).join(" "));
  const blocks = prompt.split(/^\[(\d+)\] /m).slice(1);
  const sources: number[] = [];
  for (let i = 0; i < blocks.length; i += 2) {
    if ([...words(blocks[i + 1])].some((w) => question.has(w))) sources.push(Number(blocks[i]));
  }
  return { sources, uncoveredPart: null };
}
