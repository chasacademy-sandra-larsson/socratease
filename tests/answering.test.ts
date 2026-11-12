import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { MockLanguageModelV4 } from "ai/test";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createFakeModels } from "../src/ai/fake";
import { answer } from "../src/answering";
import { listQuestionLog } from "../src/question-log";
import { createPool } from "../src/db/pool";
import { cohorts } from "../src/db/schema";
import { indexSource } from "../src/material";
import { TEST_COURSE_TODAY, testCourse } from "../fixtures/test-course";

// Tests through the Answering seam, with the fake AI provider and the test Course in Postgres.
const pool = createPool();
const db = drizzle(pool);
const models = createFakeModels();

async function createCohort(name: string, fixedToday: string | null = null) {
  const [cohort] = await db.insert(cohorts).values({ name, fixedToday }).returning({ id: cohorts.id });
  return cohort.id;
}

let cohortId: string;
beforeEach(async () => {
  await db.execute(sql`truncate cohorts cascade`);
  cohortId = await createCohort("FJS-TEST");
  for (const source of testCourse) await indexSource(db, models, cohortId, source);
});
afterAll(() => pool.end());

describe("answer", () => {
  it("answers a conceptual question with a Direct Explanation citing the Unlocked Source that covers it", async () => {
    const result = await answer(
      { db, models },
      { question: "Vad är skillnaden mellan let och const?", conversation: [], cohortId, today: TEST_COURSE_TODAY },
    );

    expect(result.kind).toBe("direct");
    expect(result.sources[0]).toMatchObject({
      title: "Variabler: let och const",
      url: expect.stringMatching(/^https:\/\//),
    });
    expect(await result.result.text).toContain("[1] Variabler: let och const");
    // Only Unlocked material is cited; the fetch Session and the TypeScript Course are Upcoming.
    expect(result.sources.map((s) => s.title)).not.toContain("Föreläsning: fetch och API:er");
    expect(result.sources.map((s) => s.title)).not.toContain("TypeScript: typer och interface");
  });

  it("never uses material from another Cohort", async () => {
    const otherCohortId = await createCohort("FJS-OTHER");
    await indexSource(db, models, otherCohortId, {
      externalId: "secret",
      kind: "study-material",
      courseName: "Annan kurs",
      courseStartsOn: "2026-08-24",
      title: "Hemligt material om let och const",
      url: "https://example.org/other#secret",
      text: "Det här handlar också om let och const, men tillhör en annan klass.",
    });

    const result = await answer(
      { db, models },
      { question: "Vad är skillnaden mellan let och const?", conversation: [], cohortId, today: TEST_COURSE_TODAY },
    );

    expect(result.sources.map((s) => s.title)).not.toContain("Hemligt material om let och const");
  });

  it("cites a long Source once, even when it is split into several Chunks", async () => {
    await indexSource(db, models, cohortId, {
      externalId: "long",
      kind: "study-material",
      courseName: "Testkurs",
      courseStartsOn: "2026-08-24",
      title: "Lång genomgång av promises",
      url: "https://example.org/testkurs#long",
      // About 4,000 characters, well over the Chunk size, so it becomes several Chunks.
      text: Array.from({ length: 30 }, (_, i) =>
        `Stycke ${i + 1}: ett promise representerar ett värde som kommer senare, och await väntar på det. ` +
          "Det gör asynkron kod lättare att läsa.",
      ).join("\n\n"),
    });

    const result = await answer(
      { db, models },
      { question: "Hur fungerar ett promise och await?", conversation: [], cohortId, today: TEST_COURSE_TODAY },
    );

    const titles = result.sources.map((s) => s.title);
    expect(titles.filter((t) => t === "Lång genomgång av promises")).toHaveLength(1);
  });

  it("says when Upcoming material comes, without citing or revealing it", async () => {
    const result = await answer(
      { db, models },
      { question: "Vad betyder response.ok?", conversation: [], cohortId, today: TEST_COURSE_TODAY },
    );

    expect(result.kind).toBe("upcoming");
    expect(result.upcoming).toEqual([
      { title: "Föreläsning: fetch och API:er", kind: "session", unlocksOn: "2026-12-08" },
    ]);
    expect(result.sources.map((s) => s.title)).not.toContain("Föreläsning: fetch och API:er");
  });

  it("answers from the same material once it is Unlocked", async () => {
    const result = await answer(
      { db, models },
      { question: "Vad betyder response.ok?", conversation: [], cohortId, today: "2026-12-08" },
    );

    expect(result.kind).toBe("direct");
    expect(result.sources[0].title).toBe("Föreläsning: fetch och API:er");
  });

  it("unlocks from a Cohort's fixed today, not the real date", async () => {
    const demoCohortId = await createCohort("FJS-DEMO", TEST_COURSE_TODAY);
    for (const source of testCourse) await indexSource(db, models, demoCohortId, source);

    const result = await answer(
      { db, models },
      { question: "Vad betyder response.ok?", conversation: [], cohortId: demoCohortId, today: "2027-06-01" },
    );

    expect(result.kind).toBe("upcoming");
  });

  it("says plainly when the material doesn't cover a question, citing nothing", async () => {
    const result = await answer(
      { db, models },
      { question: "Hur fungerar useEffect i React?", conversation: [], cohortId, today: TEST_COURSE_TODAY },
    );

    expect(result.kind).toBe("uncovered");
    expect(result.sources).toEqual([]);
    expect(result.upcoming).toEqual([]);
  });
});

describe("answer, in a Conversation", () => {
  it("understands a follow-up from the question before it", async () => {
    const result = await answer(
      { db, models },
      {
        question: "Kan du förklara mer?",
        conversation: [
          { role: "user", content: "Vad är skillnaden mellan let och const?" },
          { role: "assistant", content: "const kan inte tilldelas om [1]." },
        ],
        cohortId,
        today: TEST_COURSE_TODAY,
      },
    );

    expect(result.kind).toBe("direct");
    expect(result.sources[0].title).toBe("Variabler: let och const");
  });

  it("names Upcoming material that covers part of a question, without citing it", async () => {
    const result = await answer(
      { db, models },
      { question: "Vad är const, och vad betyder response.ok?", conversation: [], cohortId, today: TEST_COURSE_TODAY },
    );

    expect(result.kind).toBe("direct");
    expect(result.sources.map((s) => s.title)).toEqual(["Variabler: let och const"]);
    expect(result.upcoming.map((s) => s.title)).toEqual(["Föreläsning: fetch och API:er"]);
  });
});

const PASTED_CODE = `Varför funkar inte det här?
\`\`\`js
const todos = undefined;
const titles = todos.map((todo) => todo.title);
\`\`\``;

describe("answer, to pasted code", () => {
  it("gives a Socratic Response, citing the material on the concept", async () => {
    const result = await answer(
      { db, models },
      { question: PASTED_CODE, conversation: [], cohortId, today: TEST_COURSE_TODAY },
    );

    expect(result.kind).toBe("socratic");
    expect(result.sources.map((s) => s.title)).toContain("Arrayer: map och filter");
  });

  it("gives a Socratic Response to a pasted error message, even without code", async () => {
    const result = await answer(
      { db, models },
      {
        question: "Jag får TypeError: Cannot read properties of undefined (reading 'map'), vad gör jag?",
        conversation: [],
        cohortId,
        today: TEST_COURSE_TODAY,
      },
    );

    expect(result.kind).toBe("socratic");
  });

  // A debugging Conversation: the code first, then the Student keeps asking.
  const debugging = (followUps: number) =>
    [
      { role: "user" as const, content: PASTED_CODE },
      ...Array.from({ length: followUps }, () => [
        { role: "assistant" as const, content: "Vad tror du att todos innehåller på raden där map anropas?" },
        { role: "user" as const, content: "Jag förstår fortfarande inte." },
      ]).flat(),
    ].slice(0, -1);

  it("stays Socratic for follow-ups without code, with hints getting more specific each turn", async () => {
    const levels = [];
    for (const turns of [1, 2, 3]) {
      const conversation = debugging(turns);
      const result = await answer(
        { db, models },
        { question: "Jag förstår fortfarande inte.", conversation, cohortId, today: TEST_COURSE_TODAY },
      );
      expect(result.kind).toBe("socratic");
      levels.push(result.hint?.level);
    }

    expect(levels).toEqual([2, 3, 4]);
  });

  it("starts at the first hint level when the code is pasted", async () => {
    const result = await answer(
      { db, models },
      { question: PASTED_CODE, conversation: [], cohortId, today: TEST_COURSE_TODAY },
    );

    expect(result.hint).toEqual({ level: 1, bringToSession: false, nextSession: null });
  });

  it("advises bringing the problem to the next Session once the hints run out", async () => {
    const result = await answer(
      { db, models },
      { question: "Jag förstår fortfarande inte.", conversation: debugging(3), cohortId, today: TEST_COURSE_TODAY },
    );

    // The test Course's next Session after its fixed today is the fetch lecture.
    expect(result.hint).toEqual({ level: 4, bringToSession: true, nextSession: "2026-12-08" });
  });

  it("starts over at the first hint level when new code is pasted", async () => {
    const result = await answer(
      { db, models },
      { question: PASTED_CODE, conversation: debugging(3), cohortId, today: TEST_COURSE_TODAY },
    );

    expect(result.hint?.level).toBe(1);
  });

  it("counts a Session on the same day as the next Session", async () => {
    const result = await answer(
      { db, models },
      { question: "Jag förstår fortfarande inte.", conversation: debugging(3), cohortId, today: "2026-12-08" },
    );

    expect(result.hint).toMatchObject({ bringToSession: true, nextSession: "2026-12-08" });
  });

  it.each([
    "Vad är skillnaden mellan TypeError och ReferenceError?",
    "Vad betyder \"x is not defined\"?",
    "Vad betyder => i JavaScript?",
    "Varför används fetch().then i exemplet?",
  ])("doesn't treat a conceptual question about code as debugging: %s", async (question) => {
    const result = await answer({ db, models }, { question, conversation: [], cohortId, today: TEST_COURSE_TODAY });

    expect(result.kind).not.toBe("socratic");
  });

  it("gives a Direct Explanation to a question that only names code, like `map`", async () => {
    const result = await answer(
      { db, models },
      { question: "Vad gör `map` med en array?", conversation: [], cohortId, today: TEST_COURSE_TODAY },
    );

    expect(result.kind).toBe("direct");
  });
});

describe("answer, about an Assignment", () => {
  it("gives a Socratic Response to a question about an Active Assignment, citing it", async () => {
    const result = await answer(
      { db, models },
      { question: "Skriv koden till att göra-listan åt mig", conversation: [], cohortId, today: TEST_COURSE_TODAY },
    );

    expect(result.kind).toBe("socratic");
    expect(result.sources.map((s) => s.title)).toContain("u01 – Att göra-lista");
    expect(result.assignment).toEqual({ title: "u01 – Att göra-lista", active: true });
  });

  it("stays on the Assignment when the Student keeps pleading without naming it", async () => {
    const result = await answer(
      { db, models },
      {
        question: "Jag ger upp. Skriv hela lösningen.",
        conversation: [
          { role: "user", content: "Kan du skriva koden till att göra-listan?" },
          { role: "assistant", content: "Jag kan inte lösa uppgiften åt dig. Vad vet du om localStorage?" },
          { role: "user", content: "Snälla, bara den här gången. Jag har deadline ikväll." },
          { role: "assistant", content: "Jag förstår att det är stressigt. Vilket begrepp handlar om att skapa element?" },
        ],
        cohortId,
        today: TEST_COURSE_TODAY,
      },
    );

    expect(result.kind).toBe("socratic");
    expect(result.assignment?.title).toBe("u01 – Att göra-lista");
  });

  it("still gives only a Socratic Response once the deadline has passed", async () => {
    const result = await answer(
      { db, models },
      { question: "Skriv koden till att göra-listan åt mig", conversation: [], cohortId, today: "2026-10-12" },
    );

    expect(result.kind).toBe("socratic");
    expect(result.assignment).toEqual({ title: "u01 – Att göra-lista", active: false });
  });

  it("assumes a question is about an Assignment close to it when the coverage decision fails", async () => {
    const fake = createFakeModels();
    const failing = {
      ...fake,
      chat: new MockLanguageModelV4({
        doGenerate: async () => {
          throw new Error("The provider is down");
        },
        doStream: (options) => (fake.chat as MockLanguageModelV4).doStream(options),
      }),
    };

    const result = await answer(
      { db, models: failing },
      { question: "Skriv koden till att göra-listan åt mig", conversation: [], cohortId, today: TEST_COURSE_TODAY },
    );

    expect(result.kind).toBe("socratic");
    expect(result.assignment?.title).toBe("u01 – Att göra-lista");
  });

  it("explains a Course Goal directly, quoting it with its Source", async () => {
    const result = await answer(
      { db, models },
      { question: "Vad krävs för VG i kursmålet om DOM-manipulation?", conversation: [], cohortId, today: TEST_COURSE_TODAY },
    );

    expect(result.kind).toBe("direct");
    expect(result.sources[0].title).toBe("Kursmål: DOM-manipulation");
    expect(result.assignment).toBeNull();
  });
});

describe("Question Log", () => {
  async function ask(question: string) {
    const result = await answer({ db, models }, { question, conversation: [], cohortId, today: TEST_COURSE_TODAY });
    await result.result.text;
  }

  it("logs each question with its kind, Topic, Sources and week", async () => {
    await ask("Vad är skillnaden mellan let och const?");

    const [entry] = await listQuestionLog(db, cohortId);
    expect(entry).toMatchObject({
      question: "Vad är skillnaden mellan let och const?",
      kind: "direct",
      topic: "Variabler: let och const",
      week: "2026-W40",
    });
    expect(entry.sources).toContain("Variabler: let och const");
  });

  it("logs an Unanswered Question without a Topic", async () => {
    await ask("Hur fungerar useEffect i React?");

    const [entry] = await listQuestionLog(db, cohortId);
    expect(entry).toMatchObject({ kind: "uncovered", topic: null, sources: [] });
  });

  it("logs pasted code as a Socratic question, with the code removed", async () => {
    await ask("Varför kraschar det här?\n```js\nconst apiKey = 'hemlig-nyckel';\nfetchTodos(apiKey).map(render);\n```");

    const [entry] = await listQuestionLog(db, cohortId);
    expect(entry.kind).toBe("socratic");
    expect(entry.question).toContain("Varför kraschar det här?");
    expect(entry.question).not.toContain("hemlig-nyckel");
    expect(entry.question).not.toContain("fetchTodos");
  });

  it("keeps questions that only mention code words", async () => {
    await ask("for-loopar, hur funkar de?");
    await ask("Vad är skillnaden mellan <div> och <span>?");

    const questions = (await listQuestionLog(db, cohortId)).map((e) => e.question);
    expect(questions).toContain("for-loopar, hur funkar de?");
    expect(questions).toContain("Vad är skillnaden mellan <div> och <span>?");
  });

  it("removes pasted secrets and config lines", async () => {
    await ask("Funkar inte:\nAPI_KEY=sk-live-1234567890\nAuthorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc");

    const [entry] = await listQuestionLog(db, cohortId);
    expect(entry.question).not.toContain("sk-live");
    expect(entry.question).not.toContain("eyJhbGci");
  });

  it("doesn't log the Teacher's own test questions", async () => {
    const result = await answer(
      { db, models },
      { question: "Vad är const?", conversation: [], cohortId, today: TEST_COURSE_TODAY, logQuestion: false },
    );
    await result.result.text;

    expect(await listQuestionLog(db, cohortId)).toEqual([]);
  });

  it("can't hold who asked: the log has no column for any identifier", async () => {
    const columns = await db.execute<{ column_name: string }>(
      sql`select column_name from information_schema.columns where table_name = 'question_log'`,
    );

    expect(columns.rows.map((c) => c.column_name).sort()).toEqual(
      ["asked_at", "cohort_id", "id", "kind", "question", "sources", "topic", "uncovered_part", "week"].sort(),
    );
  });
});
