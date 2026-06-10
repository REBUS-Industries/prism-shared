CREATE TABLE IF NOT EXISTS "visualiser_share_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"tier" varchar(8) DEFAULT 'view' NOT NULL,
	"created_by" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "visualiser_share_links_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visualiser_share_links" ADD CONSTRAINT "visualiser_share_links_run_id_visualiser_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."visualiser_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visualiser_share_links_run_idx" ON "visualiser_share_links" USING btree ("run_id");