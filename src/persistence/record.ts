import { CURRENT_SCHEMA_VERSION } from '../core/campaign';
import type { HistoryState } from '../core/history';
import { checkInvariants } from '../core/invariants';
import { mapProblem, parseHistoryState, type EncounterProblem, type HeroProblem } from '../core/serialize';
import type { Campaign, DungeonMap } from '../core/types';

export const SAVE_FORMAT = 4;

/** Everything about the campaign except the active map, which lives only in the history's `current`. */
export interface CampaignMeta {
  id: string;
  name: string;
  systemId: string;
  /** Maps of the levels above the active one, oldest first, read-only. */
  earlierLevels: DungeonMap[];
  /** Set when the hero's death was confirmed: the app opens to Game Over. Kept outside History, so no Undo. */
  gameOver: GameOver | null;
}

export interface GameOver {
  heroName: string;
  heroLevel: number;
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

export function decodeSave(raw: unknown, heroProblem?: HeroProblem, encounterProblem?: EncounterProblem): SaveDecode {
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
  if (!Array.isArray(meta.earlierLevels)) return { ok: false, error: 'The saved game is missing its earlier levels.' };
  const earlierLevels = meta.earlierLevels as DungeonMap[];
  for (let i = 0; i < earlierLevels.length; i++) {
    const bad = mapProblem(earlierLevels[i]) ?? checkInvariants(earlierLevels[i]!);
    if (bad) return { ok: false, error: `The saved game is damaged: earlier level ${i + 1}: ${bad}.` };
  }
  // A meta without gameOver reads as a game still going (meta lives outside History).
  const go = meta.gameOver;
  let gameOver: GameOver | null = null;
  if (go !== undefined && go !== null) {
    if (!isObj(go) || typeof go.heroName !== 'string' || typeof go.heroLevel !== 'number' || !Number.isInteger(go.heroLevel)) {
      return { ok: false, error: 'The saved game is damaged: its game-over record is not valid.' };
    }
    gameOver = { heroName: go.heroName, heroLevel: go.heroLevel };
  }
  const parsed = parseHistoryState(raw.history, heroProblem, encounterProblem);
  if (!parsed.ok) return parsed;
  return {
    ok: true,
    meta: { id: meta.id, name: meta.name, systemId: meta.systemId, earlierLevels, gameOver },
    history: parsed.state,
  };
}

export function campaignFrom(meta: CampaignMeta, map: DungeonMap, hero: unknown | null, encounter: unknown | null): Campaign {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: meta.id,
    name: meta.name,
    systemId: meta.systemId,
    maps: [...meta.earlierLevels, map],
    activeMapId: map.id,
    hero,
    encounter,
  };
}

export function metaFrom(c: Campaign): CampaignMeta {
  return { id: c.id, name: c.name, systemId: c.systemId, earlierLevels: c.maps.filter((m) => m.id !== c.activeMapId), gameOver: null };
}
