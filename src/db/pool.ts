import { Pool } from "pg";

export function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const pool = new Pool({ connectionString });
  // An idle client can error when the server restarts or drops the connection.
  // Without a listener, that would crash the process instead of failing the next query.
  pool.on("error", (error) => console.error("Postgres pool error", error));
  return pool;
}
