import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPool } from "../src/db/pool";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { importRoster, resolveAccess } from "../src/access";
import { cohorts } from "../src/db/schema";

// Integration tests through the access decision: a Google identity + the Roster in the database.
const pool = createPool();
const db = drizzle(pool);
const teacherEmail = "larare@chasacademy.se";

beforeEach(async () => {
  await db.execute(sql`truncate cohorts cascade`);
});
afterAll(() => pool.end());

describe("resolveAccess", () => {
  it("lets in a Student on a Roster, in that Roster's Cohort, and the Teacher", async () => {
    await importRoster(db, "FJS26", "anna.a@student.chasacademy.se\nBO.B@student.chasacademy.se");

    const anna = await resolveAccess(db, {
      email: "anna.a@student.chasacademy.se",
      emailVerified: true,
      hostedDomain: "student.chasacademy.se",
    }, { teacherEmail });
    const bo = await resolveAccess(db, {
      email: "bo.b@student.chasacademy.se",
      emailVerified: true,
      hostedDomain: "student.chasacademy.se",
    }, { teacherEmail });
    const teacher = await resolveAccess(db, {
      email: "Larare@chasacademy.se",
      emailVerified: true,
      hostedDomain: "chasacademy.se",
    }, { teacherEmail });

    expect(anna).toMatchObject({ granted: true, role: "student", cohortName: "FJS26" });
    expect(bo).toMatchObject({ granted: true, role: "student", cohortName: "FJS26" });
    expect(teacher).toEqual({ granted: true, role: "teacher" });
  });

  it("turns away everyone else, with a reason", async () => {
    // A Canvas CSV export with noise around the addresses; re-importing replaces the Roster.
    await importRoster(db, "FJS26", "old.student@student.chasacademy.se");
    await importRoster(
      db,
      "FJS26",
      'Student,SIS Login ID\n"Anna A",anna.a@student.chasacademy.se\n"Extern",someone@gmail.com\n' +
        '"Alias",ghost@student.chasacademy.se.example.org',
    );
    const decide = (email: string, hostedDomain?: string, emailVerified = true) =>
      resolveAccess(db, { email, emailVerified, hostedDomain }, { teacherEmail });

    expect(await decide("old.student@student.chasacademy.se", "student.chasacademy.se"))
      .toEqual({ granted: false, reason: "not-on-roster" });
    expect(await decide("someone@gmail.com")).toEqual({ granted: false, reason: "wrong-domain" });
    expect(await decide("annan.larare@chasacademy.se", "chasacademy.se"))
      .toEqual({ granted: false, reason: "wrong-domain" });
    expect(await decide("anna.a@student.chasacademy.se", "student.chasacademy.se", false))
      .toEqual({ granted: false, reason: "unverified-email" });
    // A personal Google account can't pretend to be a school address without the hd claim.
    expect(await decide("anna.a@student.chasacademy.se", undefined))
      .toEqual({ granted: false, reason: "wrong-domain" });
    // A longer domain in the import file doesn't put a look-alike address on the Roster.
    expect(await decide("ghost@student.chasacademy.se", "student.chasacademy.se"))
      .toEqual({ granted: false, reason: "not-on-roster" });

    await db.update(cohorts).set({ endsOn: "2026-01-31" });
    expect(await decide("anna.a@student.chasacademy.se", "student.chasacademy.se"))
      .toEqual({ granted: false, reason: "cohort-ended" });
  });
});

describe("importRoster", () => {
  it("refuses a file without student addresses and reports Students moved between Cohorts", async () => {
    await importRoster(db, "FJS25", "anna.a@student.chasacademy.se");

    await expect(importRoster(db, "FJS26", "Student\n\"Nobody\",x@gmail.com")).rejects.toThrow(
      /No @student.chasacademy.se addresses/,
    );
    const result = await importRoster(db, "FJS26", "anna.a@student.chasacademy.se");

    expect(result.moved).toEqual([{ email: "anna.a@student.chasacademy.se", from: "FJS25" }]);
    expect(
      await resolveAccess(db, {
        email: "anna.a@student.chasacademy.se",
        emailVerified: true,
        hostedDomain: "student.chasacademy.se",
      }, { teacherEmail }),
    ).toMatchObject({ granted: true, cohortName: "FJS26" });
  });
});
