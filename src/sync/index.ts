import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { AiModels } from "@/ai/models";
import { cohorts } from "@/db/schema";
import { indexSource, type SourceInput } from "@/material";
import type { NotionBlock, NotionPage, NotionReader, Paged } from "./notion";
import { onlyTemplateText } from "./template";

type Deps = { db: NodePgDatabase; models: AiModels; notion: NotionReader };

/** The FJS26 databases Sync reads, by title. Any other database, e.g. a linked view, is skipped. */
const DATABASES = {
  courses: "Översikt kurser",
  sessions: "Schema",
  assignments: "Examinationsmoment",
  courseGoals: "Kursmål och Betygskriterier",
} as const;

type Course = { name: string; startsOn: string };

// A line with a meeting link is about joining a Session, not Course material, so it is never indexed.
const MEETING_LINK = /zoom\.us\//i;

export type SyncReport = {
  /** How many Sources were indexed. */
  sources: number;
  /** Sessions with nothing but template text, e.g. "Föreläsning 2027-01-12 (Frontendutveckling)". */
  notFilledIn: string[];
  /** Material that can't be dated or placed in a Course yet, e.g. "u09 - Ny uppgift saknar Kurs". */
  skipped: string[];
};

/**
 * Reads a Cohort's Course material from Notion, starting at its root page, and indexes it as
 * Sources and Chunks. It never searches and never follows links: it only walks down (ADR 0007).
 */
export async function syncCohort({ db, models, notion }: Deps, cohortId: string): Promise<SyncReport> {
  const [cohort] = await db.select().from(cohorts).where(eq(cohorts.id, cohortId));
  if (!cohort?.notionRootPageId) throw new Error("The Cohort has no Notion root page");

  const databases = await findDatabases(notion, cohort.notionRootPageId);
  const inputs: SourceInput[] = [];
  const skipped: string[] = [];
  // Material in a Course is unlocked from the Course's start, so it needs a Course with a Period.
  const courses = new Map<string, Course>();
  for (const page of await queryAll(notion, databases.get(DATABASES.courses))) {
    const course = { name: text(page, "Kursnamn"), startsOn: text(page, "Period") };
    courses.set(page.id, course);
    if (course.startsOn) inputs.push(...(await studyMaterialSources(notion, page, course)));
    else skipped.push(`Kursen ${course.name} saknar Period`);
  }
  const datedCourse = (page: NotionPage, title: string) => {
    const course = courses.get(relation(page, "Kurs")[0]);
    if (!course) skipped.push(`${title} saknar Kurs`);
    return course?.startsOn ? course : null;
  };

  const notFilledIn: string[] = [];
  for (const page of await queryAll(notion, databases.get(DATABASES.sessions))) {
    const session = await sessionSource(notion, page, courses, cohort.name);
    if (!session) notFilledIn.push(sessionLabel(page, courses));
    else if (!session.sessionDate) skipped.push(`${session.title} (${text(page, "Aktivitet")}, ${session.courseName}) saknar Datum`);
    else inputs.push(session);
  }
  for (const page of await queryAll(notion, databases.get(DATABASES.assignments))) {
    const course = datedCourse(page, text(page, "Uppgift"));
    if (course) inputs.push(...(await assignmentSources(notion, page, course)));
  }
  for (const page of await queryAll(notion, databases.get(DATABASES.courseGoals))) {
    const course = datedCourse(page, text(page, "Mål"));
    if (course) inputs.push(courseGoalSource(page, course));
  }
  for (const input of inputs) await indexSource(db, models, cohortId, input);
  return { sources: inputs.length, notFilledIn: notFilledIn.sort(byDate), skipped };
}

/**
 * A Session is one Source: its Innehåll plus its callouts, leaving out callouts with only template
 * text. Returns null when nothing has been filled in.
 */
async function sessionSource(
  notion: NotionReader,
  page: NotionPage,
  courses: Map<string, Course>,
  cohortName: string,
): Promise<SourceInput | null> {
  const date = text(page, "Datum");
  const course = courses.get(relation(page, "Kurs")[0]);
  const contents = text(page, "Innehåll");
  const callouts = await filledInSections(notion, page.id);
  if (!contents.trim() && callouts.length === 0) return null;
  return {
    externalId: page.id,
    kind: "session",
    // A Session outside any Course, e.g. an intro day, belongs to the whole Cohort.
    courseName: course?.name ?? cohortName,
    title: sessionTitle(contents) || `${text(page, "Aktivitet")} ${date}`,
    url: page.url,
    courseStartsOn: course?.startsOn || date,
    sessionDate: date,
    text: [contents, ...callouts].filter(Boolean).join("\n\n"),
  };
}

/** Orders labels like "Föreläsning 2027-01-12 (…)" by their date. */
function byDate(a: string, b: string): number {
  const date = (label: string) => label.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
  return date(a).localeCompare(date(b));
}

function sessionLabel(page: NotionPage, courses: Map<string, Course>): string {
  const course = courses.get(relation(page, "Kurs")[0]);
  return `${text(page, "Aktivitet")} ${text(page, "Datum")}${course ? ` (${course.name})` : ""}`;
}

/** Each toggle in a Course page's Instudering section is one piece of Study Material. */
async function studyMaterialSources(notion: NotionReader, page: NotionPage, course: Course): Promise<SourceInput[]> {
  const blocks = await listAll(notion, page.id);
  const start = blocks.findIndex((b) => b.type === "heading_2" && b.text.trim() === "Instudering");
  if (start === -1) return [];
  const end = blocks.findIndex((b, i) => i > start && b.type === "heading_2");
  const toggles = blocks.slice(start + 1, end === -1 ? undefined : end).filter((b) => b.type === "toggle");
  return Promise.all(
    toggles.map(async (toggle) => {
      const sections = await sectionsByHeading(notion, toggle);
      return {
        externalId: toggle.id,
        kind: "study-material" as const,
        courseName: course.name,
        title: toggle.text,
        url: blockLink(page, toggle),
        courseStartsOn: course.startsOn,
        text: sections.join("\n\n"),
        sections,
      };
    }),
  );
}

/** A toggle's text split at its H3 headings: the part before the first H3, then one per H3. */
async function sectionsByHeading(notion: NotionReader, toggle: NotionBlock): Promise<string[]> {
  const sections: string[][] = [[toggle.text]];
  for (const block of await listAll(notion, toggle.id)) {
    if (block.type === "heading_3") sections.push([]);
    sections[sections.length - 1].push(await blockText(notion, block));
  }
  return sections.map((lines) => lines.filter(Boolean).join("\n")).filter(Boolean);
}

/**
 * Each H2 section of an Assignment page is its own Source, titled "<Assignment>: <section>". Text
 * before the first H2 is a Source titled by the Assignment alone.
 */
async function assignmentSources(notion: NotionReader, page: NotionPage, course: Course): Promise<SourceInput[]> {
  const sections: { heading: NotionBlock | null; blocks: NotionBlock[] }[] = [{ heading: null, blocks: [] }];
  for (const block of await listAll(notion, page.id)) {
    if (block.type === "heading_2") sections.push({ heading: block, blocks: [] });
    else sections[sections.length - 1].blocks.push(block);
  }
  const assignment = text(page, "Uppgift");
  const inputs = await Promise.all(
    sections.map(async ({ heading, blocks }) => ({
      externalId: heading?.id ?? page.id,
      kind: "assignment" as const,
      courseName: course.name,
      title: heading ? `${assignment}: ${heading.text}` : assignment,
      url: heading ? blockLink(page, heading) : page.url,
      courseStartsOn: course.startsOn,
      text: [heading?.text, ...(await Promise.all(blocks.map((b) => blockText(notion, b))))].filter(Boolean).join("\n"),
    })),
  );
  return inputs.filter((input) => input.text.trim());
}

/** A Course Goal is one Source: the goal with its criteria for G and VG. */
function courseGoalSource(page: NotionPage, course: Course): SourceInput {
  const criteria = [["G", text(page, "G-nivå")], ["VG", text(page, "VG-nivå")]]
    .filter(([, value]) => value)
    .map(([grade, value]) => `${grade}: ${value}`);
  return {
    externalId: page.id,
    kind: "course-goal",
    courseName: course.name,
    title: text(page, "Mål"),
    url: page.url,
    courseStartsOn: course.startsOn,
    text: [text(page, "Mål"), ...criteria].join("\n"),
  };
}

/** A link that opens the page scrolled to the block, as Notion's "Copy link to block" does. */
function blockLink(page: NotionPage, block: NotionBlock): string {
  return `${page.url}#${block.id.replaceAll("-", "")}`;
}

/** The Innehåll field lists a Session's topics as bullets; the title joins them on one line. */
function sessionTitle(contents: string): string {
  return contents
    .split("\n")
    .map((line) => line.replace(/^\s*•\s*/, "").trim())
    .filter(Boolean)
    .join(" · ");
}

/**
 * One text per top-level block of a page, each including its nested blocks. A block whose nested
 * text is only template text, such as an unfilled callout, is left out with its heading.
 */
async function filledInSections(notion: NotionReader, pageId: string): Promise<string[]> {
  const sections = await Promise.all(
    (await listAll(notion, pageId)).map(async (block) => {
      if (!canDescend(block)) {
        const own = await blockText(notion, block);
        return onlyTemplateText([own]) ? "" : own;
      }
      // A section headed by a meeting link is about joining the Session, so all of it is left out.
      if (MEETING_LINK.test(block.text)) return "";
      const nested = await Promise.all((await listAll(notion, block.id)).map((b) => blockText(notion, b)));
      return onlyTemplateText(nested.flatMap((t) => t.split("\n"))) ? "" : [block.text, ...nested].filter(Boolean).join("\n");
    }),
  );
  return sections.filter(Boolean);
}

async function blockText(notion: NotionReader, block: NotionBlock): Promise<string> {
  if (MEETING_LINK.test(block.text)) return "";
  const own = block.type === "bulleted_list_item" ? `- ${block.text}` : block.text;
  if (!canDescend(block)) return own;
  const nested = await Promise.all((await listAll(notion, block.id)).map((b) => blockText(notion, b)));
  return [own, ...nested].filter(Boolean).join("\n");
}

/**
 * Whether a block's children belong to the Source's text. A page or database inside the material
 * is not part of it, and a synced block's copy shows content that may live outside the root.
 */
function canDescend(block: NotionBlock): boolean {
  return block.hasChildren && !["child_page", "child_database", "synced_block_reference"].includes(block.type);
}

/**
 * Finds the databases on the root page and then its child pages, keyed by title. The first one
 * found keeps its title, so a view further down with the same title never replaces it.
 */
async function findDatabases(notion: NotionReader, pageId: string, found = new Map<string, string>()) {
  const childPages: string[] = [];
  for (const block of await listAll(notion, pageId)) {
    if (block.type === "child_database" && !found.has(block.text)) found.set(block.text, block.id);
    if (block.type === "child_page") childPages.push(block.id);
  }
  for (const id of childPages) await findDatabases(notion, id, found);
  return found;
}

async function listAll(notion: NotionReader, blockId: string) {
  return collect((cursor) => notion.listChildren(blockId, cursor));
}

async function queryAll(notion: NotionReader, databaseId: string | undefined) {
  if (!databaseId) return [];
  return collect((cursor) => notion.queryDatabase(databaseId, cursor));
}

async function collect<T>(fetchPage: (cursor?: string) => Promise<Paged<T>>): Promise<T[]> {
  const items: T[] = [];
  let cursor: string | undefined;
  do {
    const page = await fetchPage(cursor);
    items.push(...page.items);
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

function text(page: NotionPage, property: string): string {
  const value = page.properties[property];
  return typeof value === "string" ? value : "";
}

function relation(page: NotionPage, property: string): string[] {
  const value = page.properties[property];
  return Array.isArray(value) ? value : [];
}
