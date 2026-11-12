import { and, eq, inArray, isNull, lt, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { AiModels } from "@/ai/models";
import { cohorts, sources, syncPages, syncRuns } from "@/db/schema";
import { indexSource, type SourceInput } from "@/material";
import type { NotionBlock, NotionPage, NotionReader, Paged } from "./notion";
import { onlyTemplateText } from "./template";

type Deps = { db: NodePgDatabase; models: AiModels; notion: NotionReader };

/** The FJS26 databases Sync reads, by title. Any other database, e.g. a linked view, is skipped. */
const DATABASES = {
  course: "Översikt kurser",
  session: "Schema",
  assignment: "Examinationsmoment",
  "course-goal": "Kursmål och Betygskriterier",
} as const;

type PageKind = keyof typeof DATABASES;
type Course = { name: string; startsOn: string };

// A line with a meeting link is about joining a Session, not Course material, so it is never indexed.
const MEETING_LINK = /zoom\.us\//i;

/** Pages read per run, so a run stays well inside a function's time limit (ADR 0005). */
const MAX_PAGES_PER_RUN = 25;
/** How long a run holds the lock. A run that crashes releases it when this runs out. */
const LOCK_MS = 15 * 60 * 1000;
/**
 * Notion rounds last_edited_time to the minute, so a page edited this recently may change again
 * without its time changing. Such a page is read again on the next run.
 */
const SETTLE_MS = 2 * 60 * 1000;

export type SyncReport = {
  /**
   * "continues": pages are left for the next run. "failed": something went wrong and no page was
   * synced, or no page is left but failures were. "locked": another run was in progress.
   */
  status: "completed" | "continues" | "locked" | "failed";
  /** Notion pages read and indexed in this run. */
  pagesSynced: number;
  /** Changed pages left for the next run. */
  pagesRemaining: number;
  /** Sources removed because their page or section is gone from Notion. */
  sourcesRemoved: number;
  /** What went wrong, e.g. "Föreläsning 2026-09-15: Notion 502 …"; those pages are tried again. */
  failures: string[];
  /** Sessions with nothing but template text, e.g. "Föreläsning 2027-01-12 (Frontendutveckling)". */
  notFilledIn: string[];
  /** Material that can't be dated or placed in a Course yet, e.g. "u09 - Ny uppgift saknar Kurs". */
  skipped: string[];
};

/** What one Notion page becomes: its Sources, or a note on why it has none. */
type PageResult = { inputs: SourceInput[]; note?: { kind: "not-filled-in" | "skipped"; label: string } };

/** A page in the Cohort's databases, with what its Sources depend on and how to make them. */
type PageWork = {
  pageId: string;
  kind: PageKind;
  version: string;
  editedAt: string;
  label: string;
  read: () => Promise<PageResult>;
};

/**
 * Reads a Cohort's Course material from Notion, starting at its root page, and indexes it as
 * Sources and Chunks. It never searches and never follows links: it only walks down (ADR 0007).
 *
 * Each run is incremental and bounded (ADR 0005): it lists the pages in the Cohort's databases,
 * reads only those that changed since they were last synced, at most `maxPages` of them, and
 * removes the Sources of pages and sections that are gone. Each page is saved as it is done, so
 * a run that stops part-way resumes where it was. A lock keeps two runs apart, and every run is
 * written to the sync log.
 */
export async function syncCohort(
  { db, models, notion }: Deps,
  cohortId: string,
  { maxPages = MAX_PAGES_PER_RUN, now = new Date() }: { maxPages?: number; now?: Date } = {},
): Promise<SyncReport> {
  const [cohort] = await db.select().from(cohorts).where(eq(cohorts.id, cohortId));
  if (!cohort?.notionRootPageId) throw new Error("The Cohort has no Notion root page");

  const lease = new Date(now.getTime() + LOCK_MS);
  const [locked] = await db
    .update(cohorts)
    .set({ syncLockedUntil: lease })
    .where(and(eq(cohorts.id, cohortId), or(isNull(cohorts.syncLockedUntil), lt(cohorts.syncLockedUntil, now))))
    .returning({ id: cohorts.id });
  if (!locked) {
    return logRun(db, cohortId, now, { ...emptyReport(), status: "locked" });
  }

  try {
    return await logRun(db, cohortId, now, await run(db, models, notion, cohort, maxPages, now));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return logRun(db, cohortId, now, { ...emptyReport(), status: "failed", failures: [message] });
  } finally {
    // Only release this run's own lease: if it ran out, another run may hold the lock now.
    await db
      .update(cohorts)
      .set({ syncLockedUntil: null })
      .where(and(eq(cohorts.id, cohortId), eq(cohorts.syncLockedUntil, lease)));
  }
}

async function run(
  db: NodePgDatabase,
  models: AiModels,
  notion: NotionReader,
  cohort: typeof cohorts.$inferSelect,
  maxPages: number,
  now: Date,
): Promise<SyncReport> {
  const failures: string[] = [];
  const databases = await findDatabases(notion, cohort.notionRootPageId!);
  // A database that can't be found, e.g. after a rename, must not read as "all its pages deleted".
  const listed = new Set<PageKind>();
  const rows = {} as Record<PageKind, NotionPage[]>;
  for (const [kind, title] of Object.entries(DATABASES) as [PageKind, string][]) {
    const id = databases.get(title);
    if (id) listed.add(kind);
    else failures.push(`Databasen ${title} hittades inte`);
    rows[kind] = id ? await queryAll(notion, id) : [];
  }

  const work = pageWork(notion, rows, cohort.name);
  const stored = new Map(
    (await db.select().from(syncPages).where(eq(syncPages.cohortId, cohort.id))).map((p) => [p.pageId, p]),
  );

  // Pages gone from a database that was listed in full: their Sources go too.
  const present = new Set(work.map((w) => w.pageId));
  const gone = [...stored.values()].filter((p) => listed.has(p.kind) && !present.has(p.pageId));
  let sourcesRemoved = await removeSources(db, cohort.id, gone.flatMap((p) => p.sourceIds));
  if (gone.length > 0) {
    await db.delete(syncPages).where(
      and(
        eq(syncPages.cohortId, cohort.id),
        inArray(
          syncPages.pageId,
          gone.map((p) => p.pageId),
        ),
      ),
    );
  }

  // Pages that failed before wait behind the others, oldest failure first, so they can't block a run.
  const lastFailed = (w: PageWork) => stored.get(w.pageId)?.failedAt?.getTime() ?? 0;
  const changed = work
    .filter((w) => stored.get(w.pageId)?.version !== w.version)
    .sort((a, b) => lastFailed(a) - lastFailed(b));
  const notes = new Map(
    [...stored.values()].flatMap((p) => (p.note && p.label ? [[p.pageId, { kind: p.note, label: p.label }]] : [])),
  );
  let pagesSynced = 0;
  for (const page of changed.slice(0, maxPages)) {
    try {
      const result = await page.read();
      for (const input of result.inputs) await indexSource(db, models, cohort.id, input);
      // Sections that were on the page last time but aren't now, e.g. a deleted toggle.
      const sourceIds = result.inputs.map((i) => i.externalId);
      const dropped = (stored.get(page.pageId)?.sourceIds ?? []).filter((id) => !sourceIds.includes(id));
      sourcesRemoved += await removeSources(db, cohort.id, dropped);
      const settled = now.getTime() - new Date(page.editedAt).getTime() > SETTLE_MS;
      const state = {
        kind: page.kind,
        version: settled ? page.version : `${page.version}|unsettled`,
        sourceIds,
        note: result.note?.kind ?? null,
        label: result.note?.label ?? null,
        failedAt: null,
      };
      await db
        .insert(syncPages)
        .values({ cohortId: cohort.id, pageId: page.pageId, ...state })
        .onConflictDoUpdate({ target: [syncPages.cohortId, syncPages.pageId], set: state });
      if (result.note) notes.set(page.pageId, result.note);
      else notes.delete(page.pageId);
      pagesSynced++;
    } catch (error) {
      failures.push(`${page.label}: ${error instanceof Error ? error.message : String(error)}`);
      // Keep its old version, so it is still read again, but behind pages that haven't failed.
      await db
        .insert(syncPages)
        .values({ cohortId: cohort.id, pageId: page.pageId, kind: page.kind, version: "", sourceIds: [], failedAt: now })
        .onConflictDoUpdate({ target: [syncPages.cohortId, syncPages.pageId], set: { failedAt: now } });
    }
  }

  const pagesRemaining = Math.max(changed.length - maxPages, 0);
  // Notes from the pages listed this run, and from pages of a database that wasn't found.
  const notedPages = [
    ...work.map((w) => w.pageId),
    ...[...stored.values()].filter((p) => !listed.has(p.kind)).map((p) => p.pageId),
  ];
  const noted = (kind: "not-filled-in" | "skipped") =>
    notedPages.flatMap((id) => (notes.get(id)?.kind === kind ? [notes.get(id)!.label] : []));
  return {
    // A run with failures and no progress stops here, so a page that keeps failing can't loop forever.
    status:
      failures.length > 0 && pagesSynced === 0
        ? "failed"
        : pagesRemaining > 0
          ? "continues"
          : failures.length > 0
            ? "failed"
            : "completed",
    pagesSynced,
    pagesRemaining,
    sourcesRemoved,
    failures,
    notFilledIn: noted("not-filled-in").sort(byDate),
    skipped: noted("skipped"),
  };
}

/**
 * Every page in the Cohort's databases, Courses first. A page's version is its last_edited_time
 * plus its Course's name and start, since its Sources carry those too: moving a Course re-reads it.
 */
function pageWork(notion: NotionReader, rows: Record<PageKind, NotionPage[]>, cohortName: string): PageWork[] {
  const courses = new Map(
    rows.course.map((page): [string, Course] => [page.id, { name: text(page, "Kursnamn"), startsOn: text(page, "Period") }]),
  );
  const courseOf = (page: NotionPage) => courses.get(relation(page, "Kurs")[0]);
  // A Session outside any Course carries the Cohort's name instead.
  const version = (page: NotionPage, course: Course | undefined) =>
    [page.lastEditedTime, course?.name ?? cohortName, course?.startsOn ?? ""].join("|");
  // Material in a Course is unlocked from the Course's start, so it needs a Course with a Period.
  const inDatedCourse = async (
    page: NotionPage,
    title: string,
    make: (course: Course) => Promise<SourceInput[]>,
  ): Promise<PageResult> => {
    const course = courseOf(page);
    if (!course) return { inputs: [], note: { kind: "skipped", label: `${title} saknar Kurs` } };
    return { inputs: course.startsOn ? await make(course) : [] };
  };

  return [
    ...rows.course.map((page): PageWork => {
      const course = courses.get(page.id)!;
      return {
        pageId: page.id,
        editedAt: page.lastEditedTime,
        kind: "course",
        version: version(page, course),
        label: `Kursen ${course.name}`,
        read: async () =>
          course.startsOn
            ? { inputs: await studyMaterialSources(notion, page, course) }
            : { inputs: [], note: { kind: "skipped", label: `Kursen ${course.name} saknar Period` } },
      };
    }),
    ...rows.session.map((page): PageWork => ({
      pageId: page.id,
      editedAt: page.lastEditedTime,
      kind: "session",
      version: version(page, courseOf(page)),
      label: sessionLabel(page, courses),
      read: async () => {
        const session = await sessionSource(notion, page, courses, cohortName);
        if (!session) return { inputs: [], note: { kind: "not-filled-in", label: sessionLabel(page, courses) } };
        if (!session.sessionDate) {
          const label = `${session.title} (${text(page, "Aktivitet")}, ${session.courseName}) saknar Datum`;
          return { inputs: [], note: { kind: "skipped", label } };
        }
        return { inputs: [session] };
      },
    })),
    ...rows.assignment.map((page): PageWork => ({
      pageId: page.id,
      editedAt: page.lastEditedTime,
      kind: "assignment",
      version: version(page, courseOf(page)),
      label: text(page, "Uppgift"),
      read: () => inDatedCourse(page, text(page, "Uppgift"), (course) => assignmentSources(notion, page, course)),
    })),
    ...rows["course-goal"].map((page): PageWork => ({
      pageId: page.id,
      editedAt: page.lastEditedTime,
      kind: "course-goal",
      version: version(page, courseOf(page)),
      label: text(page, "Mål"),
      read: () => inDatedCourse(page, text(page, "Mål"), async (course) => [courseGoalSource(page, course)]),
    })),
  ];
}

async function removeSources(db: NodePgDatabase, cohortId: string, externalIds: string[]): Promise<number> {
  if (externalIds.length === 0) return 0;
  const removed = await db
    .delete(sources)
    .where(and(eq(sources.cohortId, cohortId), inArray(sources.externalId, externalIds)))
    .returning({ id: sources.id });
  return removed.length;
}

async function logRun(db: NodePgDatabase, cohortId: string, startedAt: Date, report: SyncReport): Promise<SyncReport> {
  await db.insert(syncRuns).values({ cohortId, startedAt, ...report });
  return report;
}

function emptyReport(): SyncReport {
  return { status: "completed", pagesSynced: 0, pagesRemaining: 0, sourcesRemoved: 0, failures: [], notFilledIn: [], skipped: [] };
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
      deadline: text(page, "Deadline") || undefined,
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
