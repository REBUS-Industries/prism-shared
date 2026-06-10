import type { FixtureInstance } from '../contracts/fixtures.js';
import { computeObjectId } from './hash.js';

export function fixtureInstanceToOrbitObject(instance: FixtureInstance): Record<string, unknown> {
  return {
    speckle_type: 'Orbit.Objects.Lighting.FixtureInstance',
    applicationId: instance.fixtureInstanceId,
    prismFixtureTypeId: instance.fixtureTypeId,
    instanceName: instance.instanceName,
    unitNumber: instance.unitNumber,
    fixtureId: instance.fixtureId,
    channelId: instance.channelId,
    selectedDmxMode: instance.selectedDmxMode,
    patch: instance.patch,
    transform: instance.transform,
    layer: instance.layer,
    class: instance.class,
    positionName: instance.positionName,
    runtimeParts: instance.runtimeParts,
    warnings: instance.warnings,
    metadata: instance.metadata,
    source: instance.source,
    sourceMvrUuid: instance.sourceMvrUuid,
  };
}

export function buildFixtureSceneRoot(
  name: string,
  instances: FixtureInstance[],
): Record<string, unknown> {
  const elements = instances.map(fixtureInstanceToOrbitObject);
  return {
    speckle_type: 'Speckle.Core.Models.Collections.Collection',
    collectionType: 'layer',
    name,
    elements,
    sourceApplication: 'PRISM',
  };
}

export function collectOrbitObjects(root: Record<string, unknown>): Map<string, string> {
  const store = new Map<string, string>();

  function walk(obj: Record<string, unknown>): void {
    const id = computeObjectId(obj);
    obj.id = id;
    store.set(id, JSON.stringify(obj));

    for (const v of Object.values(obj)) {
      if (v && typeof v === 'object' && !Array.isArray(v) && 'speckle_type' in (v as object)) {
        walk(v as Record<string, unknown>);
      } else if (Array.isArray(v)) {
        for (const item of v) {
          if (item && typeof item === 'object' && 'speckle_type' in (item as object)) {
            walk(item as Record<string, unknown>);
          }
        }
      }
    }
  }

  walk(root);
  return store;
}
