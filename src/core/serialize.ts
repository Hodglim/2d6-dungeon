import { CURRENT_SCHEMA_VERSION, MAX_MAP_SIZE } from './campaign';
import { checkInvariants } from './invariants';
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

const isInt = (v: unknown): v is number => Number.isInteger(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isCell = (v: unknown): boolean => isObj(v) && isInt(v.x) && isInt(v.y);
const ROOM_KINDS = ['room', 'passage', 'entrance'];

function roomOk(r: unknown): boolean {
  if (!isObj(r) || !isStr(r.id) || !ROOM_KINDS.includes(r.kind as string)) return false;
  if (!isObj(r.label) || !isStr(r.label.type) || !isBool(r.label.unique) || !isStr(r.label.narrative)) return false;
  if (r.entryDoorId !== null && !isStr(r.entryDoorId)) return false;
  return ['x', 'y', 'w', 'h', 'number'].every((k) => isInt(r[k]));
}

function doorOk(d: unknown): boolean {
  if (!isObj(d) || !isStr(d.id) || !isStr(d.type) || !isCell(d) || !isBool(d.secret)) return false;
  if (d.side !== 'N' && d.side !== 'W') return false;
  return d.lock === null || (isObj(d.lock) && isBool(d.lock.locked) && isStr(d.lock.note));
}

function featureOk(f: unknown): boolean {
  if (!isObj(f) || !isStr(f.id) || !isCell(f)) return false;
  if (f.kind === 'note') return isStr(f.text);
  if (f.kind !== 'stairs') return false;
  return (f.dir === 'up' || f.dir === 'down') && (f.linkedMapId === undefined || isStr(f.linkedMapId));
}

function tokenOk(t: unknown): boolean {
  return t === null || (isObj(t) && isCell(t) && Array.isArray(t.trail) && t.trail.every(isCell));
}

function shapeProblem(raw: Record<string, unknown>): string | null {
  for (const k of ['id', 'name', 'systemId', 'activeMapId']) if (!isStr(raw[k])) return `missing ${k}`;
  if (!Array.isArray(raw.maps) || raw.maps.length === 0) return 'no maps';
  const seenIds = new Set<string>();
  for (const m of raw.maps) {
    if (!isObj(m)) return 'a map is not an object';
    for (const k of ['id', 'title', 'hero', 'level', 'themeId', 'defaultDoorType']) {
      if (!isStr(m[k])) return `map missing ${k}`;
    }
    if (!isNum(m.seed)) return 'map missing seed';
    for (const k of ['width', 'height']) {
      if (!isNum(m[k])) return `map missing ${k}`;
      if (!isInt(m[k]) || (m[k] as number) < 1 || (m[k] as number) > MAX_MAP_SIZE) return 'a map has an invalid size';
    }
    for (const k of ['rooms', 'doors', 'features']) if (!Array.isArray(m[k])) return `map missing ${k}`;
    if (!(m.rooms as unknown[]).every(roomOk)) return 'a room is malformed';
    if (!(m.doors as unknown[]).every(doorOk)) return 'a door is malformed';
    if (!(m.features as unknown[]).every(featureOk)) return 'a feature is malformed';
    if (!tokenOk(m.token)) return 'the token is malformed';
    if (seenIds.has(m.id as string)) return 'two maps share an id';
    seenIds.add(m.id as string);
  }
  if (!seenIds.has(raw.activeMapId as string)) return 'active map not found';
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
    const cannotUpgrade = { ok: false, error: `Cannot upgrade this file from version ${v}.` } as const;
    const migrate = migs[v];
    if (!migrate) return cannotUpgrade;
    try {
      const next: unknown = migrate(obj);
      if (!isObj(next)) return cannotUpgrade;
      obj = { ...next, schemaVersion: v + 1 };
    } catch {
      return cannotUpgrade;
    }
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
