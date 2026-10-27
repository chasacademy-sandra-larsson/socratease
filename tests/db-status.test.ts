import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { createPool } from "../src/db/pool";
import { getDatabaseStatus } from "../src/db/status";

// Integration tests: need the migrated Postgres from Docker Compose (or the CI service).
describe("getDatabaseStatus", () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  afterAll(() => pool.end());

  it("reports migrations and pgvector on a migrated database", async () => {
    const status = await getDatabaseStatus(pool);

    expect(status.reachable).toBe(true);
    if (!status.reachable) return;
    expect(status.migrationsApplied).toBeGreaterThanOrEqual(1);
    expect(status.pgvectorVersion).toMatch(/^\d+\.\d+/);
  });

  it("reports a reachable but unmigrated database as reachable with 0 migrations", async () => {
    const name = `socratease_empty_${Date.now()}`;
    await pool.query(`create database ${name}`);
    const url = new URL(process.env.DATABASE_URL!);
    url.pathname = `/${name}`;
    const emptyPool = new Pool({ connectionString: url.toString() });

    try {
      const status = await getDatabaseStatus(emptyPool);
      expect(status).toEqual({ reachable: true, migrationsApplied: 0, pgvectorVersion: null });
    } finally {
      await emptyPool.end();
      await pool.query(`drop database ${name}`);
    }
  });

  it("reports unreachable instead of throwing when the database is down", async () => {
    const deadPool = new Pool({
      connectionString: "postgres://nobody:nothing@localhost:1/none",
      connectionTimeoutMillis: 1000,
    });

    const status = await getDatabaseStatus(deadPool);
    await deadPool.end();

    expect(status.reachable).toBe(false);
  });
});

describe("createPool", () => {
  it("fails clearly when DATABASE_URL is missing", () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      expect(() => createPool()).toThrow("DATABASE_URL is not set");
    } finally {
      process.env.DATABASE_URL = saved;
    }
  });
});
