import { CURRENT_SCHEMA_VERSION, MAX_MAP_SIZE } from './campaign';
import { checkInvariants } from './invariants';
import { HISTORY_CAP, type HistoryState } from './history';
import type { Campaign } from './types';

/** Null means the hero is valid. The game system supplies it; core never looks inside a hero. */
export type HeroProblem = (hero: unknown) => string | null;

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
const ROOM_KINDS = ['room', 'corridor', 'passage', 'entrance'];
const SIZE_CLASSES = ['normal', 'small', 'large'];

function roomOk(r: unknown): boolean {
  if (!isObj(r) || !isStr(r.id) || !ROOM_KINDS.includes(r.kind as string)) return false;
  if (!isObj(r.label) || !isStr(r.label.type) || !isBool(r.label.unique) || !isStr(r.label.narrative)) return false;
  if (r.sizeClass !== null && !SIZE_CLASSES.includes(r.sizeClass as string)) return false;
  if (r.entryDoorId !== null && !isStr(r.entryDoorId)) return false;
  return ['x', 'y', 'w', 'h', 'number'].every((k) => isInt(r[k]));
}

function doorOk(d: unknown): boolean {
  if (!isObj(d) || !isStr(d.id) || !isStr(d.type) || !isCell(d) || !isBool(d.secret)) return false;
  if (d.side !== 'N' && d.side !== 'W') return false;
  return d.lock === null || (isObj(d.lock) && isBool(d.lock.locked) && isStr(d.lock.note) && (d.lock.quality === null || isInt(d.lock.quality)));
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

/** Shape check for one map; null means OK. Does not run checkInvariants. */
export function mapProblem(m: unknown): string | null {
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
  return null;
}

function shapeProblem(raw: Record<string, unknown>, heroProblem?: HeroProblem): string | null {
  for (const k of ['id', 'name', 'systemId', 'activeMapId']) if (!isStr(raw[k])) return `missing ${k}`;
  if (!Array.isArray(raw.maps) || raw.maps.length === 0) return 'no maps';
  const seenIds = new Set<string>();
  for (const m of raw.maps) {
    const problem = mapProblem(m);
    if (problem) return problem;
    const id = (m as Record<string, unknown>).id as string;
    if (seenIds.has(id)) return 'two maps share an id';
    seenIds.add(id);
  }
  if (!seenIds.has(raw.activeMapId as string)) return 'active map not found';
  return null;
}

/** Hero must be present (null is fine); a non-null hero must pass the system's check. */
function heroFault(hero: unknown, heroProblem?: HeroProblem): string | null {
  if (hero === undefined) return 'the hero is missing';
  if (hero === null || !heroProblem) return null;
  return heroProblem(hero);
}

const HERO_DAMAGED = 'The saved hero is damaged:';

export function parseCampaign(text: string, heroProblem?: HeroProblem): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: `${NOT_A_MAP} (It is not valid JSON.)` };
  }
  if (!isObj(raw) || !isNum(raw.schemaVersion)) return { ok: false, error: NOT_A_MAP };
  if (raw.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return { ok: false, error: 'This file was made by a newer version of the app. Please update and try again.' };
  }
  if (raw.schemaVersion < CURRENT_SCHEMA_VERSION) {
    return { ok: false, error: "This file is from an older test version of the app and can't be imported." };
  }
  const problem = shapeProblem(raw);
  if (problem) return { ok: false, error: `The map file is damaged: ${problem}.` };
  const bad = heroFault(raw.hero, heroProblem);
  if (bad) return { ok: false, error: `${HERO_DAMAGED} ${bad}.` };
  const campaign = raw as unknown as Campaign;
  for (const map of campaign.maps) {
    const broken = checkInvariants(map);
    if (broken) return { ok: false, error: `The map file is damaged: ${broken}.` };
  }
  return { ok: true, campaign };
}

export type HistoryParse = { ok: true; state: HistoryState } | { ok: false; error: string };

function snapshotProblem(map: unknown): string | null {
  return mapProblem(map) ?? checkInvariants(map as Campaign['maps'][number]);
}

/** Validates a loaded History snapshot: heroes (required, null allowed), shape and invariants of every map, string labels, lengths within the cap. */
export function parseHistoryState(raw: unknown, heroProblem?: HeroProblem): HistoryParse {
  const fail = (why: string): HistoryParse => ({ ok: false, error: `The saved history is damaged: ${why}.` });
  if (!isObj(raw)) return fail('it is not an object');
  const bad = snapshotProblem(raw.current);
  if (bad) return fail(`current map: ${bad}`);
  const heroBad = heroFault(raw.hero, heroProblem);
  if (heroBad) return { ok: false, error: `${HERO_DAMAGED} ${heroBad}.` };
  for (const key of ['past', 'future'] as const) {
    const list = raw[key];
    if (!Array.isArray(list)) return fail(`${key} is missing`);
    if (list.length > HISTORY_CAP) return fail(`${key} is too long`);
    for (let i = 0; i < list.length; i++) {
      const e: unknown = list[i];
      if (!isObj(e) || !isStr(e.label)) return fail(`${key}[${i}] has no label`);
      const problem = snapshotProblem(e.map);
      if (problem) return fail(`${key}[${i}]: ${problem}`);
      const eHero = heroFault(e.hero, heroProblem);
      if (eHero) return { ok: false, error: `${HERO_DAMAGED} ${key}[${i}]: ${eHero}.` };
    }
  }
  return { ok: true, state: raw as unknown as HistoryState };
}
