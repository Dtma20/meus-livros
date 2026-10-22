-- Migration 0006: composite index for keyset feed pagination
DROP INDEX IF EXISTS "reading_logs_public_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_logs_public_idx" ON "reading_logs" USING btree ("created_at" DESC, "id" DESC) WHERE "visibility" = 'publico';
