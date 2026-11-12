import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createPool } from "../src/db/pool";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { importRoster, logsQuestions, resolveAccess, usageKeyFor, viewAs } from "../src/access";
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

describe("viewAs", () => {
  async function cohort(name: string) {
    const [row] = await db.insert(cohorts).values({ name }).returning({ id: cohorts.id });
    return row.id;
  }

  it("lets the Teacher view as a Student of the chosen Cohort", async () => {
    const fjs26 = await cohort("FJS26");

    expect(await viewAs(db, { role: "teacher" }, fjs26)).toEqual({
      role: "student",
      cohortId: fjs26,
      cohortName: "FJS26",
      viewingAsTeacher: true,
    });
  });

  it("keeps the Teacher a Teacher with no Cohort chosen, or one that doesn't exist", async () => {
    expect(await viewAs(db, { role: "teacher" }, null)).toEqual({ role: "teacher" });
    expect(await viewAs(db, { role: "teacher" }, "00000000-0000-0000-0000-000000000000")).toEqual({ role: "teacher" });
    expect(await viewAs(db, { role: "teacher" }, "inte-ett-id")).toEqual({ role: "teacher" });
  });

  it("keeps the Teacher a Teacher for a Cohort that has ended, as no Student can get in", async () => {
    const [ended] = await db
      .insert(cohorts)
      .values({ name: "FJS24", endsOn: "2026-06-12" })
      .returning({ id: cohorts.id });

    expect(await viewAs(db, { role: "teacher" }, ended.id, { today: new Date("2026-11-12") })).toEqual({
      role: "teacher",
    });
  });

  it("never lets a Student switch to another Cohort", async () => {
    const own = await cohort("FJS26");
    const other = await cohort("FJS27");
    const student = { role: "student" as const, cohortId: own, cohortName: "FJS26" };

    expect(await viewAs(db, student, other)).toEqual(student);
  });

  it("logs the questions of real Students only, not of the Teacher viewing as one", async () => {
    const fjs26 = await cohort("FJS26");
    const viewingAs = await viewAs(db, { role: "teacher" }, fjs26);

    expect(logsQuestions({ role: "student", cohortId: fjs26, cohortName: "FJS26" })).toBe(true);
    expect(logsQuestions(viewingAs)).toBe(false);
    expect(logsQuestions({ role: "teacher" })).toBe(false);
  });
});

describe("usageKeyFor", () => {
  it("gives a Student the same key every time, without revealing their address", () => {
    const key = usageKeyFor("Anna.A@student.chasacademy.se", "hemlighet");

    expect(usageKeyFor("anna.a@student.chasacademy.se", "hemlighet")).toBe(key);
    expect(usageKeyFor("bo.b@student.chasacademy.se", "hemlighet")).not.toBe(key);
    expect(key).not.toMatch(/anna|student|chasacademy/i);
  });

  it("can't be recomputed from the address alone, without the app's secret", () => {
    expect(usageKeyFor("anna.a@student.chasacademy.se", "en annan")).not.toBe(
      usageKeyFor("anna.a@student.chasacademy.se", "hemlighet"),
    );
  });
});
