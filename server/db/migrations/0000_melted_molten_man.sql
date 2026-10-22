CREATE EXTENSION IF NOT EXISTS "citext";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "unaccent";--> statement-breakpoint
CREATE TYPE "public"."book_format" AS ENUM('fisico', 'ebook', 'audio');--> statement-breakpoint
CREATE TYPE "public"."date_precision" AS ENUM('dia', 'mes', 'ano');--> statement-breakpoint
CREATE TYPE "public"."genre_kind" AS ENUM('ficcao', 'nao_ficcao', 'outro');--> statement-breakpoint
CREATE TYPE "public"."visibility" AS ENUM('publico', 'privado');--> statement-breakpoint
CREATE TABLE "allowed_emails" (
	"email" "citext" PRIMARY KEY NOT NULL,
	"invited_by" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "authors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" "citext" NOT NULL,
	"country_code" char(2),
	"country_label" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "authors_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "editions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_id" uuid NOT NULL,
	"isbn13" char(13),
	"publisher" text,
	"page_count" integer,
	"published_year" integer,
	"language" char(2),
	"cover_url" text,
	"ol_cover_id" integer,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "page_count_positive" CHECK ("editions"."page_count" IS NULL OR "editions"."page_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "genres" (
	"id" smallint PRIMARY KEY NOT NULL,
	"slug" "citext" NOT NULL,
	"label_pt" text NOT NULL,
	"kind" "genre_kind" NOT NULL,
	CONSTRAINT "genres_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "reading_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"work_id" uuid NOT NULL,
	"edition_id" uuid,
	"rating" numeric(2, 1),
	"review" text,
	"started_on" date,
	"finished_on" date,
	"finished_precision" date_precision DEFAULT 'dia' NOT NULL,
	"format" "book_format",
	"visibility" "visibility" DEFAULT 'publico' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rating_half_star" CHECK ("reading_logs"."rating" IS NULL OR ("reading_logs"."rating" >= 0.5 AND "reading_logs"."rating" <= 5.0 AND ("reading_logs"."rating" * 2) = trunc("reading_logs"."rating" * 2))),
	CONSTRAINT "dates_ordered" CHECK ("reading_logs"."started_on" IS NULL OR "reading_logs"."finished_on" IS NULL OR "reading_logs"."started_on" <= "reading_logs"."finished_on")
);
--> statement-breakpoint
CREATE TABLE "search_misses" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"query" text NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"handle" "citext" NOT NULL,
	"display_name" text NOT NULL,
	"bio" text,
	"profile_visibility" "visibility" DEFAULT 'publico' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_handle_unique" UNIQUE("handle"),
	CONSTRAINT "handle_format" CHECK ("users"."handle" ~ '^[a-z0-9_]{3,20}$')
);
--> statement-breakpoint
CREATE TABLE "work_authors" (
	"work_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"position" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "work_authors_work_id_author_id_pk" PRIMARY KEY("work_id","author_id")
);
--> statement-breakpoint
CREATE TABLE "work_genres" (
	"work_id" uuid NOT NULL,
	"genre_id" smallint NOT NULL,
	CONSTRAINT "work_genres_work_id_genre_id_pk" PRIMARY KEY("work_id","genre_id")
);
--> statement-breakpoint
CREATE TABLE "works" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" "citext" NOT NULL,
	"title" text NOT NULL,
	"original_language" char(2),
	"first_published_year" integer,
	"series_name" text,
	"series_number" text,
	"ol_work_key" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "works_slug_unique" UNIQUE("slug"),
	CONSTRAINT "works_ol_work_key_unique" UNIQUE("ol_work_key")
);
--> statement-breakpoint
ALTER TABLE "allowed_emails" ADD CONSTRAINT "allowed_emails_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "authors" ADD CONSTRAINT "authors_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editions" ADD CONSTRAINT "editions_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "editions" ADD CONSTRAINT "editions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_logs" ADD CONSTRAINT "reading_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_logs" ADD CONSTRAINT "reading_logs_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_logs" ADD CONSTRAINT "reading_logs_edition_id_editions_id_fk" FOREIGN KEY ("edition_id") REFERENCES "public"."editions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_misses" ADD CONSTRAINT "search_misses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_authors" ADD CONSTRAINT "work_authors_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_authors" ADD CONSTRAINT "work_authors_author_id_authors_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."authors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_genres" ADD CONSTRAINT "work_genres_work_id_works_id_fk" FOREIGN KEY ("work_id") REFERENCES "public"."works"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_genres" ADD CONSTRAINT "work_genres_genre_id_genres_id_fk" FOREIGN KEY ("genre_id") REFERENCES "public"."genres"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "works" ADD CONSTRAINT "works_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "editions_work_idx" ON "editions" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "reading_logs_user_idx" ON "reading_logs" USING btree ("user_id","finished_on" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reading_logs_work_idx" ON "reading_logs" USING btree ("work_id");--> statement-breakpoint
CREATE INDEX "reading_logs_public_idx" ON "reading_logs" USING btree ("created_at" DESC NULLS LAST) WHERE "reading_logs"."visibility" = 'publico';--> statement-breakpoint
CREATE INDEX "work_authors_author_idx" ON "work_authors" USING btree ("author_id");