import { createHash } from 'node:crypto';

/**
 * SHA-256 content hash for an ORBIT object (excludes `id` field).
 * Mirrors PRISM app/orbit_client.py compute_id.
 */
export function computeObjectId(obj: Record<string, unknown>): string {
  const copy: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k !== 'id') copy[k] = v;
  }
  const serialised = JSON.stringify(copy, Object.keys(copy).sort());
  return createHash('sha256').update(serialised).digest('hex');
}
