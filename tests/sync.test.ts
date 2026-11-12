import { asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createFakeModels } from "../src/ai/fake";
import { createPool } from "../src/db/pool";
import { chunks, cohorts, sources } from "../src/db/schema";
import { syncCohort } from "../src/sync";
import { createFakeNotion, type FakeBlock } from "./fake-notion";

// Tests through the Sync seam: a fake Notion shaped like FJS26 in, Sources and Chunks out.
const pool = createPool();
const db = drizzle(pool);
const models = createFakeModels();
const ROOT = "root-fjs26";

let cohortId: string;
beforeEach(async () => {
  await db.execute(sql`truncate cohorts cascade`);
  const [cohort] = await db
    .insert(cohorts)
    .values({ name: "FJS-SYNC", notionRootPageId: ROOT })
    .returning({ id: cohorts.id });
  cohortId = cohort.id;
});
afterAll(() => pool.end());

async function syncedSources() {
  const rows = await db
    .select({
      kind: sources.kind,
      courseName: sources.courseName,
      title: sources.title,
      url: sources.url,
      unlocksOn: sources.unlocksOn,
      text: chunks.text,
    })
    .from(sources)
    .innerJoin(chunks, eq(chunks.sourceId, sources.id))
    .where(eq(sources.cohortId, cohortId))
    .orderBy(asc(sources.title), asc(chunks.position));
  return rows;
}

const course = {
  id: "course-fe",
  properties: { Kursnamn: "Frontendutveckling", Period: "2026-09-14" },
};

function database(id: string, title: string, rows: FakeBlock["rows"]): FakeBlock {
  return { id, type: "child_database", text: title, rows };
}

describe("syncCohort", () => {
  it("turns a Session in Schema into a Source titled by its Innehåll, with its callouts as text", async () => {
    const { reader } = createFakeNotion(ROOT, [
      database("db-kurser", "Översikt kurser", [course]),
      database("db-schema", "Schema", [
        {
          id: "session-mutable",
          properties: {
            Aktivitet: "Föreläsning",
            Innehåll: "• Mutable och immutable: värden, referenser, spread och rest",
            Datum: "2026-11-03",
            Kurs: ["course-fe"],
          },
          children: [
            {
              id: "callout-content",
              type: "callout",
              text: "Föreläsningens innehåll",
              children: [
                { id: "p-agenda", type: "paragraph", text: "Agenda" },
                { id: "li-1", type: "bulleted_list_item", text: "Spread kopierar bara första nivån" },
              ],
            },
          ],
        },
      ]),
    ]);

    await syncCohort({ db, models, notion: reader }, cohortId);

    const synced = await syncedSources();
    expect(synced).toHaveLength(1);
    expect(synced[0]).toMatchObject({
      kind: "session",
      courseName: "Frontendutveckling",
      title: "Mutable och immutable: värden, referenser, spread och rest",
      url: "https://notion.example/session-mutable",
      unlocksOn: "2026-11-03",
    });
    expect(synced[0].text).toContain("Föreläsningens innehåll");
    expect(synced[0].text).toContain("Spread kopierar bara första nivån");
  });

  it("turns each toggle under Instudering on a Course page into Study Material linking to the toggle", async () => {
    const { reader } = createFakeNotion(ROOT, [
      database("db-kurser", "Översikt kurser", [
        {
          ...course,
          children: [
            { id: "callout-om", type: "callout", text: "Om kursen", children: [{ id: "p-om", type: "paragraph", text: "Kursen pågår i åtta veckor." }] },
            { id: "h2-instudering", type: "heading_2", text: "Instudering" },
            { id: "p-intro", type: "paragraph", text: "Här hittar du studiematerialet för kursen." },
            {
              id: "toggle-js",
              type: "toggle",
              text: "3. JavaScript & DOM",
              children: [{ id: "p-js", type: "paragraph", text: "DOM:en är sidan som ett träd av objekt." }],
            },
            {
              id: "toggle-api",
              type: "toggle",
              text: "4. API:er & datahantering",
              children: [{ id: "p-api", type: "paragraph", text: "fetch returnerar ett promise." }],
            },
            { id: "h2-exam", type: "heading_2", text: "Examinationsmoment" },
            { id: "toggle-after", type: "toggle", text: "Inte instudering", children: [{ id: "p-x", type: "paragraph", text: "x" }] },
          ],
        },
      ]),
    ]);

    await syncCohort({ db, models, notion: reader }, cohortId);

    const synced = await syncedSources();
    expect(synced.map((s) => s.title)).toEqual(["3. JavaScript & DOM", "4. API:er & datahantering"]);
    expect(synced[0]).toMatchObject({
      kind: "study-material",
      courseName: "Frontendutveckling",
      url: "https://notion.example/course-fe#togglejs",
      unlocksOn: "2026-09-14",
    });
    expect(synced[0].text).toContain("DOM:en är sidan som ett träd av objekt.");
  });

  it("splits long Study Material into Chunks at its H3 headings", async () => {
    const long = (topic: string) => `${topic} är viktigt. `.repeat(50);
    const { reader } = createFakeNotion(ROOT, [
      database("db-kurser", "Översikt kurser", [
        {
          ...course,
          children: [
            { id: "h2-instudering", type: "heading_2", text: "Instudering" },
            {
              id: "toggle-html",
              type: "toggle",
              text: "1. HTML & webbens grunder",
              children: [
                { id: "p-intro", type: "paragraph", text: "HTML är betydelse, inte layout." },
                { id: "h3-syntax", type: "heading_3", text: "Syntaxen" },
                { id: "p-syntax", type: "paragraph", text: long("Syntax") },
                { id: "h3-semantik", type: "heading_3", text: "Semantisk HTML" },
                { id: "p-semantik", type: "paragraph", text: long("Semantik") },
              ],
            },
          ],
        },
      ]),
    ]);

    await syncCohort({ db, models, notion: reader }, cohortId);

    const texts = (await syncedSources()).map((s) => s.text);
    expect(texts).toHaveLength(3);
    expect(texts[0]).toContain("HTML är betydelse");
    expect(texts[1]).toMatch(/^Syntaxen/);
    expect(texts[1]).not.toContain("Semantik");
    expect(texts[2]).toMatch(/^Semantisk HTML/);
  });

  it("keeps short Study Material in one Chunk", async () => {
    const { reader } = createFakeNotion(ROOT, [
      database("db-kurser", "Översikt kurser", [
        {
          ...course,
          children: [
            { id: "h2-instudering", type: "heading_2", text: "Instudering" },
            {
              id: "toggle-css",
              type: "toggle",
              text: "2. CSS",
              children: [
                { id: "h3-a", type: "heading_3", text: "Selektorer" },
                { id: "p-a", type: "paragraph", text: "En selektor väljer element." },
                { id: "h3-b", type: "heading_3", text: "Kaskaden" },
                { id: "p-b", type: "paragraph", text: "Senare regler vinner." },
              ],
            },
          ],
        },
      ]),
    ]);

    await syncCohort({ db, models, notion: reader }, cohortId);

    expect(await syncedSources()).toHaveLength(1);
  });

  it("turns each H2 section of an Assignment, in a database on a child page, into its own Source", async () => {
    const { reader } = createFakeNotion(ROOT, [
      database("db-kurser", "Översikt kurser", [course]),
      {
        id: "page-databaser",
        type: "child_page",
        text: "Databaser",
        children: [
          database("db-exam", "Examinationsmoment", [
            {
              id: "exam-u02",
              properties: { Uppgift: "u02 - Portfolio med JavaScript", Kurs: ["course-fe"], Deadline: "2026-11-08" },
              children: [
                { id: "h2-om", type: "heading_2", text: "Om uppgiften" },
                { id: "p-om", type: "paragraph", text: "Du gör portfolion dynamisk med JavaScript." },
                { id: "h2-kod", type: "heading_2", text: "Del 1: Koden" },
                { id: "li-kod", type: "bulleted_list_item", text: "Sidan hämtar dina repon från GitHubs API." },
              ],
            },
          ]),
        ],
      },
    ]);

    await syncCohort({ db, models, notion: reader }, cohortId);

    const synced = await syncedSources();
    expect(synced.map((s) => s.title)).toEqual([
      "u02 - Portfolio med JavaScript: Del 1: Koden",
      "u02 - Portfolio med JavaScript: Om uppgiften",
    ]);
    expect(synced[0]).toMatchObject({
      kind: "assignment",
      courseName: "Frontendutveckling",
      url: "https://notion.example/exam-u02#h2kod",
      unlocksOn: "2026-09-14",
    });
    expect(synced[0].text).toContain("Sidan hämtar dina repon från GitHubs API.");
    expect(synced[0].text).not.toContain("dynamisk");
  });

  it("turns each Course Goal into a Source with its G and VG criteria", async () => {
    const { reader } = createFakeNotion(ROOT, [
      database("db-kurser", "Översikt kurser", [course]),
      database("db-mal", "Kursmål och Betygskriterier", [
        {
          id: "goal-5",
          properties: {
            Mål: "5. Redogöra för DOM:en och händelsehantering",
            "G-nivå": "Kursmålet uppfyllt",
            "VG-nivå": "Motiverar sina val med god förståelse",
            Kurs: ["course-fe"],
          },
        },
      ]),
    ]);

    await syncCohort({ db, models, notion: reader }, cohortId);

    const [goal] = await syncedSources();
    expect(goal).toMatchObject({
      kind: "course-goal",
      courseName: "Frontendutveckling",
      title: "5. Redogöra för DOM:en och händelsehantering",
      url: "https://notion.example/goal-5",
      unlocksOn: "2026-09-14",
    });
    expect(goal.text).toContain("G: Kursmålet uppfyllt");
    expect(goal.text).toContain("VG: Motiverar sina val med god förståelse");
  });

  // The callouts of FJS26's Session template, as they look before the Teacher fills them in.
  const templateCallouts: FakeBlock[] = [
    {
      id: "c-ansluta",
      type: "callout",
      text: "Ansluta till föreläsningen",
      children: [{ id: "t1", type: "paragraph", text: "🔗 Zoom-länk läggs in här · 🕙 9.15–12.00" }],
    },
    {
      id: "c-innehall",
      type: "callout",
      text: "Föreläsningens innehåll",
      children: [
        { id: "t2", type: "paragraph", text: "☝️ Skriv passets innehåll i fältet Innehåll högst upp på sidan — då syns det automatiskt i schemat." },
        { id: "t3", type: "paragraph", text: "Agenda" },
        { id: "t4", type: "bulleted_list_item", text: "Punkt 1" },
        { id: "t5", type: "bulleted_list_item", text: "Punkt 2" },
      ],
    },
    {
      id: "c-efter",
      type: "callout",
      text: "Efter passet",
      children: [
        { id: "t6", type: "bulleted_list_item", text: "📑 Presentation: läggs upp här efter passet" },
        { id: "t7", type: "bulleted_list_item", text: "✏️ Självstudier: övningar och andra resurser" },
      ],
    },
  ];

  it("skips a Session that only has template text, and reports it as not filled in", async () => {
    const { reader } = createFakeNotion(ROOT, [
      database("db-kurser", "Översikt kurser", [course]),
      database("db-schema", "Schema", [
        {
          id: "session-empty",
          properties: { Aktivitet: "Föreläsning", Innehåll: "", Datum: "2027-01-12", Kurs: ["course-fe"] },
          children: templateCallouts,
        },
      ]),
    ]);

    const report = await syncCohort({ db, models, notion: reader }, cohortId);

    expect(await syncedSources()).toEqual([]);
    expect(report.notFilledIn).toEqual(["Föreläsning 2027-01-12 (Frontendutveckling)"]);
  });

  it("leaves out the template-only callouts of a filled-in Session", async () => {
    const { reader } = createFakeNotion(ROOT, [
      database("db-kurser", "Översikt kurser", [course]),
      database("db-schema", "Schema", [
        {
          id: "session-half",
          properties: { Aktivitet: "Föreläsning", Innehåll: "• Introduktion till TypeScript", Datum: "2026-12-01", Kurs: ["course-fe"] },
          children: [
            ...templateCallouts,
            {
              id: "c-innan",
              type: "callout",
              text: "Innan passet",
              children: [{ id: "f1", type: "bulleted_list_item", text: "Installera TypeScript med npm." }],
            },
          ],
        },
      ]),
    ]);

    const report = await syncCohort({ db, models, notion: reader }, cohortId);

    const [session] = await syncedSources();
    expect(session.text).toContain("Installera TypeScript med npm.");
    expect(session.text).not.toMatch(/läggs (in|upp) här|Punkt 1|Ansluta till föreläsningen/);
    expect(report.notFilledIn).toEqual([]);
  });

  it("leaves out Zoom links, and with them the callout that only says how to join", async () => {
    const { reader } = createFakeNotion(ROOT, [
      database("db-kurser", "Översikt kurser", [course]),
      database("db-schema", "Schema", [
        {
          id: "session-zoom",
          properties: { Aktivitet: "Föreläsning", Innehåll: "• Scope", Datum: "2026-11-04", Kurs: ["course-fe"] },
          children: [
            {
              id: "c-ansluta",
              type: "callout",
              text: "Ansluta till föreläsningen",
              children: [{ id: "z1", type: "paragraph", text: "🔗 https://us06web.zoom.us/my/fjs26 · 🕙 9.15–12.00" }],
            },
            {
              id: "c-link-heading",
              type: "callout",
              text: "🔗 https://us06web.zoom.us/my/fjs26 · 🕙 10.00–12.00",
              children: [{ id: "z0", type: "bulleted_list_item", text: "Jag släpper in dig från väntrummet." }],
            },
            {
              id: "c-innehall",
              type: "callout",
              text: "Föreläsningens innehåll",
              children: [
                { id: "z2", type: "bulleted_list_item", text: "Block scope och function scope" },
                { id: "z3", type: "bulleted_list_item", text: "Frågor efteråt i Zoom: https://zoom.us/j/123" },
              ],
            },
          ],
        },
      ]),
    ]);

    await syncCohort({ db, models, notion: reader }, cohortId);

    const [session] = await syncedSources();
    expect(session.text).toContain("Block scope och function scope");
    expect(session.text).not.toMatch(/zoom|Ansluta till föreläsningen|väntrummet/i);
  });

  it("gives a Session outside any Course, such as an intro day, the Cohort's name as its Course", async () => {
    const { reader } = createFakeNotion(ROOT, [
      database("db-schema", "Schema", [
        {
          id: "session-intro",
          properties: { Aktivitet: "Intro", Innehåll: "Introdag 1: Kom igång", Datum: "2026-08-31", Kurs: [] },
        },
      ]),
    ]);

    await syncCohort({ db, models, notion: reader }, cohortId);

    expect(await syncedSources()).toMatchObject([
      { kind: "session", courseName: "FJS-SYNC", title: "Introdag 1: Kom igång", unlocksOn: "2026-08-31" },
    ]);
  });

  it("never reads outside the root: not linked pages, linked database views or related pages", async () => {
    const { reader, requested } = createFakeNotion(ROOT, [
      { id: "link-outside", type: "link_to_page", text: "page-outside" },
      { id: "view-linked", type: "child_database", text: "Untitled" },
      database("db-kurser", "Översikt kurser", [
        {
          ...course,
          children: [
            { id: "course-view", type: "child_database", text: "Untitled" },
            { id: "h2-instudering", type: "heading_2", text: "Instudering" },
            { id: "toggle-a", type: "toggle", text: "1. HTML", children: [{ id: "p-a", type: "paragraph", text: "Läs MDN." }] },
          ],
        },
      ]),
      database("db-schema", "Schema", [
        {
          id: "session-a",
          properties: { Aktivitet: "Föreläsning", Innehåll: "• HTML", Datum: "2026-09-15", Kurs: ["course-elsewhere"] },
        },
      ]),
    ]);

    await syncCohort({ db, models, notion: reader }, cohortId);

    expect(requested).not.toEqual(expect.arrayContaining(["page-outside"]));
    expect(requested).not.toEqual(expect.arrayContaining(["view-linked"]));
    expect(requested).not.toEqual(expect.arrayContaining(["course-view"]));
    expect(requested).not.toEqual(expect.arrayContaining(["course-elsewhere"]));
    expect((await syncedSources()).map((s) => s.title)).toEqual(["1. HTML", "HTML"]);
  });

  it("never reads a synced block that copies content from elsewhere", async () => {
    const { reader, requested } = createFakeNotion(ROOT, [
      database("db-schema", "Schema", [
        {
          id: "session-a",
          properties: { Aktivitet: "Föreläsning", Innehåll: "• HTML", Datum: "2026-09-15", Kurs: [] },
          children: [
            {
              id: "synced-copy",
              type: "synced_block_reference",
              children: [{ id: "p-elsewhere", type: "paragraph", text: "Text från en sida utanför FJS26" }],
            },
          ],
        },
      ]),
    ]);

    await syncCohort({ db, models, notion: reader }, cohortId);

    expect(requested).not.toEqual(expect.arrayContaining(["synced-copy"]));
  });

  it("uses the database on the root page when a child page has a view with the same title", async () => {
    const { reader, requested } = createFakeNotion(ROOT, [
      database("db-schema", "Schema", [
        { id: "session-a", properties: { Aktivitet: "Föreläsning", Innehåll: "• HTML", Datum: "2026-09-15", Kurs: [] } },
      ]),
      { id: "page-other", type: "child_page", text: "Översikt", children: [{ id: "view-schema", type: "child_database", text: "Schema" }] },
    ]);

    await syncCohort({ db, models, notion: reader }, cohortId);

    expect(requested).not.toEqual(expect.arrayContaining(["view-schema"]));
    expect(await syncedSources()).toHaveLength(1);
  });

  it("indexes an Assignment's text before its first H2 under the Assignment's own title", async () => {
    const { reader } = createFakeNotion(ROOT, [
      database("db-kurser", "Översikt kurser", [course]),
      database("db-exam", "Examinationsmoment", [
        {
          id: "exam-u03",
          properties: { Uppgift: "u03 - Quiz-app", Kurs: ["course-fe"] },
          children: [
            { id: "p-intro", type: "paragraph", text: "Ni bygger en quiz-app i grupp." },
            { id: "h2-krav", type: "heading_2", text: "Krav" },
            { id: "p-krav", type: "paragraph", text: "Appen har en tidsgräns." },
          ],
        },
      ]),
    ]);

    await syncCohort({ db, models, notion: reader }, cohortId);

    expect((await syncedSources()).map((s) => [s.title, s.url])).toEqual([
      ["u03 - Quiz-app", "https://notion.example/exam-u03"],
      ["u03 - Quiz-app: Krav", "https://notion.example/exam-u03#h2krav"],
    ]);
  });

  it("skips and reports material it can't date or place in a Course, and syncs the rest", async () => {
    const { reader } = createFakeNotion(ROOT, [
      database("db-kurser", "Översikt kurser", [
        course,
        {
          id: "course-undated",
          properties: { Kursnamn: "Examensarbete", Period: null },
          children: [
            { id: "h2-i", type: "heading_2", text: "Instudering" },
            { id: "toggle-x", type: "toggle", text: "1. Rapporten", children: [{ id: "p-x", type: "paragraph", text: "Skriv." }] },
          ],
        },
      ]),
      database("db-schema", "Schema", [
        { id: "session-undated", properties: { Aktivitet: "Workshop", Innehåll: "• Gruppövning", Datum: null, Kurs: ["course-fe"] } },
        { id: "session-ok", properties: { Aktivitet: "Föreläsning", Innehåll: "• HTML", Datum: "2026-09-15", Kurs: ["course-fe"] } },
      ]),
      database("db-exam", "Examinationsmoment", [
        { id: "exam-loose", properties: { Uppgift: "u09 - Ny uppgift", Kurs: [] }, children: [{ id: "h2-l", type: "heading_2", text: "Om" }] },
      ]),
      database("db-mal", "Kursmål och Betygskriterier", [
        { id: "goal-loose", properties: { Mål: "12. Nytt mål", "G-nivå": "Uppfyllt", Kurs: [] } },
      ]),
    ]);

    const report = await syncCohort({ db, models, notion: reader }, cohortId);

    expect((await syncedSources()).map((s) => s.title)).toEqual(["HTML"]);
    expect(report.skipped).toEqual([
      "Kursen Examensarbete saknar Period",
      "Gruppövning (Workshop, Frontendutveckling) saknar Datum",
      "u09 - Ny uppgift saknar Kurs",
      "12. Nytt mål saknar Kurs",
    ]);
  });

  it("reads pages and databases that Notion returns in several batches", async () => {
    const items: FakeBlock[] = Array.from({ length: 150 }, (_, i) => ({
      id: `li-${i}`,
      type: "bulleted_list_item",
      text: `Begrepp nummer ${i}`,
    }));
    const sessions = ["2026-09-15", "2026-09-16", "2026-09-17"].map((date) => ({
      id: `session-${date}`,
      properties: { Aktivitet: "Föreläsning", Innehåll: `• Pass ${date}`, Datum: date, Kurs: ["course-fe"] },
    }));
    const { reader } = createFakeNotion(
      ROOT,
      [
        database("db-kurser", "Översikt kurser", [
          {
            ...course,
            children: [
              { id: "h2-instudering", type: "heading_2", text: "Instudering" },
              { id: "toggle-long", type: "toggle", text: "Begreppslista", children: items },
            ],
          },
        ]),
        database("db-schema", "Schema", sessions),
      ],
      // Small batches, so both the 150 blocks and the three database rows span several.
      { pageSize: 2 },
    );

    await syncCohort({ db, models, notion: reader }, cohortId);

    const synced = await syncedSources();
    const listText = synced.filter((s) => s.title === "Begreppslista").map((s) => s.text).join("\n");
    expect(listText).toContain("Begrepp nummer 0");
    expect(listText).toContain("Begrepp nummer 149");
    expect(synced.filter((s) => s.title.startsWith("Pass"))).toHaveLength(3);
  });
});
