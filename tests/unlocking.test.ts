import { describe, expect, it } from "vitest";
import { unlockStatus } from "../src/unlocking";

const course = { courseStartsOn: "2026-09-01" };
const realCohort = { fixedToday: null };

describe("unlockStatus", () => {
  it("unlocks a Session on its date, not before", () => {
    const session = { ...course, kind: "session" as const, sessionDate: "2026-10-15" };

    expect(unlockStatus(session, realCohort, "2026-10-14")).toEqual({ status: "upcoming", unlocksOn: "2026-10-15" });
    expect(unlockStatus(session, realCohort, "2026-10-15")).toEqual({ status: "unlocked", unlocksOn: "2026-10-15" });
  });

  it("unlocks Study Material and Assignments when their Course starts", () => {
    for (const kind of ["study-material", "assignment"] as const) {
      expect(unlockStatus({ ...course, kind }, realCohort, "2026-08-31").status).toBe("upcoming");
      expect(unlockStatus({ ...course, kind }, realCohort, "2026-09-01").status).toBe("unlocked");
    }
  });

  it("uses a Cohort's fixed today instead of the real date", () => {
    const session = { ...course, kind: "session" as const, sessionDate: "2026-10-15" };
    const demoCohort = { fixedToday: "2026-10-01" };

    expect(unlockStatus(session, demoCohort, "2027-01-01").status).toBe("upcoming");
  });
});
