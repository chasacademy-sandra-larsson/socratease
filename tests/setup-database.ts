import { prepareDerivedDatabase } from "../src/db/derived-database";

/**
 * Vitest global setup: tests get their own database (<name>_test next to DATABASE_URL),
 * so running the suite never wipes the development database.
 */
export default async function setup({ provide }: { provide: (key: "testDatabaseUrl", value: string) => void }) {
  provide("testDatabaseUrl", await prepareDerivedDatabase(process.env.DATABASE_URL!, "test"));
}

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}
