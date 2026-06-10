import type { FixtureInstance } from '../contracts/fixtures.js';
import type { OrbitTarget } from './client.js';
import { getOrbitCreds, OrbitClientError } from './client.js';
import { buildFixtureSceneRoot, collectOrbitObjects } from './serialise.js';

const BATCH_SIZE = 100;
const MAX_BYTES = 1_000_000;

async function flushBatch(
  url: string,
  token: string,
  projectId: string,
  batch: string[],
): Promise<void> {
  const payload = `[${batch.join(',')}]`;
  const res = await fetch(`${url}/objects/${projectId}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: payload,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new OrbitClientError(res.status, `object upload failed: ${text}`);
  }
}

async function uploadObjects(
  creds: { url: string; token: string },
  projectId: string,
  objects: Map<string, string>,
): Promise<string> {
  let batch: string[] = [];
  let batchBytes = 0;
  let rootId = '';

  for (const [id, json] of objects) {
    if (!rootId) rootId = id;
    if (batch.length >= BATCH_SIZE || batchBytes + json.length > MAX_BYTES) {
      await flushBatch(creds.url, creds.token, projectId, batch);
      batch = [];
      batchBytes = 0;
    }
    batch.push(json);
    batchBytes += json.length;
  }
  if (batch.length) await flushBatch(creds.url, creds.token, projectId, batch);

  const parsed = JSON.parse(objects.get(rootId) ?? '{}') as { id?: string };
  return parsed.id ?? rootId;
}

const CREATE_VERSION = `mutation CreateVersion($input: CreateVersionInput!) {
  versionMutations { create(input: $input) { id } }
}`;

async function createVersion(
  creds: { url: string; token: string },
  projectId: string,
  modelId: string,
  objectId: string,
  message: string,
): Promise<string> {
  const res = await fetch(`${creds.url}/graphql`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${creds.token}`,
    },
    body: JSON.stringify({
      query: CREATE_VERSION,
      variables: {
        input: {
          projectId,
          modelId,
          objectId,
          message,
          sourceApplication: 'PRISM',
        },
      },
    }),
  });
  if (!res.ok) throw new OrbitClientError(res.status, 'version create failed');
  const json = await res.json() as { data?: { versionMutations?: { create?: { id: string } } }; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new OrbitClientError(400, json.errors.map((e) => e.message).join('; '));
  const id = json.data?.versionMutations?.create?.id;
  if (!id) throw new OrbitClientError(502, 'version id missing');
  return id;
}

export interface UploadSceneOptions {
  target: OrbitTarget;
  projectId: string;
  modelId: string;
  instances: FixtureInstance[];
  message?: string;
}

export async function uploadSceneToOrbit(opts: UploadSceneOptions): Promise<{
  rootObjectId: string;
  versionId: string;
  objectCount: number;
}> {
  const creds = await getOrbitCreds(opts.target);
  if (!creds) throw new OrbitClientError(412, `ORBIT ${opts.target} credentials not configured`);

  const root = buildFixtureSceneRoot('PRISM Fixture Scene', opts.instances);
  const objects = collectOrbitObjects(root);
  const rootObjectId = await uploadObjects(creds, opts.projectId, objects);
  const versionId = await createVersion(
    creds,
    opts.projectId,
    opts.modelId,
    rootObjectId,
    opts.message ?? 'Imported via PRISM fixture library',
  );

  return { rootObjectId, versionId, objectCount: objects.size };
}
