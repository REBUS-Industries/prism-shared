/**
 * Per-run visualiser log helper — appends a line to `visualiser_run_logs`.
 *
 * Mirrors how `job_logs` is written for conversion jobs. Lifecycle events
 * (requested, dispatched, version resolved, ready, failed, ended, stopped)
 * call this so the admin Visualiser viewer can render a per-run timeline via
 * `GET /api/visualiser/streams/:runId/logs`.
 *
 * Best-effort: a logging failure must never break the run flow, so writes
 * are wrapped and errors are swallowed (optionally surfaced through a passed
 * logger). Keep messages free of secrets — no tokens or bearer values.
 */
import { db } from '../db/client.js';
import { visualiserRunLogs } from '../db/schema.js';

export type VisualiserLogLevel = 'debug' | 'info' | 'warn' | 'error';
export type VisualiserLogSource = 'server' | 'agent';

export interface AppendRunLogOpts {
  level?: VisualiserLogLevel;
  source?: VisualiserLogSource;
  /** Optional logger to warn on persistence failure. */
  log?: { warn: (obj: unknown, msg?: string) => void };
}

export async function appendVisualiserRunLog(
  runId: string,
  message: string,
  opts: AppendRunLogOpts = {},
): Promise<void> {
  try {
    await db.insert(visualiserRunLogs).values({
      runId,
      level: opts.level ?? 'info',
      source: opts.source ?? 'server',
      message,
    });
  } catch (err) {
    opts.log?.warn({ err, runId }, 'failed to append visualiser run log');
  }
}
