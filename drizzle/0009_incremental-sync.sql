CREATE TABLE "sync_pages" (
	"cohort_id" uuid NOT NULL,
	"page_id" text NOT NULL,
	"kind" text NOT NULL,
	"version" text NOT NULL,
	"source_ids" text[] NOT NULL,
	"note" text,
	"label" text,
	CONSTRAINT "sync_pages_cohort_id_page_id_pk" PRIMARY KEY("cohort_id","page_id")
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"pages_synced" integer NOT NULL,
	"pages_remaining" integer NOT NULL,
	"sources_removed" integer NOT NULL,
	"failures" text[] NOT NULL,
	"not_filled_in" text[] NOT NULL,
	"skipped" text[] NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cohorts" ADD COLUMN "sync_locked_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sync_pages" ADD CONSTRAINT "sync_pages_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sync_runs_cohort_idx" ON "sync_runs" USING btree ("cohort_id","started_at");