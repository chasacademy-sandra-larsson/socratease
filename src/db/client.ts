import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool } from "pg";
import { createPool } from "./pool";

const globalForDb = globalThis as unknown as { pool?: Pool };

// Reuse one pool across hot reloads in dev and across requests on Fluid Compute.
export const pool = globalForDb.pool ?? createPool();
globalForDb.pool = pool;

export const db = drizzle(pool);
