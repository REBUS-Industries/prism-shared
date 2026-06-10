ALTER TABLE "visualiser_runs" ADD COLUMN "model_name" VARCHAR(256);--> statement-breakpoint
ALTER TABLE "visualiser_runs" ADD COLUMN "import_mode" VARCHAR(8) NOT NULL DEFAULT 'single';
