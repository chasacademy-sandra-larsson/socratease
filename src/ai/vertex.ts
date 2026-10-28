import { createVertex } from "@ai-sdk/google-vertex";
import { EMBEDDING_DIMENSIONS } from "@/db/schema";
import type { AiModels } from "./models";

// ADR 0006: Gemini on the EU multi-region endpoint, embeddings in Frankfurt
// (gemini-embedding-001 isn't served on "eu").
// Never use "global": it may process data outside the EU.
const CHAT_LOCATION = "eu";
const EMBEDDING_LOCATION = "europe-west3";

export function createVertexModels(): AiModels {
  const project = process.env.GCP_PROJECT_ID;
  if (!project) throw new Error("GCP_PROJECT_ID is not set");

  const chat = createVertex({ project, location: CHAT_LOCATION });
  const embedding = createVertex({ project, location: EMBEDDING_LOCATION });

  return {
    chat: chat("gemini-3.5-flash-lite"),
    embedding: embedding.embeddingModel("gemini-embedding-001"),
    embeddingOptions: (purpose) => ({
      vertex: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
        taskType: purpose === "document" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY",
      },
    }),
  };
}
