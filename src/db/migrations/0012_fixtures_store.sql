-- Fixture library store (types, media, GDTF cache, MVR instances)

CREATE TABLE IF NOT EXISTS "fixture_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(256) NOT NULL,
  "manufacturer" varchar(256) NOT NULL DEFAULT '',
  "fixture_name" varchar(256) NOT NULL DEFAULT '',
  "revision" varchar(128),
  "tags" text[] DEFAULT '{}'::text[] NOT NULL,
  "status" varchar(32) DEFAULT 'draft' NOT NULL,
  "source_gdtf_id" varchar(256),
  "source_gdtf_hash" varchar(64),
  "definition" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "preview_model_id" uuid,
  "created_by_admin_id" uuid REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "created_by_api_key_id" uuid REFERENCES "api_keys"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "fixture_types_created_at_idx" ON "fixture_types" ("created_at");
CREATE INDEX IF NOT EXISTS "fixture_types_manufacturer_idx" ON "fixture_types" ("manufacturer");
CREATE INDEX IF NOT EXISTS "fixture_types_gdtf_hash_idx" ON "fixture_types" ("source_gdtf_hash");

CREATE TABLE IF NOT EXISTS "fixture_media" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "media_type" varchar(64) NOT NULL,
  "content_hash" varchar(64) NOT NULL,
  "original_filename" varchar(256) NOT NULL,
  "content_type" varchar(128) NOT NULL,
  "size_bytes" bigint NOT NULL,
  "storage_path" varchar(512) NOT NULL,
  "fixture_type_id" uuid REFERENCES "fixture_types"("id") ON DELETE SET NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "fixture_media_hash_idx" ON "fixture_media" ("content_hash");
CREATE INDEX IF NOT EXISTS "fixture_media_fixture_type_idx" ON "fixture_media" ("fixture_type_id");

CREATE TABLE IF NOT EXISTS "gdtf_cache" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "manufacturer" varchar(256) NOT NULL,
  "fixture_name" varchar(256) NOT NULL,
  "revision" varchar(128),
  "mode_names" text[] DEFAULT '{}'::text[] NOT NULL,
  "gdtf_hash" varchar(64) NOT NULL,
  "source" varchar(64) NOT NULL DEFAULT 'gdtf-share',
  "local_path" varchar(512) NOT NULL,
  "fixture_type_id" uuid REFERENCES "fixture_types"("id") ON DELETE SET NULL,
  "date_imported" timestamp with time zone DEFAULT now() NOT NULL,
  "last_checked" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "gdtf_cache_hash_uidx" ON "gdtf_cache" ("gdtf_hash");

CREATE TABLE IF NOT EXISTS "fixture_instances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_id" text,
  "orbit_project_id" text,
  "orbit_model_id" text,
  "fixture_type_id" uuid NOT NULL REFERENCES "fixture_types"("id") ON DELETE RESTRICT,
  "source" varchar(32) NOT NULL DEFAULT 'MVR',
  "source_mvr_uuid" varchar(256),
  "instance_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "status" varchar(32) DEFAULT 'pending' NOT NULL,
  "warnings" text[] DEFAULT '{}'::text[] NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "fixture_instances_project_idx" ON "fixture_instances" ("project_id");
CREATE INDEX IF NOT EXISTS "fixture_instances_type_idx" ON "fixture_instances" ("fixture_type_id");
