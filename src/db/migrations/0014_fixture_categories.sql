-- User-managed fixture category palette (admin Settings -> Fixture Types).
-- Seeded with the 7 historical defaults; the set is editable from then on.

CREATE TABLE IF NOT EXISTS "fixture_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" varchar(64) NOT NULL,
  "label" varchar(64) NOT NULL,
  "color" varchar(16) DEFAULT '#4b5563' NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_default" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "fixture_categories_key_uidx" ON "fixture_categories" ("key");
CREATE INDEX IF NOT EXISTS "fixture_categories_order_idx" ON "fixture_categories" ("sort_order");

-- Seed defaults (idempotent — re-running the migration leaves edits intact).
INSERT INTO "fixture_categories" ("key", "label", "color", "sort_order", "is_default") VALUES
  ('unassigned',   'Unassigned',   '#4b5563', 0, true),
  ('spot',         'Spot',         '#ef4444', 1, false),
  ('wash',         'Wash',         '#3b82f6', 2, false),
  ('beam',         'Beam',         '#f97316', 3, false),
  ('strobe',       'Strobe',       '#22c55e', 4, false),
  ('followspot',   'Followspot',   '#a855f7', 5, false),
  ('conventional', 'Conventional', '#ec4899', 6, false)
ON CONFLICT ("key") DO NOTHING;
