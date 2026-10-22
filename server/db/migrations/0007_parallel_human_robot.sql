CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"log_id" uuid NOT NULL,
	"block_id" uuid,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_body_length" CHECK (char_length(btrim("comments"."body")) BETWEEN 1 AND 2000 AND "comments"."body" ~ '[^[:space:]]')
);
--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_log_id_reading_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."reading_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_block_id_reading_blocks_id_fk" FOREIGN KEY ("block_id") REFERENCES "public"."reading_blocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_conversation_idx" ON "comments" USING btree ("log_id","block_id","created_at","id");--> statement-breakpoint
CREATE INDEX "comments_user_idx" ON "comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "comments_block_idx" ON "comments" USING btree ("block_id");
