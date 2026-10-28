import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * Vitest global setup: tests get their own database (<name>_test next to DATABASE_URL),
 * so running the suite never wipes the development database.
 */
export default async function setup({ provide }: { provide: (key: "testDatabaseUrl", value: string) => void }) {
  const devUrl = new URL(process.env.DATABASE_URL!);
  const testName = `${devUrl.pathname.slice(1)}_test`;
  const testUrl = new URL(devUrl);
  testUrl.pathname = `/${testName}`;

  const admin = new Pool({ connectionString: devUrl.toString() });
  const exists = await admin.query("select 1 from pg_database where datname = $1", [testName]);
  if (exists.rowCount === 0) await admin.query(`create database "${testName}"`);
  await admin.end();

  const pool = new Pool({ connectionString: testUrl.toString() });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await pool.end();

  provide("testDatabaseUrl", testUrl.toString());
}

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}
