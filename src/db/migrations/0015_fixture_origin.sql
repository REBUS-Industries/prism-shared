-- Library-level provenance class for PRISM-library fixtures (`origin`).
--
-- Distinguishes downloaded GDTF-Share catalog fixtures from uploads, MVR
-- extractions, and blank/manual records in the PRISM Library view. The
-- upstream GDTF-Share catalog itself is browsed live via the gdtf-share API
-- and is never stored here — every fixture_types row is a PRISM-library record
-- that the ORBIT connector + ORBIT consume.

ALTER TABLE "fixture_types"
  ADD COLUMN IF NOT EXISTS "origin" varchar(32) NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS "fixture_types_origin_idx"
  ON "fixture_types" ("origin");

-- Backfill from the existing import-pipeline source. A bare 'upload' row with
-- no parsed GDTF hash is a blank/manual fixture; one with a hash is a real
-- .gdtf file upload. Guarded on the freshly-defaulted value so the statement
-- is idempotent if the migration is ever re-applied.
UPDATE "fixture_types" SET "origin" =
  CASE
    WHEN "import_source" = 'gdtf-share'   THEN 'gdtf-share'
    WHEN "import_source" = 'mvr-embedded' THEN 'mvr'
    WHEN "import_source" = 'upload' AND "source_gdtf_hash" IS NOT NULL THEN 'upload'
    ELSE 'manual'
  END
WHERE "origin" = 'manual';
