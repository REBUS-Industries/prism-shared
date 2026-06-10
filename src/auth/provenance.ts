/**
 * Request provenance — a small, safe-to-persist summary of WHERE a request
 * came from, derived from the resolved {@link Principal} and the client IP.
 *
 * Two consumers share this helper:
 *   - the visualiser `POST /streams` handler, which stamps `origin_kind` /
 *     `origin_address` / `origin_principal` onto the `visualiser_runs` row so
 *     the admin UI can show whether a run was started locally (admin UI) or
 *     via the external API, and from which IP;
 *   - the global API-call log hook (see observability/apiLog.ts), which tags
 *     every inbound request with the same provenance for the admin Logs page.
 *
 * Client IP: Fastify is configured with `trustProxy: true` (see main.ts), so
 * `request.ip` already reflects the real client address from
 * `X-Forwarded-For` when PRISM sits behind Caddy, and the socket peer
 * otherwise. We additionally strip the IPv4-mapped IPv6 prefix so the value
 * matches what an operator sees elsewhere in the UI.
 *
 * Secrets: this helper deliberately reads ONLY the principal label and IP —
 * never the API key plaintext, bearer token, or any header value.
 */
import type { FastifyRequest } from 'fastify';

export type OriginKind = 'admin' | 'api' | 'orbit' | 'internal' | 'anonymous';

export interface RequestProvenance {
  /** Coarse category of the caller. */
  originKind: OriginKind;
  /** Client IP address (best-effort; null when unavailable). */
  originAddress: string | null;
  /** Human-friendly principal label (admin username, API key name, ORBIT user id). */
  originPrincipal: string | null;
}

/** Strip the IPv4-mapped IPv6 prefix (`::ffff:`) and trim, matching agentProtocol. */
export function normaliseClientIp(addr: string | undefined | null): string | null {
  if (addr == null) return null;
  let s = String(addr).trim();
  if (!s) return null;
  if (s.toLowerCase().startsWith('::ffff:')) s = s.slice('::ffff:'.length);
  return s || null;
}

export function resolveProvenance(req: FastifyRequest): RequestProvenance {
  const originAddress = normaliseClientIp(req.ip);
  const p = req.principal;
  if (!p) {
    return { originKind: 'anonymous', originAddress, originPrincipal: null };
  }
  switch (p.kind) {
    case 'adminSession':
      return { originKind: 'admin', originAddress, originPrincipal: p.username };
    case 'apiKey':
      // Name is operator-assigned and safe to surface; the key plaintext is
      // never available here (only the row id + name).
      return { originKind: 'api', originAddress, originPrincipal: p.apiKeyName };
    case 'orbitUser':
      return { originKind: 'orbit', originAddress, originPrincipal: `orbit:${p.userId}` };
  }
}
