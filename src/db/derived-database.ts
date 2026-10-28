import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

/**
 * Creates (if needed) and migrates a database named `<name>_<suffix>` next to the one in
 * `connectionString`, and returns its URL. Keeps tests and evaluation runs away from the
 * development database.
 */
export async function prepareDerivedDatabase(connectionString: string, suffix: string): Promise<string> {
  const baseUrl = new URL(connectionString);
  const name = `${baseUrl.pathname.slice(1)}_${suffix}`;
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;

  const admin = new Pool({ connectionString: baseUrl.toString() });
  try {
    const exists = await admin.query("select 1 from pg_database where datname = $1", [name]);
    if (exists.rowCount === 0) await admin.query(`create database "${name}"`);
  } finally {
    await admin.end();
  }

  const pool = new Pool({ connectionString: url.toString() });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  } finally {
    await pool.end();
  }
  return url.toString();
}
