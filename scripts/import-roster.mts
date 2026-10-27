// Usage: pnpm roster:import <cohort-name> <file>
// The file can be a plain list of addresses or a Canvas CSV export.
import { readFile } from "node:fs/promises";
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { importRoster } from "../src/access/index";
import { createPool } from "../src/db/pool";

config({ path: ".env.local" });

const [cohortName, file] = process.argv.slice(2);
if (!cohortName || !file) {
  console.error("Usage: pnpm roster:import <cohort-name> <file>");
  process.exit(1);
}

const pool = createPool();
try {
  const { imported, moved } = await importRoster(drizzle(pool), cohortName, await readFile(file, "utf8"));
  console.log(`Roster for ${cohortName}: ${imported} student addresses`);
  for (const { email, from } of moved) {
    console.warn(`Warning: ${email} was moved from ${from} to ${cohortName}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
