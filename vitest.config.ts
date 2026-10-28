import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

config({ path: ".env.local" });

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/setup-database.ts"],
    setupFiles: ["tests/use-test-database.ts"],
    // Integration tests share one test database, so files run one at a time.
    fileParallelism: false,
  },
});
