CREATE TABLE IF NOT EXISTS "material_textures" (
	"material_id" uuid NOT NULL,
	"slot" varchar(64) NOT NULL,
	"texture_id" uuid NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_textures_material_id_slot_pk" PRIMARY KEY("material_id","slot")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "materials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"thumbnail_texture_id" uuid,
	"created_by_admin_id" uuid,
	"created_by_api_key_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "textures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_filename" varchar(256) NOT NULL,
	"display_name" varchar(256),
	"content_type" varchar(128) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"storage_path" varchar(512) NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"uploaded_by_admin_id" uuid,
	"uploaded_by_api_key_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "material_textures" ADD CONSTRAINT "material_textures_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "material_textures" ADD CONSTRAINT "material_textures_texture_id_textures_id_fk" FOREIGN KEY ("texture_id") REFERENCES "public"."textures"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "materials" ADD CONSTRAINT "materials_thumbnail_texture_id_textures_id_fk" FOREIGN KEY ("thumbnail_texture_id") REFERENCES "public"."textures"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "materials" ADD CONSTRAINT "materials_created_by_admin_id_admin_users_id_fk" FOREIGN KEY ("created_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "materials" ADD CONSTRAINT "materials_created_by_api_key_id_api_keys_id_fk" FOREIGN KEY ("created_by_api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "textures" ADD CONSTRAINT "textures_uploaded_by_admin_id_admin_users_id_fk" FOREIGN KEY ("uploaded_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "textures" ADD CONSTRAINT "textures_uploaded_by_api_key_id_api_keys_id_fk" FOREIGN KEY ("uploaded_by_api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "material_textures_texture_idx" ON "material_textures" USING btree ("texture_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "materials_created_at_idx" ON "materials" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "textures_created_at_idx" ON "textures" USING btree ("created_at");