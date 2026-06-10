CREATE TABLE IF NOT EXISTS "visualiser_run_logs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "visualiser_run_logs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"run_id" uuid NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"level" varchar(8) NOT NULL,
	"source" varchar(16) NOT NULL,
	"message" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "visualiser_runs" ADD COLUMN "origin_kind" varchar(16);--> statement-breakpoint
ALTER TABLE "visualiser_runs" ADD COLUMN "origin_address" varchar(64);--> statement-breakpoint
ALTER TABLE "visualiser_runs" ADD COLUMN "origin_principal" varchar(128);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "visualiser_run_logs" ADD CONSTRAINT "visualiser_run_logs_run_id_visualiser_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."visualiser_runs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "visualiser_run_logs_run_idx" ON "visualiser_run_logs" USING btree ("run_id","ts");