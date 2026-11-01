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
