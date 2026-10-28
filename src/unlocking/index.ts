/** Dates are ISO calendar dates (YYYY-MM-DD) in Swedish time, so they compare as strings. */
export type IsoDate = string;

/** What unlocking needs to know about a piece of material, all taken from Notion (ADR 0001). */
export type UnlockInputs = {
  kind: "session" | "study-material" | "assignment" | "course-goal";
  /** The start of the Course period the material belongs to. */
  courseStartsOn: IsoDate;
  /** A Session's date. */
  sessionDate?: IsoDate | null;
};

export type UnlockStatus = { status: "unlocked" | "upcoming"; unlocksOn: IsoDate };

/** The date material becomes Unlocked: a Session on its date, everything else when its Course starts. */
export function unlocksOn(material: UnlockInputs): IsoDate {
  return material.kind === "session" && material.sessionDate ? material.sessionDate : material.courseStartsOn;
}

/** The date unlocking uses for a Cohort: its fixed "today" if it has one (the Demo Cohort, ADR 0001). */
export function cohortToday(cohort: { fixedToday: IsoDate | null }, today: IsoDate): IsoDate {
  return cohort.fixedToday ?? today;
}

/** Today's date in Sweden, where the Cohorts are. */
export function swedishToday(now = new Date()): IsoDate {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm" }).format(now);
}

/** Whether material is Unlocked for a Cohort today. */
export function unlockStatus(
  material: UnlockInputs,
  cohort: { fixedToday: IsoDate | null },
  today: IsoDate,
): UnlockStatus {
  const date = unlocksOn(material);
  return { status: date <= cohortToday(cohort, today) ? "unlocked" : "upcoming", unlocksOn: date };
}
