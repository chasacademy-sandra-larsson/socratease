import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { cohorts, rosterEntries } from "@/db/schema";

const STUDENT_DOMAIN = "student.chasacademy.se";
const TEACHER_DOMAIN = "chasacademy.se";

type Db = NodePgDatabase;

/**
 * Who is using SocratEase. Carries no name or email (ADR 0003). A Student with
 * `viewingAsTeacher` is the Teacher trying SocratEase as a Student of that Cohort.
 */
export type Viewer =
  | { role: "student"; cohortId: string; cohortName: string; viewingAsTeacher?: true }
  | { role: "teacher" };

export type DeniedReason = "unverified-email" | "wrong-domain" | "not-on-roster" | "cohort-ended";

export type AccessDecision = ({ granted: true } & Viewer) | { granted: false; reason: DeniedReason };

/** What Google tells us about the person logging in. */
export type GoogleIdentity = {
  email: string;
  emailVerified: boolean;
  /** Google's `hd` claim: set only for Google Workspace accounts. */
  hostedDomain?: string;
};

export async function resolveAccess(
  db: Db,
  identity: GoogleIdentity,
  { teacherEmail, today = new Date() }: { teacherEmail: string; today?: Date },
): Promise<AccessDecision> {
  if (!identity.emailVerified) return { granted: false, reason: "unverified-email" };
  const email = normalise(identity.email);

  if (identity.hostedDomain === TEACHER_DOMAIN && email === normalise(teacherEmail)) {
    return { granted: true, role: "teacher" };
  }
  if (identity.hostedDomain !== STUDENT_DOMAIN || !email.endsWith(`@${STUDENT_DOMAIN}`)) {
    return { granted: false, reason: "wrong-domain" };
  }

  const [entry] = await db
    .select({ cohortId: cohorts.id, cohortName: cohorts.name, endsOn: cohorts.endsOn })
    .from(rosterEntries)
    .innerJoin(cohorts, eq(rosterEntries.cohortId, cohorts.id))
    .where(eq(rosterEntries.email, email));
  if (!entry) return { granted: false, reason: "not-on-roster" };
  if (entry.endsOn && entry.endsOn < today.toISOString().slice(0, 10)) {
    return { granted: false, reason: "cohort-ended" };
  }

  return { granted: true, role: "student", cohortId: entry.cohortId, cohortName: entry.cohortName };
}

/**
 * The Viewer a page or request acts as: the Teacher who chose to view as a Student of a Cohort
 * becomes that Student. Anyone else stays who they are, so a Student can never switch.
 */
export async function viewAs(
  db: Db,
  viewer: Viewer,
  cohortId: string | null,
  { today = new Date() }: { today?: Date } = {},
): Promise<Viewer> {
  if (viewer.role !== "teacher" || !cohortId || !UUID.test(cohortId)) return viewer;
  const [cohort] = await db
    .select({ name: cohorts.name, endsOn: cohorts.endsOn })
    .from(cohorts)
    .where(eq(cohorts.id, cohortId));
  // An ended Cohort has no Students who can get in, so there is nothing to view as.
  if (!cohort || (cohort.endsOn && cohort.endsOn < today.toISOString().slice(0, 10))) return viewer;
  return { role: "student", cohortId, cohortName: cohort.name, viewingAsTeacher: true };
}

/**
 * Whether a Viewer's questions go to the Question Log: only real Students'. The Teacher's own
 * questions, also when viewing as a Student, would distort what the log shows about Students.
 */
export function logsQuestions(viewer: Viewer): boolean {
  return viewer.role === "student" && !viewer.viewingAsTeacher;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every Cohort, the ones synced from Notion (the real ones) first. */
export async function listCohorts(db: Db) {
  return db
    .select({ id: cohorts.id, name: cohorts.name })
    .from(cohorts)
    .orderBy(sql`${cohorts.notionRootPageId} is null`, asc(cohorts.name));
}

/**
 * Replaces a Cohort's Roster with the student addresses found in `text`, creating the
 * Cohort if needed. Accepts a plain list or a Canvas CSV export: any
 * @student.chasacademy.se address anywhere in the text counts.
 */
export async function importRoster(db: Db, cohortName: string, text: string) {
  const emails = [
    ...new Set(
      // The lookahead stops a longer domain (…@student.chasacademy.se.example.org) from matching.
      (text.match(/[A-Za-z0-9._%+-]+@student\.chasacademy\.se(?![\w.-])/gi) ?? []).map(normalise),
    ),
  ];
  // An empty or wrong file must not wipe the Roster and lock every Student out.
  if (emails.length === 0) {
    throw new Error(`No @${STUDENT_DOMAIN} addresses found; the Roster for ${cohortName} is unchanged`);
  }

  return db.transaction(async (tx) => {
    const [cohort] = await tx
      .insert(cohorts)
      .values({ name: cohortName })
      .onConflictDoUpdate({ target: cohorts.name, set: { name: cohortName } })
      .returning({ id: cohorts.id });

    // A Student belongs to one Cohort; report anyone this import moves from another one.
    const moved = await tx
      .select({ email: rosterEntries.email, from: cohorts.name })
      .from(rosterEntries)
      .innerJoin(cohorts, eq(rosterEntries.cohortId, cohorts.id))
      .where(and(inArray(rosterEntries.email, emails), ne(rosterEntries.cohortId, cohort.id)));

    await tx.delete(rosterEntries).where(eq(rosterEntries.cohortId, cohort.id));
    await tx
      .insert(rosterEntries)
      .values(emails.map((email) => ({ email, cohortId: cohort.id })))
      .onConflictDoUpdate({ target: rosterEntries.email, set: { cohortId: cohort.id } });
    return { cohortId: cohort.id, imported: emails.length, moved };
  });
}

function normalise(email: string) {
  return email.trim().toLowerCase();
}
