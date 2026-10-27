import type { Pool } from "pg";

export type DatabaseStatus =
  | { reachable: true; migrationsApplied: number; pgvectorVersion: string | null }
  | { reachable: false; error: string };

export async function getDatabaseStatus(pool: Pool): Promise<DatabaseStatus> {
  try {
    const [migrationsApplied, vector] = await Promise.all([
      countMigrations(pool),
      pool.query<{ extversion: string }>(
        `select extversion from pg_extension where extname = 'vector'`,
      ),
    ]);
    return {
      reachable: true,
      migrationsApplied,
      pgvectorVersion: vector.rows[0]?.extversion ?? null,
    };
  } catch (error) {
    return {
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// A reachable database that hasn't been migrated yet has no migrations table;
// report 0 instead of treating it as unreachable. The table name is resolved when
// a query is parsed, so the existence check must be a separate query.
async function countMigrations(pool: Pool): Promise<number> {
  const table = await pool.query<{ exists: boolean }>(
    `select to_regclass('drizzle.__drizzle_migrations') is not null as exists`,
  );
  if (!table.rows[0].exists) return 0;
  const result = await pool.query<{ count: number }>(
    `select count(*)::int as count from drizzle.__drizzle_migrations`,
  );
  return result.rows[0].count;
}
