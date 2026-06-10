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
