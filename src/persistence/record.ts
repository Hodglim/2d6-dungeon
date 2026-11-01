import { CURRENT_SCHEMA_VERSION } from '../core/campaign';
import type { HistoryState } from '../core/history';
import { parseHistoryState, type HeroProblem } from '../core/serialize';
import type { Campaign, DungeonMap } from '../core/types';

export const SAVE_FORMAT = 2;

/** Everything about the campaign except its map, which lives only in the history's `current`. */
export interface CampaignMeta {
  id: string;
  name: string;
  systemId: string;
}

export interface SaveRecord {
  format: number;
  savedAt: string;
  meta: CampaignMeta;
  history: HistoryState;
}

export function encodeSave(meta: CampaignMeta, history: HistoryState, now: Date = new Date()): SaveRecord {
  return { format: SAVE_FORMAT, savedAt: now.toISOString(), meta, history };
}

export type SaveDecode = { ok: true; meta: CampaignMeta; history: HistoryState } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function decodeSave(raw: unknown, heroProblem?: HeroProblem): SaveDecode {
  if (!isObj(raw)) return { ok: false, error: 'The saved game is not a valid record.' };
  const { format, meta } = raw;
  if (typeof format !== 'number' || !Number.isInteger(format) || format < 1) {
    return { ok: false, error: 'The saved game has no valid format number.' };
  }
  if (format < SAVE_FORMAT) {
    return { ok: false, error: "This save is from an older test version of the app and can't be loaded." };
  }
  if (format > SAVE_FORMAT) {
    return { ok: false, error: 'This save was written by a newer version of the app. Reload to update.' };
  }
  if (!isObj(meta) || typeof meta.id !== 'string' || typeof meta.name !== 'string' || typeof meta.systemId !== 'string') {
    return { ok: false, error: 'The saved game is missing its campaign details.' };
  }
  const parsed = parseHistoryState(raw.history, heroProblem);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    meta: { id: meta.id, name: meta.name, systemId: meta.systemId },
    history: parsed.state,
  };
}

export function campaignFrom(meta: CampaignMeta, map: DungeonMap, hero: unknown | null): Campaign {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: meta.id,
    name: meta.name,
    systemId: meta.systemId,
    maps: [map],
    activeMapId: map.id,
    hero,
  };
}

export function metaFrom(c: Campaign): CampaignMeta {
  return { id: c.id, name: c.name, systemId: c.systemId };
}
