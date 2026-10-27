// Runs the same way locally and on Vercel (as part of the build command).
import { config } from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createPool } from "../src/db/pool";

config({ path: ".env.local" });

// Preview deployments must not migrate a database shared with production.
// Set ALLOW_PREVIEW_MIGRATIONS=1 once previews have their own database branch.
if (process.env.VERCEL_ENV === "preview" && process.env.ALLOW_PREVIEW_MIGRATIONS !== "1") {
  console.log("Skipping migrations in a preview deployment");
  process.exit(0);
}

// Migrations use the direct (unpooled) connection when one exists; the app uses the pooler.
const pool = createPool(process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL);
try {
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  console.log("Migrations applied");
} catch (error) {
  console.error("Migration failed:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
