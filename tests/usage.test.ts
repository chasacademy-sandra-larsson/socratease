import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPool } from "../src/db/pool";
import { countMessage, limitReachedMessage, refundMessage } from "../src/usage";

// Tests the daily usage counter against the database: one row per Student, no history (ADR 0003).
const pool = createPool();
const db = drizzle(pool);
const anna = "key-anna";

beforeEach(async () => {
  await db.execute(sql`truncate daily_usage`);
});
afterAll(() => pool.end());

describe("countMessage", () => {
  it("lets messages through up to the limit and stops the one after", async () => {
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await countMessage(db, anna, "2026-11-12", 3));

    expect(results).toEqual([
      { allowed: true, count: 1 },
      { allowed: true, count: 2 },
      { allowed: true, count: 3 },
      { allowed: false, count: 4 },
    ]);
  });

  it("counts each Student on their own", async () => {
    await countMessage(db, anna, "2026-11-12", 3);
    await countMessage(db, anna, "2026-11-12", 3);

    expect(await countMessage(db, "key-bo", "2026-11-12", 3)).toEqual({ allowed: true, count: 1 });
  });

  it("starts over on a new day, overwriting yesterday's count instead of keeping it", async () => {
    for (let i = 0; i < 4; i++) await countMessage(db, anna, "2026-11-12", 3);

    expect(await countMessage(db, anna, "2026-11-13", 3)).toEqual({ allowed: true, count: 1 });
    const rows = await db.execute(sql`select day::text, count from daily_usage`);
    expect(rows.rows).toEqual([{ day: "2026-11-13", count: 1 }]);
  });

  it("gives a message back when it got no answer, so a failed answer doesn't use up the limit", async () => {
    await countMessage(db, anna, "2026-11-12", 3);
    await countMessage(db, anna, "2026-11-12", 3);
    await refundMessage(db, anna, "2026-11-12");

    expect(await countMessage(db, anna, "2026-11-12", 3)).toEqual({ allowed: true, count: 2 });
  });

  it("can't hold more than a key, a day and a count: no email and no questions", async () => {
    const columns = await db.execute(
      sql`select column_name from information_schema.columns where table_name = 'daily_usage' order by column_name`,
    );

    expect(columns.rows.map((c) => c.column_name)).toEqual(["count", "day", "student_key"]);
  });
});

describe("limitReachedMessage", () => {
  it("says the limit is reached and points to the next Session", () => {
    expect(limitReachedMessage(50, "2026-11-17")).toBe(
      "Du har ställt 50 frågor i dag, vilket är dagens gräns. Ta med din fråga till nästa pass den 17 november, eller fortsätt i morgon.",
    );
  });

  it("points to the next Session without a date when none is planned", () => {
    expect(limitReachedMessage(50, null)).toBe(
      "Du har ställt 50 frågor i dag, vilket är dagens gräns. Ta med din fråga till nästa pass, eller fortsätt i morgon.",
    );
  });
});
