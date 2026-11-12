import { createVertex } from "@ai-sdk/google-vertex";
import { getVercelOidcToken } from "@vercel/oidc";
import { ExternalAccountClient } from "google-auth-library";
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

  const googleAuthOptions = vercelAuth();
  const chat = createVertex({ project, location: CHAT_LOCATION, googleAuthOptions });
  const embedding = createVertex({ project, location: EMBEDDING_LOCATION, googleAuthOptions });

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

/**
 * On Vercel, signs in to Google Cloud without a stored key: Vercel's OIDC token is exchanged
 * through Workload Identity Federation for the socratease-vercel service account, which may only
 * use Vertex AI. Elsewhere, e.g. locally, the default credentials from
 * `gcloud auth application-default login` are used.
 */
function vercelAuth() {
  const { GCP_PROJECT_NUMBER, GCP_WORKLOAD_IDENTITY_POOL_ID, GCP_WORKLOAD_IDENTITY_PROVIDER_ID, GCP_SERVICE_ACCOUNT_EMAIL } =
    process.env;
  if (!process.env.VERCEL || !GCP_PROJECT_NUMBER) return undefined;
  const authClient = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience: `//iam.googleapis.com/projects/${GCP_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${GCP_WORKLOAD_IDENTITY_POOL_ID}/providers/${GCP_WORKLOAD_IDENTITY_PROVIDER_ID}`,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${GCP_SERVICE_ACCOUNT_EMAIL}:generateAccessToken`,
    subject_token_supplier: { getSubjectToken: () => getVercelOidcToken() },
  });
  if (!authClient) throw new Error("Could not set up Google Cloud credentials for Vercel");
  return { authClient };
}
