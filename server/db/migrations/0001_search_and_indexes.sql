CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  AS $$ SELECT public.unaccent('public.unaccent', $1) $$
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE;--> statement-breakpoint
ALTER TABLE "works" ADD COLUMN "search_text" text
  GENERATED ALWAYS AS (f_unaccent(lower("title"))) STORED;--> statement-breakpoint
CREATE INDEX "works_search_idx" ON "works" ("search_text" text_pattern_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "editions_isbn13_key" ON "editions" ("isbn13")
  WHERE "isbn13" IS NOT NULL;