/**
 * Admin WS broadcast helpers.
 *
 * Admin SPA opens a single /ws/admin connection per tab and sends a
 * `subscribe` frame listing which topics it cares about
 * (`jobs`, `workstations`, `job:<uuid>`). Server fans events out via
 * sessionRegistry.broadcastAdmin().
 */
import { randomUUID } from 'node:crypto';
import type { WebSocket } from 'ws';
import type { FastifyBaseLogger } from 'fastify';
import { sessionRegistry, type AdminConn } from './sessionRegistry.js';

export function handleAdminSocket(socket: WebSocket, log: FastifyBaseLogger): void {
  const conn: AdminConn = {
    id: randomUUID(),
    socket,
    connectedAt: new Date(),
    subscriptions: new Set(['jobs', 'workstations']),  // sensible default
  };
  sessionRegistry.addAdmin(conn);
  log.info({ adminId: conn.id }, 'admin ws connected');

  socket.send(JSON.stringify({ type: 'hello', subscribed: [...conn.subscriptions] }));

  socket.on('message', (raw) => {
    let msg: { type?: string; topic?: string; topics?: string[] };
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (msg.type === 'subscribe' && Array.isArray(msg.topics)) {
      for (const t of msg.topics) if (typeof t === 'string') conn.subscriptions.add(t);
    } else if (msg.type === 'unsubscribe' && Array.isArray(msg.topics)) {
      for (const t of msg.topics) if (typeof t === 'string') conn.subscriptions.delete(t);
    } else if (msg.type === 'ping') {
      try { socket.send(JSON.stringify({ type: 'pong', ts: new Date().toISOString() })); } catch { /* ignore */ }
    }
  });

  socket.on('close', () => {
    sessionRegistry.removeAdmin(conn.id);
    log.info({ adminId: conn.id }, 'admin ws closed');
  });

  socket.on('error', (err) => log.warn({ err, adminId: conn.id }, 'admin ws error'));
}

/* -------------------------------------------------------------------------- */
/* Convenience broadcasters used by the agent protocol handler                 */
/* -------------------------------------------------------------------------- */

export function broadcastJobUpdate(jobId: string, payload: Record<string, unknown>): void {
  const frame = JSON.stringify({ type: 'job', jobId, ts: new Date().toISOString(), ...payload });
  sessionRegistry.broadcastAdmin('jobs', frame);
  sessionRegistry.broadcastAdmin(`job:${jobId}`, frame);
}

export function broadcastWorkstationUpdate(payload: Record<string, unknown>): void {
  const frame = JSON.stringify({ type: 'workstation', ts: new Date().toISOString(), ...payload });
  sessionRegistry.broadcastAdmin('workstations', frame);
}
