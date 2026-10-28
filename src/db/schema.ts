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
  },
  (t) => [unique().on(t.cohortId, t.externalId), index("sources_cohort_idx").on(t.cohortId)],
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
