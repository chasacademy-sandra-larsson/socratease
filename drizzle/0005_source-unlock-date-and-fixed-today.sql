-- Sources indexed before unlock dates existed have no date to derive; re-index them (only test material so far).
DELETE FROM "sources";--> statement-breakpoint
ALTER TABLE "cohorts" ADD COLUMN "fixed_today" date;--> statement-breakpoint
ALTER TABLE "sources" ADD COLUMN "unlocks_on" date NOT NULL;
