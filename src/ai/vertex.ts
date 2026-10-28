import { createVertex } from "@ai-sdk/google-vertex";
import { createVertexAnthropic } from "@ai-sdk/google-vertex/anthropic";
import { EMBEDDING_DIMENSIONS } from "@/db/schema";
import type { AiModels } from "./models";

// ADR 0006: Claude on the EU multi-region endpoint, embeddings in Frankfurt.
// Never use "global": it may process data outside the EU.
const CHAT_LOCATION = "eu";
const EMBEDDING_LOCATION = "europe-west3";

export function createVertexModels(): AiModels {
  const project = process.env.GCP_PROJECT_ID;
  if (!project) throw new Error("GCP_PROJECT_ID is not set");

  const claude = createVertexAnthropic({ project, location: CHAT_LOCATION });
  const vertex = createVertex({ project, location: EMBEDDING_LOCATION });

  return {
    chat: claude("claude-haiku-5-5"),
    embedding: vertex.embeddingModel("gemini-embedding-001"),
    embeddingOptions: (purpose) => ({
      vertex: {
        outputDimensionality: EMBEDDING_DIMENSIONS,
        taskType: purpose === "document" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY",
      },
    }),
  };
}
