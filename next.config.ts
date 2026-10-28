import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // Native ONNX runtime for local embeddings; must not be bundled.
  serverExternalPackages: ["@huggingface/transformers"],
  // The local provider never runs on Vercel (ADR 0008), so keep its runtime out of deployments.
  outputFileTracingExcludes: {
    "*": ["node_modules/@huggingface/transformers/**", "node_modules/onnxruntime-node/**"],
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
