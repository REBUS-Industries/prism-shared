/**
 * In-process registry of browser ⇄ PRISM signalling WS connections, plus
 * the per-run single-controller lock and its control-channel subscribers.
 *
 * Extracted from `signallingProxy.ts` so `agentProtocol.ts` can import the
 * registry without creating a circular dependency (the proxy plugin
 * imports `sendSignallingFrameToAgent` from agentProtocol; the agent
 * protocol handler imports the registry to route inbound frames back to
 * the right browser viewer).
 *
 * Multi-viewer model
 * ------------------
 * A run may have several concurrent browser viewers (~5 max — we stay
 * non-SFU). Each browser signalling socket is an INDEPENDENT Pixel
 * Streaming player with a stable `viewerId`. The agent opens one local
 * Cirrus/Wilbur player WS per viewerId (1:1), so the streamer's per-player
 * SDP/ICE never collides between viewers. Inbound agent→browser frames are
 * therefore routed to the single matching viewer, NOT broadcast (the old
 * 1:1-assuming broadcast is what made a second viewer freeze the first).
 *
 * Controller lock
 * ---------------
 * Exactly one viewer per run may hold "control" (drive input) at a time.
 * The lock lives here (the run is ephemeral; no DB needed). `view`-tier
 * viewers can never take control; `control`-tier viewers can take/release.
 * Control-channel subscribers (the dedicated `/ws/visualiser/:runId/control`
 * sockets) are notified whenever the controller changes so every viewer
 * UI reflects who holds the lock. The registry is pure state + routing;
 * the caller is responsible for telling the agent about control changes
 * (via `agentProtocol.sendSetViewerControl`) — keeping this module free of
 * a back-dependency on agentProtocol.
 */
import type { WebSocket } from 'ws';
import type { SignallingFrameData } from '../contracts/agent-protocol.js';

export type ViewerTier = 'view' | 'control';

export interface BrowserConn {
  socket: WebSocket;
  agentSessionId: string;
  runId: string;
  /** Stable per-viewer demux key (from the signalling JWT). */
  viewerId: string;
  /** Whether this viewer is allowed to take control. */
  tier: ViewerTier;
}

/** A subscriber on the dedicated control channel for a run. */
export interface ControlSub {
  socket: WebSocket;
  viewerId: string;
  tier: ViewerTier;
}

/** Snapshot of the controller lock surfaced to control-channel clients. */
export interface ControllerState {
  controllerViewerId: string | null;
}

interface RunState {
  viewers: Map<string, BrowserConn>;
  controlSubs: Map<string, ControlSub>;
  controllerViewerId: string | null;
}

/** Result of a take/release attempt — the caller pushes the agent update. */
export interface ControlChange {
  ok: boolean;
  reason?: string;
  changed: boolean;
  runId: string;
  agentSessionId: string | null;
  /** Viewer that lost control (input must be gated off on the agent). */
  demoted: string | null;
  /** Viewer that gained control (input must be gated on). */
  promoted: string | null;
  controllerViewerId: string | null;
}

class SignallingProxyRegistry {
  private byRun = new Map<string, RunState>();

  /**
   * Optional observer notified whenever a run's connected-viewer count
   * changes (a viewer signalling socket was added or removed). The
   * viewer-aware idle reaper subscribes to this so it can arm/cancel its
   * per-run "no viewers" countdown. Kept as an injected callback (rather
   * than an import) so this module stays dependency-free and no import
   * cycle forms between the registry and the reaper.
   */
  private viewerCountListener: ((runId: string, count: number) => void) | null = null;

  /** Register the (single) viewer-count observer. See {@link viewerCountListener}. */
  setViewerCountListener(fn: ((runId: string, count: number) => void) | null): void {
    this.viewerCountListener = fn;
  }

  /** Current number of connected viewer signalling sockets for a run. */
  viewerCount(runId: string): number {
    return this.byRun.get(runId)?.viewers.size ?? 0;
  }

  private notifyViewerCount(runId: string): void {
    if (!this.viewerCountListener) return;
    try {
      this.viewerCountListener(runId, this.viewerCount(runId));
    } catch {
      /* a misbehaving listener must never break signalling routing */
    }
  }

  private ensure(runId: string): RunState {
    let st = this.byRun.get(runId);
    if (!st) {
      st = { viewers: new Map(), controlSubs: new Map(), controllerViewerId: null };
      this.byRun.set(runId, st);
    }
    return st;
  }

  private reapIfEmpty(runId: string): void {
    const st = this.byRun.get(runId);
    if (st && st.viewers.size === 0 && st.controlSubs.size === 0) {
      this.byRun.delete(runId);
    }
  }

  /* ---------------- viewer signalling sockets ---------------- */

  add(conn: BrowserConn): void {
    const st = this.ensure(conn.runId);
    // A reconnecting viewerId replaces its previous socket; close the
    // stale one so we don't leak a half-dead browser connection.
    const prev = st.viewers.get(conn.viewerId);
    if (prev && prev.socket !== conn.socket) {
      try { prev.socket.close(1000, 'replaced by newer viewer socket'); } catch { /* ignore */ }
    }
    st.viewers.set(conn.viewerId, conn);
    // A viewer is connected → genuine activity; lets the idle reaper cancel
    // any pending "no viewers" countdown for this run.
    this.notifyViewerCount(conn.runId);
  }

  /**
   * Drop a viewer socket. Returns whether the removed viewer was the
   * current controller (so the caller can notify the agent + broadcast).
   */
  remove(conn: BrowserConn): { wasController: boolean; agentSessionId: string | null } {
    const st = this.byRun.get(conn.runId);
    if (!st) return { wasController: false, agentSessionId: null };
    const current = st.viewers.get(conn.viewerId);
    // Only delete if this exact socket is still the registered one (a
    // newer reconnect may already have replaced it).
    if (current && current.socket === conn.socket) st.viewers.delete(conn.viewerId);
    let wasController = false;
    if (st.controllerViewerId === conn.viewerId && !st.viewers.has(conn.viewerId)) {
      st.controllerViewerId = null;
      wasController = true;
    }
    const agentSessionId = conn.agentSessionId;
    if (wasController) this.broadcastControl(conn.runId);
    // Notify BEFORE reapIfEmpty deletes the run-state map entry — the count is
    // computed from the live `viewers` map either way (0 once deleted), so the
    // reaper arms its countdown when the last viewer leaves.
    this.notifyViewerCount(conn.runId);
    this.reapIfEmpty(conn.runId);
    return { wasController, agentSessionId };
  }

  /**
   * Route an agent-originated frame to the single matching viewer. When
   * the frame carries no `viewerId` (older agent) we fall back to a
   * broadcast so a single-viewer run still works.
   */
  forwardAgentToBrowser(frame: SignallingFrameData): void {
    const st = this.byRun.get(frame.runId);
    if (!st || st.viewers.size === 0) return;
    const text = typeof frame.payload === 'string' ? frame.payload : null;
    const bin  = typeof frame.payloadB64 === 'string' ? Buffer.from(frame.payloadB64, 'base64') : null;
    const send = (conn: BrowserConn) => {
      if (conn.socket.readyState !== conn.socket.OPEN) return;
      try {
        if (text != null) conn.socket.send(text);
        else if (bin != null) conn.socket.send(bin);
      } catch { /* socket closing — close cleanup reaps it */ }
    };
    if (frame.viewerId) {
      const conn = st.viewers.get(frame.viewerId);
      if (conn) send(conn);
      return;
    }
    for (const conn of st.viewers.values()) send(conn);
  }

  /** All active viewerIds for a run (used to fan a viewer-close to the agent on run teardown). */
  viewerIds(runId: string): string[] {
    const st = this.byRun.get(runId);
    return st ? [...st.viewers.keys()] : [];
  }

  /* ---------------- controller lock ---------------- */

  controllerState(runId: string): ControllerState {
    const st = this.byRun.get(runId);
    return { controllerViewerId: st?.controllerViewerId ?? null };
  }

  /**
   * Auto-grant control to a freshly-connected `control`-tier viewer when
   * the run currently has no controller. Preserves the historical
   * "admin/owner viewer just drives the viewport" behaviour without a
   * manual take. No-op for view-tier or when a controller already holds
   * the lock.
   */
  autoGrantIfVacant(runId: string, viewerId: string, tier: ViewerTier): ControlChange {
    const st = this.ensure(runId);
    if (tier !== 'control' || st.controllerViewerId !== null) {
      return { ok: true, changed: false, runId, agentSessionId: this.agentSessionId(runId), demoted: null, promoted: null, controllerViewerId: st.controllerViewerId };
    }
    st.controllerViewerId = viewerId;
    this.broadcastControl(runId);
    return { ok: true, changed: true, runId, agentSessionId: this.agentSessionId(runId), demoted: null, promoted: viewerId, controllerViewerId: viewerId };
  }

  takeControl(runId: string, viewerId: string, tier: ViewerTier): ControlChange {
    const st = this.byRun.get(runId);
    const agentSessionId = this.agentSessionId(runId);
    if (!st) return { ok: false, reason: 'run not active', changed: false, runId, agentSessionId, demoted: null, promoted: null, controllerViewerId: null };
    if (tier !== 'control') {
      return { ok: false, reason: 'view-only viewer cannot take control', changed: false, runId, agentSessionId, demoted: null, promoted: null, controllerViewerId: st.controllerViewerId };
    }
    if (st.controllerViewerId === viewerId) {
      return { ok: true, changed: false, runId, agentSessionId, demoted: null, promoted: null, controllerViewerId: viewerId };
    }
    const demoted = st.controllerViewerId;
    st.controllerViewerId = viewerId;
    this.broadcastControl(runId);
    return { ok: true, changed: true, runId, agentSessionId, demoted, promoted: viewerId, controllerViewerId: viewerId };
  }

  releaseControl(runId: string, viewerId: string): ControlChange {
    const st = this.byRun.get(runId);
    const agentSessionId = this.agentSessionId(runId);
    if (!st) return { ok: false, reason: 'run not active', changed: false, runId, agentSessionId, demoted: null, promoted: null, controllerViewerId: null };
    if (st.controllerViewerId !== viewerId) {
      return { ok: true, changed: false, runId, agentSessionId, demoted: null, promoted: null, controllerViewerId: st.controllerViewerId };
    }
    st.controllerViewerId = null;
    this.broadcastControl(runId);
    return { ok: true, changed: true, runId, agentSessionId, demoted: viewerId, promoted: null, controllerViewerId: null };
  }

  private agentSessionId(runId: string): string | null {
    const st = this.byRun.get(runId);
    if (!st) return null;
    for (const v of st.viewers.values()) return v.agentSessionId;
    return null;
  }

  /* ---------------- control channel subscribers ---------------- */

  addControlSub(runId: string, sub: ControlSub): void {
    const st = this.ensure(runId);
    const prev = st.controlSubs.get(sub.viewerId);
    if (prev && prev.socket !== sub.socket) {
      try { prev.socket.close(1000, 'replaced by newer control socket'); } catch { /* ignore */ }
    }
    st.controlSubs.set(sub.viewerId, sub);
    // Push current state immediately so a freshly-connected UI is correct.
    this.sendControlState(sub, st.controllerViewerId);
  }

  removeControlSub(runId: string, sub: ControlSub): void {
    const st = this.byRun.get(runId);
    if (!st) return;
    const cur = st.controlSubs.get(sub.viewerId);
    if (cur && cur.socket === sub.socket) st.controlSubs.delete(sub.viewerId);
    this.reapIfEmpty(runId);
  }

  broadcastControl(runId: string): void {
    const st = this.byRun.get(runId);
    if (!st) return;
    for (const sub of st.controlSubs.values()) this.sendControlState(sub, st.controllerViewerId);
  }

  private sendControlState(sub: ControlSub, controllerViewerId: string | null): void {
    if (sub.socket.readyState !== sub.socket.OPEN) return;
    const msg = {
      type: 'controller',
      controllerViewerId,
      you: sub.viewerId,
      youAreController: controllerViewerId === sub.viewerId,
      canControl: sub.tier === 'control',
    };
    try { sub.socket.send(JSON.stringify(msg)); } catch { /* ignore */ }
  }

  /** Close every viewer + control socket for `runId`. */
  closeRun(runId: string, code: number, reason: string): void {
    const st = this.byRun.get(runId);
    if (!st) return;
    for (const conn of st.viewers.values()) {
      try { conn.socket.close(code, reason); } catch { /* ignore */ }
    }
    for (const sub of st.controlSubs.values()) {
      try { sub.socket.close(code, reason); } catch { /* ignore */ }
    }
    this.byRun.delete(runId);
  }

  size(): number { return this.byRun.size; }
}

export const signallingProxyRegistry = new SignallingProxyRegistry();
