CREATE TABLE "question_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort_id" uuid NOT NULL,
	"question" text NOT NULL,
	"kind" text NOT NULL,
	"topic" text,
	"sources" text[] NOT NULL,
	"uncovered_part" text,
	"week" text NOT NULL,
	"asked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "question_log" ADD CONSTRAINT "question_log_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "question_log_cohort_week_idx" ON "question_log" USING btree ("cohort_id","week");