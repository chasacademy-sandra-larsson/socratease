import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createFakeModels } from "../src/ai/fake";
import { answer } from "../src/answering";
import { createPool } from "../src/db/pool";
import { cohorts } from "../src/db/schema";
import { indexSource } from "../src/material";
import { isoWeek, lastDayOfWeek, logQuestion } from "../src/question-log";
import { questionInsights } from "../src/teacher-view";
import { TEST_COURSE_TODAY, testCourse } from "../fixtures/test-course";

// Tests the Teacher view's insights, with the Question Log filled the way Students fill it.
const pool = createPool();
const db = drizzle(pool);
const models = createFakeModels();

let cohortId: string;
beforeEach(async () => {
  await db.execute(sql`truncate cohorts cascade`);
  const [cohort] = await db
    .insert(cohorts)
    .values({ name: "FJS-TEACHER", fixedToday: TEST_COURSE_TODAY })
    .returning({ id: cohorts.id });
  cohortId = cohort.id;
  for (const source of testCourse) await indexSource(db, models, cohortId, source);
});
afterAll(() => pool.end());

/** Asks as a Student would on the given day, and waits for the answer so it is logged. */
async function ask(question: string, today = TEST_COURSE_TODAY) {
  const result = await answer({ db, models }, { question, conversation: [], cohortId, today });
  await result.result.text;
}

describe("questionInsights", () => {
  it("lists Unanswered Questions verbatim, grouped by the Course running that week", async () => {
    await ask("Hur fungerar useEffect?");
    await ask("Vad är en SQL-join?", "2026-10-08");

    const { unanswered } = await questionInsights(db, cohortId);

    expect(unanswered).toEqual([
      { week: "2026-W41", course: "Testkurs: JavaScript-grunder", questions: ["Vad är en SQL-join?"] },
      { week: "2026-W40", course: "Testkurs: JavaScript-grunder", questions: ["Hur fungerar useEffect?"] },
    ]);
  });

  it("lists an Unanswered Question from before any Course started without a Course", async () => {
    await ask("Hur fungerar useEffect?", "2026-08-10");

    const { unanswered } = await questionInsights(db, cohortId);

    expect(unanswered).toEqual([{ week: "2026-W33", course: null, questions: ["Hur fungerar useEffect?"] }]);
  });

  it("lists the uncovered part of a partly covered question, without its code", async () => {
    await logQuestion(db, {
      cohortId,
      askedOn: TEST_COURSE_TODAY,
      question: "Vad är const, och vad är en closure?",
      kind: "direct",
      topic: "Variabler: let och const",
      sources: ["Variabler: let och const"],
      uncoveredPart: "vad en closure är, som i `const counter = makeCounter();`",
    });

    const { unanswered } = await questionInsights(db, cohortId);

    expect(unanswered).toEqual([
      { week: "2026-W40", course: "Testkurs: JavaScript-grunder", questions: ["vad en closure är, som i [kod borttagen]"] },
    ]);
  });

  it("counts questions per Topic per week, most asked first", async () => {
    await ask("Vad är skillnaden mellan let och const?");
    await ask("Kan man ändra ett objekt som ligger i en const?");
    await ask("Vad skapar map?");
    await ask("Vad skapar map?", "2026-10-08");

    const { topics } = await questionInsights(db, cohortId);

    expect(topics).toEqual([
      { week: "2026-W41", topic: "Arrayer: map och filter", count: 1 },
      { week: "2026-W40", topic: "Variabler: let och const", count: 2 },
      { week: "2026-W40", topic: "Arrayer: map och filter", count: 1 },
    ]);
  });

  it("ranks the Sources answers used most, with links", async () => {
    await ask("Vad är skillnaden mellan let och const?");
    await ask("Kan man ändra ett objekt som ligger i en const?");
    await ask("Vad skapar map?");

    const { sources } = await questionInsights(db, cohortId);

    expect(sources.slice(0, 2)).toEqual([
      { title: "Variabler: let och const", url: "https://example.org/testkurs#let-const", count: 2 },
      { title: "Arrayer: map och filter", url: "https://example.org/testkurs#map-filter", count: 1 },
    ]);
  });

  it.each([
    ["2026-10-01", "2026-W40", "2026-10-04"],
    ["2026-12-31", "2026-W53", "2027-01-03"],
    ["2027-01-01", "2026-W53", "2027-01-03"],
  ])("finds the Sunday of the week %s is in", (day, week, sunday) => {
    expect(isoWeek(day)).toBe(week);
    expect(lastDayOfWeek(week)).toBe(sunday);
  });
});
