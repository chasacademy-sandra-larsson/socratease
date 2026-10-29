import {
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

/** Embeddings are stored at a fixed size so the model can be swapped with a re-embed (ADR 0006). */
export const EMBEDDING_DIMENSIONS = 1024;

export const cohorts = pgTable("cohorts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  endsOn: date("ends_on"),
  // A fixed "today" for unlocking, used by the Demo Cohort so it always has Upcoming material (ADR 0001).
  fixedToday: date("fixed_today"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// The Roster holds the school email addresses that belong to a Cohort.
// It is never linked to the Question Log (ADR 0003).
export const rosterEntries = pgTable("roster_entries", {
  email: text("email").primaryKey(),
  cohortId: uuid("cohort_id")
    .notNull()
    .references(() => cohorts.id, { onDelete: "cascade" }),
});

// A Source is Course material the assistant cites and links to: a page or a section of one.
export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cohortId: uuid("cohort_id")
      .notNull()
      .references(() => cohorts.id, { onDelete: "cascade" }),
    // Stable identifier from where the material came from (e.g. a Notion block id),
    // so re-indexing updates a Source instead of duplicating it.
    externalId: text("external_id").notNull(),
    kind: text("kind", {
      enum: ["session", "study-material", "assignment", "course-goal"],
    }).notNull(),
    courseName: text("course_name").notNull(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    // When the material becomes Unlocked, derived from Notion's dates (ADR 0001).
    unlocksOn: date("unlocks_on").notNull(),
  },
  // The unique index leads with cohort_id, so it also serves lookups by Cohort.
  (t) => [unique().on(t.cohortId, t.externalId)],
);

// A Chunk is an internal excerpt of exactly one Source, used for retrieval. Never shown to Students.
export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    text: text("text").notNull(),
    // Vectors from different models aren't comparable; retrieval only uses the current model's.
    embeddingModel: text("embedding_model").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
  },
  (t) => [
    index("chunks_source_idx").on(t.sourceId),
    index("chunks_embedding_idx").using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

// The anonymous Question Log (ADR 0003). It deliberately has no column that could identify who
// asked: no user, email, pseudonym or session. Code is removed from questions before they are saved.
export const questionLog = pgTable(
  "question_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cohortId: uuid("cohort_id")
      .notNull()
      .references(() => cohorts.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    kind: text("kind", { enum: ["direct", "upcoming", "uncovered"] }).notNull(),
    // The title of the Source the question mainly landed in; null for an Unanswered Question.
    topic: text("topic"),
    // Titles of the Sources the answer used.
    sources: text("sources").array().notNull(),
    // The part of a partly covered question that no material covers.
    uncoveredPart: text("uncovered_part"),
    // ISO week the question was asked, e.g. 2026-W44.
    week: text("week").notNull(),
    askedAt: timestamp("asked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("question_log_cohort_week_idx").on(t.cohortId, t.week)],
);
