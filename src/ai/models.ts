import type { EmbeddingModel, LanguageModel, embedMany } from "ai";

type ProviderOptions = NonNullable<Parameters<typeof embedMany>[0]["providerOptions"]>;

export type EmbeddingPurpose = "document" | "query";

/** The AI provider behind one interface: a chat model and an embedding model (ADR 0006). */
export type AiModels = {
  chat: LanguageModel;
  embedding: EmbeddingModel;
  /** Provider-specific options for an embedding call, e.g. dimensions and task type. */
  embeddingOptions?: (purpose: EmbeddingPurpose) => ProviderOptions;
};

/**
 * Picks the AI provider from AI_PROVIDER:
 * - "vertex": Google Vertex AI in the EU (production);
 * - "local": Claude via Anthropic + embeddings on this machine, for development with the
 *   fictional test Course only (never on Vercel);
 * - "fake": deterministic stand-in for tests and development without a provider.
 */
export async function getModels(): Promise<AiModels> {
  switch (process.env.AI_PROVIDER) {
    case "vertex":
      return (await import("./vertex")).createVertexModels();
    case "local":
      return (await import("./local")).createLocalModels();
    case "fake":
      return (await import("./fake")).createFakeModels();
    default:
      throw new AiProviderNotConfiguredError();
  }
}

export class AiProviderNotConfiguredError extends Error {
  constructor() {
    super('AI_PROVIDER is not set to "vertex", "local" or "fake"');
  }
}
