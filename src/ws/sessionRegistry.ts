/**
 * Hybrid session registry.
 *
 * Phase 2: agent presence and slot state are persisted to Redis so that
 * multiple server processes (Phase 3) can observe the full agent pool.
 * Per-socket state that cannot be serialised (the WebSocket object itself,
 * per-connection timers, per-session logger) remains in the local process.
 *
 * Two flavours:
 *   - agent: one per PRISM.Agent.exe process
 *   - admin: one per open admin SPA tab (subscribed to job + workstation streams)
 *
 * Public interface is unchanged from Phase 1 except:
 *   - `addAgent`, `removeAgent`, `allAgents` are now async (Redis I/O)
 *   - `reserveSlot`, `releaseConversionSlot`, `syncSlotsBusy`, `refreshPresence`
 *     are new async slot-management helpers that keep Redis in sync
 *   - Admin operations and direct socket lookups (`getAgent`, `getAgentByMachine`)
 *     remain synchronous (local map only — sockets are always process-local)
 */
import type { WebSocket } from 'ws';
import type { HelloData } from '../contracts/agent-protocol.js';
import { redisRegistry } from './redisRegistry.js';

export interface AgentConn {
  sessionId: string;
  workstationId: string;       // FK -> workstations.id
  machineId: string;           // de-dup key: one active conn per machineId
  nodeName: string;
  socket: WebSocket;
  hello: HelloData;
  slotsBusy: number;
  connectedAt: Date;
  lastHeartbeat: Date;
  remoteAddr?: string | undefined;
}

export interface AdminConn {
  id: string;
  socket: WebSocket;
  connectedAt: Date;
  subscriptions: Set<string>;  // e.g. 'jobs', 'workstations', 'job:<uuid>'
}

class Registry {
  // Process-local socket maps — sockets cannot be serialised to Redis.
  private agentsByMachine    = new Map<string, AgentConn>();
  private agentsBySession    = new Map<string, AgentConn>();
  private agentsByWorkstation = new Map<string, AgentConn>();
  private admins             = new Map<string, AdminConn>();

  /**
   * Register an agent connection.
   *
   * If a stale connection for the same machineId already exists it is closed
   * and removed from all local maps before the new one is installed.
   * Metadata is written to Redis so other processes can see the agent.
   */
  async addAgent(conn: AgentConn): Promise<AgentConn | undefined> {
    const old = this.agentsByMachine.get(conn.machineId);
    if (old) {
      this.agentsBySession.delete(old.sessionId);
      this.agentsByWorkstation.delete(old.workstationId);
      try { old.socket.close(1001, 'replaced by newer connection'); } catch { /* ignore */ }
    }
    this.agentsByMachine.set(conn.machineId, conn);
    this.agentsBySession.set(conn.sessionId, conn);
    this.agentsByWorkstation.set(conn.workstationId, conn);

    await redisRegistry.registerAgent({
      workstationId: conn.workstationId,
      machineId:     conn.machineId,
      sessionId:     conn.sessionId,
      nodeName:      conn.nodeName,
      slotsTotal:    conn.hello.slots,
      slotsBusy:     conn.slotsBusy,
      connectedAt:   conn.connectedAt,
    });

    return old;
  }

  /**
   * Remove an agent by sessionId and clean up Redis presence.
   * Returns the removed AgentConn, or undefined if not found.
   */
  async removeAgent(sessionId: string): Promise<AgentConn | undefined> {
    const conn = this.agentsBySession.get(sessionId);
    if (!conn) return undefined;
    this.agentsBySession.delete(sessionId);
    this.agentsByWorkstation.delete(conn.workstationId);
    if (this.agentsByMachine.get(conn.machineId) === conn) {
      this.agentsByMachine.delete(conn.machineId);
    }

    await redisRegistry.unregisterAgent(conn.workstationId);

    return conn;
  }

  /** Look up a live agent socket by sessionId (process-local; sync). */
  getAgent(sessionId: string): AgentConn | undefined {
    return this.agentsBySession.get(sessionId);
  }

  /** Look up a live agent socket by machineId (process-local; sync). */
  getAgentByMachine(machineId: string): AgentConn | undefined {
    return this.agentsByMachine.get(machineId);
  }

  /**
   * Return all currently online agents.
   *
   * Phase 2 strategy:
   *   1. Ask Redis for the set of online workstationIds.
   *   2. Map each to the local AgentConn (which carries the live socket).
   *   3. If Redis returns nothing but the local map is populated (e.g. Redis
   *      just restarted and agents haven't re-registered yet), fall back to
   *      the local map so dispatch is not silently starved.
   *
   * Phase 3 note: once the dispatcher runs in a separate process it will not
   * hold local sockets.  The cross-process dispatch path (publishDispatch /
   * subscribeToDispatch) in redisRegistry.ts is the Phase 3 mechanism; Phase 2
   * callers that still call `conn.socket.send()` directly continue to work
   * because all sockets are local in the single-process deployment.
   */
  async allAgents(): Promise<AgentConn[]> {
    const metas = await redisRegistry.listOnlineAgents();

    if (metas.length === 0 && this.agentsByWorkstation.size > 0) {
      // Redis unavailable or the online set was not yet populated —
      // fall back to the local map so the dispatcher is not starved.
      return [...this.agentsBySession.values()];
    }

    return metas
      .map((m) => this.agentsByWorkstation.get(m.workstationId))
      .filter((c): c is AgentConn => c !== undefined);
  }

  /**
   * Atomically claim one conversion slot for `workstationId`.
   *
   * Increments `slotsBusy` in Redis via a Lua check-and-reserve script and
   * mirrors the change to the local AgentConn so callers that inspect
   * `conn.slotsBusy` see the updated value without an extra Redis round-trip.
   */
  async reserveSlot(workstationId: string): Promise<void> {
    const conn = this.agentsByWorkstation.get(workstationId);
    const slotsTotal = conn?.hello.slots ?? 1;
    await redisRegistry.reserveSlot(workstationId, slotsTotal);
    // Mirror to local object so the next allAgents() + slotsBusy check is correct
    // within the same process without waiting for a Redis read.
    if (conn) conn.slotsBusy += 1;
  }

  /**
   * Release one conversion slot for `workstationId` (clamped at 0).
   *
   * Mirrors the change to the local AgentConn.
   */
  async releaseConversionSlot(workstationId: string): Promise<void> {
    await redisRegistry.releaseSlot(workstationId);
    const conn = this.agentsByWorkstation.get(workstationId);
    if (conn) conn.slotsBusy = Math.max(0, conn.slotsBusy - 1);
  }

  /**
   * Overwrite the Redis slotsBusy counter with the authoritative agent-reported
   * count received on heartbeat.  Fire-and-forget is acceptable here; callers
   * should call with `void` and not await.
   */
  async syncSlotsBusy(workstationId: string, count: number): Promise<void> {
    await redisRegistry.syncSlotsBusy(workstationId, count);
  }

  /**
   * Extend the Redis TTL on the agent hash key (call on each heartbeat so
   * the key does not expire while the agent is actively connected).
   * Fire-and-forget is acceptable; callers should call with `void`.
   */
  async refreshPresence(workstationId: string): Promise<void> {
    await redisRegistry.refreshPresence(workstationId);
  }

  /**
   * Send a payload to a specific agent by workstationId.
   *
   * Phase 2: looks up the local socket; sends directly if found.
   * Phase 3: if the socket is not local, publishes to the Redis dispatch
   * channel so the process that holds the socket can relay it.
   */
  async sendToAgent(workstationId: string, payload: string): Promise<boolean> {
    const conn = this.agentsByWorkstation.get(workstationId);
    if (conn && conn.socket.readyState === conn.socket.OPEN) {
      try { conn.socket.send(payload); return true; } catch { return false; }
    }
    // No local socket — cross-process dispatch via Redis pub/sub.
    // The agent-service process that holds the socket is subscribed and will forward.
    await redisRegistry.publishDispatch(workstationId, payload);
    return true;
  }

  // ------------------------------------------------------------------
  // Admin connections — always process-local; all operations are sync.
  // ------------------------------------------------------------------

  addAdmin(conn: AdminConn): void { this.admins.set(conn.id, conn); }
  removeAdmin(id: string): void { this.admins.delete(id); }
  allAdmins(): AdminConn[] { return [...this.admins.values()]; }

  /**
   * Fan a serialised message to process-local admin sockets whose subscriptions
   * include `topic`. Does NOT publish to Redis — safe to call from a Redis
   * subscriber without creating a feedback loop.
   */
  broadcastAdminLocal(topic: string, frame: string): void {
    for (const a of this.admins.values()) {
      if (!a.subscriptions.has(topic) && !a.subscriptions.has('*')) continue;
      try { a.socket.send(frame); } catch { /* ignore broken sockets */ }
    }
  }

  /**
   * Fan a serialised message to every admin whose subscriptions include `topic`
   * AND publish the event to Redis so other processes (e.g. visualiser-service)
   * can fan out to their own local admin sockets.
   */
  broadcastAdmin(topic: string, frame: string): void {
    this.broadcastAdminLocal(topic, frame);
    void redisRegistry.publishAdminBroadcast(topic, frame);
  }
}

export const sessionRegistry = new Registry();
