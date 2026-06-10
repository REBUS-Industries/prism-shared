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
