-- Chunks are derived data; they are rebuilt by re-indexing with a known embedding model.
DELETE FROM "chunks";--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "embedding_model" text NOT NULL;--> statement-breakpoint
CREATE INDEX "chunks_source_idx" ON "chunks" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "sources_cohort_idx" ON "sources" USING btree ("cohort_id");