import { date, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

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
