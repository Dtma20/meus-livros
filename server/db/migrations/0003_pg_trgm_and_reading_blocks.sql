-- Migration 0003: pg_trgm, reading_blocks, and trigram search index
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reading_blocks" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "log_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "start_page" integer NOT NULL,
    "end_page" integer NOT NULL,
    "comment" text,
    "read_at" date DEFAULT CURRENT_DATE NOT NULL,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "pages_valid" CHECK ("start_page" > 0 AND "end_page" >= "start_page")
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reading_blocks_log_id_reading_logs_id_fk'
  ) THEN
    ALTER TABLE "reading_blocks"
      ADD CONSTRAINT "reading_blocks_log_id_reading_logs_id_fk"
      FOREIGN KEY ("log_id") REFERENCES "reading_logs"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'reading_blocks_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "reading_blocks"
      ADD CONSTRAINT "reading_blocks_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_blocks_log_idx" ON "reading_blocks" ("log_id", "read_at" DESC, "created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reading_blocks_user_idx" ON "reading_blocks" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "works_title_trgm_idx" ON "works" USING gin ("search_text" gin_trgm_ops);
