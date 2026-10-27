import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ path: ".env.local" });

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // Integration tests share one database, so files run one at a time.
  test: { include: ["tests/**/*.test.ts"], fileParallelism: false },
});
