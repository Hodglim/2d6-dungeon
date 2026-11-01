import type { HistoryState } from '../core/history';
import { decodeSave, type CampaignMeta } from './record';

export type StartupDecision =
  | { kind: 'fresh' }
  | { kind: 'restore'; meta: CampaignMeta; history: HistoryState }
  | { kind: 'error'; error: string };

/** What to do with whatever the store returned on launch. Nothing here writes; an `error` record must stay untouched. */
export function decideStartup(raw: unknown | null): StartupDecision {
  if (raw === null || raw === undefined) return { kind: 'fresh' };
  const res = decodeSave(raw);
  return res.ok ? { kind: 'restore', meta: res.meta, history: res.history } : { kind: 'error', error: res.error };
}

export type LoadOutcome = { kind: 'loaded'; raw: unknown | null } | { kind: 'unreadable'; error: string };

export const LOAD_TIMEOUT_MS = 5000;

/**
 * Runs `load` and settles exactly once: with the record, or as unreadable if it rejects or
 * hasn't settled within `timeoutMs`. A late result after the timeout is dropped, so it can never
 * restore over a dialog or a new game.
 */
export function loadWithTimeout(
  load: () => Promise<unknown | null>,
  timeoutMs: number = LOAD_TIMEOUT_MS,
  setTimer: typeof setTimeout = (...a) => setTimeout(...a),
  clearTimer: typeof clearTimeout = (...a) => clearTimeout(...a),
): Promise<LoadOutcome> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (o: LoadOutcome) => {
      if (done) return;
      done = true;
      clearTimer(timer);
      resolve(o);
    };
    const timer = setTimer(() => finish({ kind: 'unreadable', error: 'Storage took too long to answer.' }), timeoutMs);
    let p: Promise<unknown | null>;
    try {
      p = load();
    } catch (err) {
      p = Promise.reject(err);
    }
    p.then(
      (raw) => finish({ kind: 'loaded', raw }),
      (err: unknown) => finish({ kind: 'unreadable', error: err instanceof Error ? err.message : String(err) }),
    );
  });
}
