CREATE TABLE "cohorts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"ends_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cohorts_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "roster_entries" (
	"email" text PRIMARY KEY NOT NULL,
	"cohort_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "roster_entries" ADD CONSTRAINT "roster_entries_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE cascade ON UPDATE no action;