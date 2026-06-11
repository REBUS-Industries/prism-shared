/**
 * Prism fixture library wire types.
 * Canonical source — sync PRISM/web/src/shared/api.ts on change.
 */

export const FIXTURE_PART_TAGS = [
  'ORIGIN',
  'CLAMP',
  'BASE',
  'YOKE',
  'HEAD',
  'LENS',
  'CELL',
  'BEAM',
] as const;

export type FixturePartTag = (typeof FIXTURE_PART_TAGS)[number];

export const MEDIA_TYPES = [
  'MODEL_GLB',
  'IES_FILE',
  'GOBO_IMAGE',
  'ANIMATION_WHEEL_IMAGE',
  'COLOUR_WHEEL_IMAGE',
  'THUMBNAIL',
  'TEXTURE_IMAGE',
  'GDTF_ORIGINAL',
] as const;

export type MediaType = (typeof MEDIA_TYPES)[number];

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Transform4x4 {
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  matrix4x4: number[];
}

export interface FixturePatch {
  protocol: string;
  universe: number;
  address: number;
  absoluteAddress: number;
  break: number;
  footprint: number;
  channelRange: string;
  status: string;
}

export interface DmxModeRef {
  modeId: string;
  name: string;
  footprint: number;
}

export interface FixturePart {
  partId: string;
  sourceGdtfGeometryId?: string;
  name: string;
  tag: FixturePartTag;
  parentPartId?: string | null;
  childPartIds: string[];
  modelId?: string | null;
  materialId?: string | null;
  localTransform: Transform4x4;
  pivot?: Vec3;
  motionAxisId?: string | null;
  cellId?: string | null;
  beamId?: string | null;
  dmxLinks: string[];
  metadata: Record<string, unknown>;
}

export interface FixtureModel {
  modelId: string;
  sourceGdtfModel?: string;
  sourceFile?: string;
  partTag: FixturePartTag;
  assignedPartIds: string[];
  storagePath?: string;
  lod0?: string;
  boundingBox?: { min: Vec3; max: Vec3 };
  pivot?: Vec3;
  metadata: Record<string, unknown>;
}

export interface FixtureBeam {
  beamId: string;
  parentPartId?: string;
  parentLensId?: string;
  parentCellId?: string;
  beamType?: string;
  beamAngle?: number;
  fieldAngle?: number;
  luminousFlux?: number;
  colourTemperature?: number;
  cri?: number;
  iesAssetId?: string | null;
  dmxLinks: string[];
  metadata: Record<string, unknown>;
}

export interface MotionAxis {
  motionAxisId: string;
  sourceGdtfGeometryId?: string;
  parentPartId?: string;
  controlledPartId?: string;
  axisType: 'PAN' | 'TILT' | 'ROLL' | 'SPIN' | 'OTHER';
  axisVector: Vec3;
  pivot: Vec3;
  minValue: number;
  maxValue: number;
  defaultValue: number;
  dmxLinks: string[];
}

export interface WheelSlot {
  slotId: string;
  slotIndex: number;
  slotName: string;
  mediaType: string;
  imageAssetId?: string | null;
  dmxFrom?: number;
  dmxTo?: number;
  metadata?: Record<string, unknown>;
}

export interface FixtureWheel {
  wheelId: string;
  wheelName: string;
  wheelType: string;
  slots: WheelSlot[];
  dmxLinks: string[];
}

export interface FixtureDefinition {
  fixtureInformation: {
    manufacturer: string;
    fixtureName: string;
    revision?: string;
    fixtureTypeId?: string;
    longName?: string;
    description?: string;
    thumbnail?: string;
  };
  parts: FixturePart[];
  models: FixtureModel[];
  beams: FixtureBeam[];
  motionRig: MotionAxis[];
  wheels: FixtureWheel[];
  dmxMapping: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export type FixtureImportSource = 'upload' | 'gdtf-share' | 'mvr-embedded';

/**
 * Where a PRISM-library fixture record came from — the library-level
 * provenance class that distinguishes the two fixture libraries.
 *
 *   gdtf-share — downloaded (imported) from the upstream GDTF-Share catalog;
 *                keeps a live link to its source (uuid/rid) for update checks.
 *   upload     — imported from a user-supplied .gdtf file.
 *   mvr        — extracted from an MVR scene during an MVR import.
 *   manual     — a blank fixture authored directly in PRISM.
 *
 * Unlike `importSource` (an import-pipeline detail that defaults to 'upload'
 * even for blank rows), `origin` is the authoritative field the PRISM Library
 * view groups/filters on. The upstream GDTF-Share catalog is NOT stored in
 * these tables — it is browsed live via the gdtf-share API; every row here is
 * a PRISM-library record that the connector + ORBIT consume.
 */
export const FIXTURE_ORIGINS = ['gdtf-share', 'upload', 'mvr', 'manual'] as const;
export type FixtureOrigin = (typeof FIXTURE_ORIGINS)[number];

export const FIXTURE_ORIGIN_LABELS: Record<FixtureOrigin, string> = {
  'gdtf-share': 'GDTF Share',
  upload: 'Uploaded',
  mvr: 'MVR',
  manual: 'Manual',
};

/**
 * Map the import-pipeline source (+ whether a parsed GDTF hash is present) to
 * the library origin. Used by the service when persisting a row and by any
 * client that only has the legacy `importSource`/`sourceGdtfHash` pair.
 */
export function fixtureOriginFromImport(
  importSource: FixtureImportSource | string | null | undefined,
  hasGdtfHash: boolean,
): FixtureOrigin {
  switch (importSource) {
    case 'gdtf-share':
      return 'gdtf-share';
    case 'mvr-embedded':
      return 'mvr';
    case 'upload':
      return hasGdtfHash ? 'upload' : 'manual';
    default:
      return 'manual';
  }
}

export interface FixtureVersionSummary {
  id: string;
  fixtureTypeId: string;
  gdtfShareRid: number | null;
  gdtfShareUuid: string | null;
  gdtfVersion: string | null;
  revision: string | null;
  gdtfHash: string;
  originalMediaId: string | null;
  previewModelId: string | null;
  downloadedAt: string;
  isActive: boolean;
}

export interface FixtureUpdateCheck {
  updateAvailable: boolean;
  activeRid: number | null;
  latestRid: number | null;
  latestRevision: string | null;
  latestVersion: string | null;
  latestLastModified: string | null;
}

export interface FixtureEditCarryReport {
  applied: string[];
  unmapped: string[];
}

export interface FixtureTypeSummary {
  id: string;
  name: string;
  manufacturer: string;
  fixtureName: string;
  revision: string | null;
  tags: string[];
  sourceGdtfHash: string | null;
  gdtfShareUuid: string | null;
  importSource: FixtureImportSource;
  /** Library-level provenance class (see FixtureOrigin). */
  origin: FixtureOrigin;
  activeVersionId: string | null;
  status: string;
  hasPreview: boolean;
  updateAvailable?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FixtureTypeDetail extends FixtureTypeSummary {
  definition: FixtureDefinition;
  previewModelId: string | null;
  sourceGdtfId: string | null;
  activeVersion?: FixtureVersionSummary | null;
}

// ---------------------------------------------------------------------------
// Connector / ORBIT export
// ---------------------------------------------------------------------------
//
// The PRISM Fixture Library (these tables) is the authoritative, editable set
// that the ORBIT connector and ORBIT consume — distinct from the upstream
// GDTF-Share catalog, which is read-only reference. These contracts describe
// the export surface a connector pulls from
// (`GET /api/fixtures/export[/:id]`). The payload is self-contained: identity,
// provenance back to the GDTF-Share source, the full parsed definition
// (parts/models/beams/wheels/DMX/motion), and resolved asset URLs (GLB
// preview, IES, gobo/colour-wheel/thumbnail images). Asset URLs are the
// existing authenticated media endpoints on this service.

/** Bump when the export payload shape changes in a non-additive way. */
export const FIXTURE_EXPORT_FORMAT_VERSION = 1;

export interface FixtureExportAsset {
  mediaId: string;
  /** Relative URL on prism-fixtures-service (requires the caller's auth). */
  url: string;
  mediaType: MediaType | string;
  label: string;
  contentType?: string;
}

/** Compact row for the connector's "what can I pull" index. */
export interface FixtureExportSummary {
  id: string;
  name: string;
  manufacturer: string;
  fixtureName: string;
  revision: string | null;
  category: string;
  origin: FixtureOrigin;
  status: string;
  hasPreview: boolean;
  gdtfShareUuid: string | null;
  activeVersionId: string | null;
  updatedAt: string;
}

/** Full connector/ORBIT export payload for a single PRISM-library fixture. */
export interface FixtureConnectorExport {
  exportFormatVersion: number;
  exportedAt: string;
  id: string;
  name: string;
  manufacturer: string;
  fixtureName: string;
  revision: string | null;
  category: string;
  origin: FixtureOrigin;
  status: string;
  provenance: {
    gdtfShareUuid: string | null;
    gdtfShareRid: number | null;
    gdtfVersion: string | null;
    revision: string | null;
    sourceGdtfHash: string | null;
  };
  definition: FixtureDefinition;
  activeVersion: FixtureVersionSummary | null;
  assets: {
    previewModel: FixtureExportAsset | null;
    ies: FixtureExportAsset[];
    images: FixtureExportAsset[];
  };
}

export interface FixtureInstance {
  fixtureInstanceId: string;
  source: 'MVR' | 'MANUAL' | 'CONNECTOR';
  sourceMvrUuid?: string;
  fixtureTypeId: string;
  instanceName: string;
  unitNumber?: string;
  fixtureId?: string;
  channelId?: string;
  selectedDmxMode: DmxModeRef;
  patch?: FixturePatch;
  transform: Transform4x4;
  layer?: string;
  class?: string;
  positionName?: string;
  runtimeParts: Array<{
    tag: FixturePartTag;
    fixtureTypePartId: string;
    modelId?: string;
    materialId?: string;
  }>;
  warnings: string[];
  metadata: Record<string, unknown>;
}

export interface GdtfCacheRecord {
  manufacturer: string;
  fixtureName: string;
  revision: string | null;
  modeNames: string[];
  gdtfHash: string;
  source: string;
  localPath: string;
  fixtureTypeId: string | null;
  dateImported: string;
  lastChecked: string;
}

/** User-assigned fixture category (Spot, Wash, …) stored in library `tags[0]`. */
export const LIBRARY_FIXTURE_CATEGORIES = [
  'Unassigned',
  'Spot',
  'Wash',
  'Beam',
  'Strobe',
  'Followspot',
  'Conventional',
] as const;

export type LibraryFixtureCategory = (typeof LIBRARY_FIXTURE_CATEGORIES)[number];

export const FIXTURE_CATEGORY_COLORS: Record<LibraryFixtureCategory, string> = {
  Unassigned: '#4b5563',
  Spot: '#ef4444',
  Wash: '#3b82f6',
  Beam: '#f97316',
  Strobe: '#22c55e',
  Followspot: '#a855f7',
  Conventional: '#ec4899',
};

const CATEGORY_LOOKUP = new Set(
  LIBRARY_FIXTURE_CATEGORIES.filter((c) => c !== 'Unassigned').map((c) => c.toLowerCase()),
);

export function fixtureCategoryFromTags(tags: string[]): LibraryFixtureCategory {
  for (const tag of tags) {
    const lower = tag.toLowerCase();
    if (CATEGORY_LOOKUP.has(lower)) {
      return LIBRARY_FIXTURE_CATEGORIES.find((c) => c.toLowerCase() === lower)!;
    }
  }
  return 'Unassigned';
}

export function tagsWithFixtureCategory(tags: string[], category: LibraryFixtureCategory): string[] {
  const rest = tags.filter(
    (t) => !CATEGORY_LOOKUP.has(t.toLowerCase()),
  );
  if (category === 'Unassigned') return rest;
  return [category, ...rest];
}

// ---------------------------------------------------------------------------
// User-managed fixture category config (admin Settings → Fixture Types)
// ---------------------------------------------------------------------------
//
// The 7 constants above remain the *seed defaults*. They are written into the
// `fixture_categories` table on first run (migration 0014) and from then on the
// set is editable in the admin UI: operators can add/rename/recolour/reorder
// categories and delete the ones they don't use. The library still stores the
// chosen category as the first non-part tag (`tags[0]`) via
// `tagsWithFixtureCategory()`, so this config is purely the source of the
// label + colour palette — nothing about the tag-storage contract changes.

/** A persisted fixture-category definition (one row of `fixture_categories`). */
export interface FixtureCategoryConfig {
  id: string;
  /** Stable slug — never the tag value; used for default-row protection. */
  key: string;
  /** Display name AND the value stored in a fixture's `tags[0]`. */
  label: string;
  /** CSS hex colour, e.g. `#ef4444`. */
  color: string;
  /** Ascending display order. */
  order: number;
  /** Seed/system rows (currently just `Unassigned`) can't be deleted/renamed. */
  isDefault: boolean;
}

/** Seed row shape used by migration 0014 + the service's lazy re-seed. */
export interface FixtureCategorySeed {
  key: string;
  label: LibraryFixtureCategory;
  color: string;
  isDefault: boolean;
}

/**
 * The default category set, seeded on first run. Derived from the legacy
 * constants so the two never drift. `Unassigned` is the protected fallback
 * (it is the *absence* of a category tag, never written into `tags`).
 */
export const DEFAULT_FIXTURE_CATEGORIES: FixtureCategorySeed[] =
  LIBRARY_FIXTURE_CATEGORIES.map((label) => ({
    key: label.toLowerCase(),
    label,
    color: FIXTURE_CATEGORY_COLORS[label],
    isDefault: label === 'Unassigned',
  }));
