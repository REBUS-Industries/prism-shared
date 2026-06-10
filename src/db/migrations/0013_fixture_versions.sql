-- Fixture version history: provenance per GDTF download + switchable active revision

ALTER TABLE "fixture_types"
  ADD COLUMN IF NOT EXISTS "gdtf_share_uuid" varchar(128),
  ADD COLUMN IF NOT EXISTS "active_version_id" uuid,
  ADD COLUMN IF NOT EXISTS "import_source" varchar(64) NOT NULL DEFAULT 'upload';

CREATE INDEX IF NOT EXISTS "fixture_types_gdtf_share_uuid_idx"
  ON "fixture_types" ("gdtf_share_uuid");

CREATE TABLE IF NOT EXISTS "fixture_versions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "fixture_type_id" uuid NOT NULL REFERENCES "fixture_types"("id") ON DELETE CASCADE,
  "gdtf_share_rid" integer,
  "gdtf_share_uuid" varchar(128),
  "gdtf_version" varchar(64),
  "revision" varchar(128),
  "gdtf_hash" varchar(64) NOT NULL,
  "definition" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "original_media_id" uuid REFERENCES "fixture_media"("id") ON DELETE SET NULL,
  "preview_model_id" uuid,
  "downloaded_at" timestamp with time zone NOT NULL DEFAULT now(),
  "downloaded_by_admin_id" uuid REFERENCES "admin_users"("id") ON DELETE SET NULL,
  "downloaded_by_api_key_id" uuid REFERENCES "api_keys"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "fixture_versions_type_hash_uidx"
  ON "fixture_versions" ("fixture_type_id", "gdtf_hash");
CREATE INDEX IF NOT EXISTS "fixture_versions_fixture_type_idx"
  ON "fixture_versions" ("fixture_type_id");
CREATE INDEX IF NOT EXISTS "fixture_versions_downloaded_at_idx"
  ON "fixture_versions" ("downloaded_at");

-- Backfill one version row per existing fixture that has a GDTF hash
INSERT INTO "fixture_versions" (
  "fixture_type_id",
  "gdtf_hash",
  "revision",
  "definition",
  "downloaded_at",
  "downloaded_by_admin_id",
  "downloaded_by_api_key_id"
)
SELECT
  ft."id",
  ft."source_gdtf_hash",
  ft."revision",
  ft."definition",
  ft."created_at",
  ft."created_by_admin_id",
  ft."created_by_api_key_id"
FROM "fixture_types" ft
WHERE ft."deleted_at" IS NULL
  AND ft."source_gdtf_hash" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "fixture_versions" fv
    WHERE fv."fixture_type_id" = ft."id"
      AND fv."gdtf_hash" = ft."source_gdtf_hash"
  );

UPDATE "fixture_types" ft
SET "active_version_id" = fv."id"
FROM "fixture_versions" fv
WHERE fv."fixture_type_id" = ft."id"
  AND fv."gdtf_hash" = ft."source_gdtf_hash"
  AND ft."active_version_id" IS NULL;
