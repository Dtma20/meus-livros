-- Migration 0004: who last edited a shared catalogue row
--
-- The catalogue is shared property: any member with a session may edit any
-- work or edition. These two columns are the whole accountability trail, so
-- they are added before the PATCH routes that write them.
--
-- Nullable, and deliberately without a default: every row that existed before
-- this migration has never been edited, and `now()` would claim otherwise.
--
-- HAND-EDITED after `drizzle-kit generate`. The generator emitted a
-- `CREATE TABLE "reading_blocks"` alongside these ALTERs: migrations 0002 and
-- 0003 were hand-written and left no snapshot in `meta/`, so the generator
-- diffed against 0001 and concluded the table was missing. Applying its output
-- would have failed with `relation "reading_blocks" already exists`. Only the
-- four ALTERs and their two constraints belong here. `0004_snapshot.json` was
-- kept: it describes all eleven tables as they actually are, which repairs the
-- chain for the next `generate`.
ALTER TABLE "works" ADD COLUMN IF NOT EXISTS "updated_by" uuid;
--> statement-breakpoint
ALTER TABLE "works" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "editions" ADD COLUMN IF NOT EXISTS "updated_by" uuid;
--> statement-breakpoint
ALTER TABLE "editions" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'works_updated_by_users_id_fk'
  ) THEN
    ALTER TABLE "works"
      ADD CONSTRAINT "works_updated_by_users_id_fk"
      FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE set null;
  END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'editions_updated_by_users_id_fk'
  ) THEN
    ALTER TABLE "editions"
      ADD CONSTRAINT "editions_updated_by_users_id_fk"
      FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE set null;
  END IF;
END $$;
