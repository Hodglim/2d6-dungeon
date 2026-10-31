import { CURRENT_SCHEMA_VERSION } from './campaign';
import { checkInvariants } from './rules';
import type { Campaign } from './types';

/** migrations[n] upgrades a raw campaign object from schema version n to n + 1. */
export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;
export const migrations: Record<number, Migration> = {};

export type ParseResult = { ok: true; campaign: Campaign } | { ok: false; error: string };

export function serializeCampaign(c: Campaign): string {
  return JSON.stringify(c, null, 2);
}

const NOT_A_MAP = "This isn't a map file.";
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

function shapeProblem(raw: Record<string, unknown>): string | null {
  for (const k of ['id', 'name', 'systemId', 'activeMapId']) if (!isStr(raw[k])) return `missing ${k}`;
  if (!Array.isArray(raw.maps) || raw.maps.length === 0) return 'no maps';
  for (const m of raw.maps) {
    if (!isObj(m)) return 'a map is not an object';
    for (const k of ['id', 'title', 'hero', 'level', 'themeId', 'defaultDoorType']) {
      if (!isStr(m[k])) return `map missing ${k}`;
    }
    for (const k of ['width', 'height', 'seed']) if (!isNum(m[k])) return `map missing ${k}`;
    for (const k of ['rooms', 'doors', 'features']) if (!Array.isArray(m[k])) return `map missing ${k}`;
    for (const r of m.rooms as unknown[]) {
      if (!isObj(r) || !isStr(r.id) || !isStr(r.kind) || !isObj(r.label)) return 'a room is malformed';
      for (const k of ['x', 'y', 'w', 'h', 'number']) if (!isNum(r[k])) return 'a room is malformed';
    }
    for (const d of m.doors as unknown[]) {
      if (!isObj(d) || !isStr(d.id) || !isStr(d.type) || !isNum(d.x) || !isNum(d.y)) return 'a door is malformed';
      if (d.side !== 'N' && d.side !== 'W') return 'a door is malformed';
    }
    for (const f of m.features as unknown[]) {
      if (!isObj(f) || !isStr(f.id) || !isNum(f.x) || !isNum(f.y)) return 'a feature is malformed';
      if (f.kind !== 'stairs' && f.kind !== 'note') return 'a feature is malformed';
    }
    if (m.token !== null && !(isObj(m.token) && isNum(m.token.x) && isNum(m.token.y) && Array.isArray(m.token.trail))) {
      return 'the token is malformed';
    }
  }
  if (!(raw.maps as Record<string, unknown>[]).some((m) => m.id === raw.activeMapId)) return 'active map not found';
  return null;
}

export function parseCampaign(
  text: string,
  migs: Record<number, Migration> = migrations,
  current: number = CURRENT_SCHEMA_VERSION,
): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: `${NOT_A_MAP} (It is not valid JSON.)` };
  }
  if (!isObj(raw) || !isNum(raw.schemaVersion)) return { ok: false, error: NOT_A_MAP };
  if (raw.schemaVersion > current) {
    return { ok: false, error: 'This file was made by a newer version of the app. Please update and try again.' };
  }
  let obj: Record<string, unknown> = raw;
  for (let v = raw.schemaVersion; v < current; v++) {
    const migrate = migs[v];
    if (!migrate) return { ok: false, error: `Cannot upgrade this file from version ${v}.` };
    obj = { ...migrate(obj), schemaVersion: v + 1 };
  }
  const problem = shapeProblem(obj);
  if (problem) return { ok: false, error: `The map file is damaged: ${problem}.` };
  const campaign = obj as unknown as Campaign;
  for (const map of campaign.maps) {
    const broken = checkInvariants(map);
    if (broken) return { ok: false, error: `The map file is damaged: ${broken}.` };
  }
  return { ok: true, campaign };
}
