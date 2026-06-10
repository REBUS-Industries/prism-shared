/**
 * Redis-backed registry of agent presence and pub/sub dispatch channels.
 *
 * Phase 2: externalises agent metadata out of the in-process singleton so
 * multiple server processes (Phase 3) can discover each other's agents.
 *
 * Key layout (all under prefix `prism:registry:`):
 *   prism:registry:agent:<workstationId>   — HASH: agent metadata + slot state
 *   prism:registry:agents:online           — SET:  workstationIds currently online
 *   prism:registry:dispatch:<workstationId> — pub/sub channel for cross-process dispatch
 *
 * Fallback behaviour:
 *   - If `REDIS_REGISTRY_FALLBACK=true` is set, all operations are silent no-ops
 *     so the server degrades to pure in-process state (useful for tests and
 *     environments without Redis).
 *   - If Redis is reachable but individual commands fail, errors are caught and
 *     logged at warn level; the calling code falls back to in-process state.
 */
import type Redis from 'ioredis';
import { redis as sharedRedis } from '../jobs/redis.js';

const AGENT_TTL_SECONDS = 90; // 3× heartbeat interval (heartbeat = 15 s)

const KEY = {
  agent:          (wid: string) => `prism:registry:agent:${wid}`,
  online:         ()            => `prism:registry:agents:online`,
  dispatch:       (wid: string) => `prism:registry:dispatch:${wid}`,
  adminBroadcast: ()            => 'prism:registry:admin:broadcast',
} as const;

export interface AgentMeta {
  workstationId: string;
  machineId: string;
  sessionId: string;
  nodeName: string;
  slotsTotal: number;
  slotsBusy: number;
  connectedAt: Date;
}

type DispatchHandler = (payload: string) => void;

// Lua script: atomically claim one conversion slot.
// Returns the new slotsBusy value, or -1 if already at/above cap.
const RESERVE_SLOT_SCRIPT = `
local key = KEYS[1]
local cap = tonumber(ARGV[1]) or 1
local cur = tonumber(redis.call('HGET', key, 'slotsBusy')) or 0
if cur >= cap then return -1 end
return redis.call('HINCRBY', key, 'slotsBusy', 1)
` as const;

// Lua script: atomically release one conversion slot, clamped at 0.
const RELEASE_SLOT_SCRIPT = `
local key = KEYS[1]
local cur = tonumber(redis.call('HGET', key, 'slotsBusy')) or 0
local nv = math.max(0, cur - 1)
redis.call('HSET', key, 'slotsBusy', tostring(nv))
return nv
` as const;

const FALLBACK = process.env['REDIS_REGISTRY_FALLBACK'] === 'true';

class RedisRegistry {
  private readonly cmd: Redis;
  private subClient: Redis | null = null;
  private readonly handlers = new Map<string, DispatchHandler>();

  constructor(client: Redis) {
    this.cmd = client;
  }

  async registerAgent(meta: AgentMeta): Promise<void> {
    if (FALLBACK) return;
    try {
      const key = KEY.agent(meta.workstationId);
      await this.cmd.hset(key, {
        workstationId: meta.workstationId,
        machineId:     meta.machineId,
        sessionId:     meta.sessionId,
        nodeName:      meta.nodeName,
        slotsTotal:    String(meta.slotsTotal),
        slotsBusy:     String(meta.slotsBusy),
        connectedAt:   meta.connectedAt.toISOString(),
      });
      await this.cmd.expire(key, AGENT_TTL_SECONDS);
      await this.cmd.sadd(KEY.online(), meta.workstationId);
    } catch (err) {
      this.warn('registerAgent', err);
    }
  }

  async unregisterAgent(workstationId: string): Promise<void> {
    if (FALLBACK) return;
    try {
      await this.cmd.del(KEY.agent(workstationId));
      await this.cmd.srem(KEY.online(), workstationId);
    } catch (err) {
      this.warn('unregisterAgent', err);
    }
  }

  async getAgent(workstationId: string): Promise<AgentMeta | null> {
    if (FALLBACK) return null;
    try {
      const raw = await this.cmd.hgetall(KEY.agent(workstationId));
      if (!raw || !raw['workstationId']) return null;
      return {
        workstationId: raw['workstationId'],
        machineId:     raw['machineId'] ?? '',
        sessionId:     raw['sessionId'] ?? '',
        nodeName:      raw['nodeName']  ?? '',
        slotsTotal:    Number(raw['slotsTotal'] ?? 1),
        slotsBusy:     Number(raw['slotsBusy']  ?? 0),
        connectedAt:   new Date(raw['connectedAt'] ?? 0),
      };
    } catch (err) {
      this.warn('getAgent', err);
      return null;
    }
  }

  /**
   * List metadata for all online agents from Redis.
   * Returns [] if Redis is unavailable or no agents are registered.
   */
  async listOnlineAgents(): Promise<AgentMeta[]> {
    if (FALLBACK) return [];
    try {
      const wids = await this.cmd.smembers(KEY.online());
      if (wids.length === 0) return [];
      const metas = await Promise.all(wids.map((w) => this.getAgent(w)));
      return metas.filter((m): m is AgentMeta => m !== null);
    } catch (err) {
      this.warn('listOnlineAgents', err);
      return [];
    }
  }

  /**
   * Atomically claim one conversion slot.
   * Returns the new slotsBusy count, or -1 when the agent is at capacity.
   */
  async reserveSlot(workstationId: string, slotsTotal: number): Promise<number> {
    if (FALLBACK) return 0;
    try {
      const result = await this.cmd.eval(RESERVE_SLOT_SCRIPT, 1, KEY.agent(workstationId), String(slotsTotal));
      return Number(result);
    } catch (err) {
      this.warn('reserveSlot', err);
      return 0;
    }
  }

  /**
   * Atomically release one conversion slot (clamped at 0).
   * Returns the new slotsBusy count.
   */
  async releaseSlot(workstationId: string): Promise<number> {
    if (FALLBACK) return 0;
    try {
      const result = await this.cmd.eval(RELEASE_SLOT_SCRIPT, 1, KEY.agent(workstationId));
      return Number(result);
    } catch (err) {
      this.warn('releaseSlot', err);
      return 0;
    }
  }

  /**
   * Overwrite the slotsBusy field in the agent hash.
   * Used by the heartbeat handler to reconcile the authoritative agent-reported
   * count into Redis without going through the reserve/release protocol.
   */
  async syncSlotsBusy(workstationId: string, count: number): Promise<void> {
    if (FALLBACK) return;
    try {
      await this.cmd.hset(KEY.agent(workstationId), 'slotsBusy', String(count));
    } catch (err) {
      this.warn('syncSlotsBusy', err);
    }
  }

  /**
   * Extend the TTL on the agent hash (call on heartbeat).
   */
  async refreshPresence(workstationId: string): Promise<void> {
    if (FALLBACK) return;
    try {
      await this.cmd.expire(KEY.agent(workstationId), AGENT_TTL_SECONDS);
    } catch (err) {
      this.warn('refreshPresence', err);
    }
  }

  /**
   * Publish a dispatch payload to the per-workstation channel.
   * Only the process that holds the socket for `workstationId` forwards it.
   */
  async publishDispatch(workstationId: string, payload: string): Promise<void> {
    if (FALLBACK) return;
    try {
      await this.cmd.publish(KEY.dispatch(workstationId), payload);
    } catch (err) {
      this.warn('publishDispatch', err);
    }
  }

  /**
   * Subscribe to dispatch messages for a specific workstation.
   *
   * Redis pub/sub requires a dedicated connection; the sub-client is created
   * lazily on the first subscription call (it is a clone of the command client
   * so it inherits the same URL and retry settings).
   */
  async subscribeToDispatch(workstationId: string, handler: DispatchHandler): Promise<void> {
    if (FALLBACK) return;
    try {
      const sub = this.getSubClient();
      const channel = KEY.dispatch(workstationId);
      this.handlers.set(channel, handler);
      await sub.subscribe(channel);
    } catch (err) {
      this.warn('subscribeToDispatch', err);
    }
  }

  async unsubscribeFromDispatch(workstationId: string): Promise<void> {
    if (FALLBACK || !this.subClient) return;
    try {
      const channel = KEY.dispatch(workstationId);
      this.handlers.delete(channel);
      await this.subClient.unsubscribe(channel);
    } catch (err) {
      this.warn('unsubscribeFromDispatch', err);
    }
  }

  /**
   * Publish an admin broadcast event to all subscribed processes.
   * Used by `sessionRegistry.broadcastAdmin` so every process that holds
   * admin sockets (e.g. the visualiser-service) receives the event.
   */
  async publishAdminBroadcast(topic: string, frame: string): Promise<void> {
    if (FALLBACK) return;
    try {
      await this.cmd.publish(KEY.adminBroadcast(), JSON.stringify({ topic, frame }));
    } catch (err) {
      this.warn('publishAdminBroadcast', err);
    }
  }

  /**
   * Subscribe to cross-process admin broadcast events.
   * The handler receives the topic and serialised frame for each published message.
   * Intended for use by the visualiser-service to fan out to its local admin sockets.
   */
  async subscribeToAdminBroadcast(handler: (topic: string, frame: string) => void): Promise<void> {
    if (FALLBACK) return;
    try {
      const sub = this.getSubClient();
      const channel = KEY.adminBroadcast();
      this.handlers.set(channel, (msg) => {
        try {
          const parsed = JSON.parse(msg) as { topic: string; frame: string };
          handler(parsed.topic, parsed.frame);
        } catch { /* ignore malformed messages */ }
      });
      await sub.subscribe(channel);
    } catch (err) {
      this.warn('subscribeToAdminBroadcast', err);
    }
  }

  private getSubClient(): Redis {
    if (!this.subClient) {
      this.subClient = this.cmd.duplicate();
      this.subClient.on('message', (channel: string, message: string) => {
        this.handlers.get(channel)?.(message);
      });
      this.subClient.on('error', () => { /* errors surfaced via command failures */ });
    }
    return this.subClient;
  }

  private warn(op: string, err: unknown): void {
    process.stderr.write(`[redisRegistry] ${op} failed: ${String(err)}\n`);
  }
}

export const redisRegistry = new RedisRegistry(sharedRedis);
