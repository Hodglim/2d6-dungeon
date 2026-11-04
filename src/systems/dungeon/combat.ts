/** The encounter model and combat-tracking rules: pure, no UI. */
import type { CreatureStats } from './tables';

export interface Foe {
  id: string;
  name: string;
  hp: number;
  startHp: number;
  xp: number | null;
  shift: number | null;
  treasure: string | null; // null = no stats in the table file
  defeatedInRound: number | null;
}
export interface PendingRoll { code: string; modifier: number }
/** A creature-table roll already resolved: kept so its result (and any text) stays on show. */
export interface RolledRoll { code: string; modifier: number; die: number; total: number }
/**
 * `rolled`: resolved creature-table rolls, oldest first. `xpAwarded`: the XP already added to the
 * hero from this fight's Victory panel (on the undo timeline with the rest of the encounter).
 * `turn`: whose attack it is, 'hero' (the player's, with or without a hero) or a foe's id.
 */
export interface Encounter {
  version: 1;
  round: number;
  foes: Foe[];
  pending: PendingRoll[];
  rolled: RolledRoll[];
  xpAwarded: number;
  turn: 'hero' | string;
}

export const newEncounter = (): Encounter => ({ version: 1, round: 1, foes: [], pending: [], rolled: [], xpAwarded: 0, turn: 'hero' });

/**
 * A copy with fresh arrays, so a change never touches the original. Pending and rolled entries
 * are never edited in place, so they keep their identity (the pane keys on them).
 */
const copy = (e: Encounter): Encounter => ({
  ...e,
  foes: e.foes.map((f) => ({ ...f })),
  pending: [...e.pending],
  rolled: [...e.rolled],
});

export function addFoe(e: Encounter, name: string, stats: CreatureStats | null, startHp: number, id: string): Encounter {
  const foe: Foe = {
    id, name, hp: startHp, startHp,
    xp: stats ? stats.xp : null,
    shift: stats ? stats.shift : null,
    treasure: stats ? stats.treasure : null,
    defeatedInRound: null,
  };
  const c = copy(e);
  return { ...c, foes: [...c.foes, foe] };
}

export function setFoeHp(e: Encounter, id: string, hp: number): Encounter {
  const c = copy(e);
  return {
    ...c,
    foes: c.foes.map((f) => (f.id !== id ? f : { ...f, hp, defeatedInRound: hp > 0 ? null : (f.defeatedInRound ?? e.round) })),
  };
}

/** A new round: the Fatigue Die goes up and the hero (who has the initiative) attacks first. */
export const nextRound = (e: Encounter): Encounter => ({ ...copy(e), round: e.round + 1, turn: 'hero' });

/** The foe whose turn it is, or null on the hero's turn. */
export const turnFoe = (e: Encounter): Foe | null => (e.turn === 'hero' ? null : (e.foes.find((f) => f.id === e.turn) ?? null));

/**
 * Move play on: the hero, then each foe still standing in list order, then a new round. A foe
 * defeated during its own turn is simply passed over.
 */
export function nextTurn(e: Encounter): Encounter {
  const at = e.turn === 'hero' ? -1 : e.foes.findIndex((f) => f.id === e.turn);
  const next = e.turn === 'hero' || at >= 0 ? e.foes.slice(at + 1).find((f) => f.hp > 0) : undefined;
  return next ? { ...copy(e), turn: next.id } : nextRound(e);
}

export function queueRoll(e: Encounter, r: PendingRoll): Encounter {
  const c = copy(e);
  return { ...c, pending: [...c.pending, { ...r }] };
}

export function resolveRoll(e: Encounter, index: number): Encounter {
  const c = copy(e);
  return { ...c, pending: c.pending.filter((_, i) => i !== index) };
}

/** Record a resolved creature-table roll (newest last). */
export function recordRoll(e: Encounter, r: RolledRoll): Encounter {
  const c = copy(e);
  return { ...c, rolled: [...c.rolled, { ...r }] };
}

/** Clear one resolved roll's result from view. */
export function dropRolled(e: Encounter, index: number): Encounter {
  const c = copy(e);
  return { ...c, rolled: c.rolled.filter((_, i) => i !== index) };
}

/** Mark `n` more XP as added to the hero from this fight. */
export const awardXp = (e: Encounter, n: number): Encounter => ({ ...copy(e), xpAwarded: e.xpAwarded + n });

export const fatigueDie = (round: number): number => Math.min(round, 6);
export const fatigueShift = (round: number): number => {
  const d = fatigueDie(round);
  return d <= 3 ? 0 : d - 3;
};

export const momentumShift = (e: Encounter): number =>
  e.round === 2 && e.foes.length >= 2 && e.foes.some((f) => f.defeatedInRound === 1) ? 2 : 0;

export const allDefeated = (e: Encounter): boolean => e.foes.length > 0 && e.foes.every((f) => f.hp <= 0);
export const totalXp = (e: Encounter): number => e.foes.reduce((s, f) => s + (f.xp ?? 0), 0);
export const treasureLines = (e: Encounter): string[] =>
  e.foes.filter((f) => f.treasure).map((f) => `${f.name}: ${f.treasure}`);
export const interruptReminder = (round: number): boolean => round >= 7;

// ---- validation of a loaded encounter ----
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number => Number.isInteger(v);
const intOrNull = (v: unknown) => v === null || isInt(v);

export function encounterProblem(raw: unknown): string | null {
  if (!isObj(raw)) return 'The encounter is not a record';
  const fail = (what: string) => `The encounter is damaged: ${what}`;
  if (raw.version !== 1) return fail('version');
  if (!isInt(raw.round) || raw.round < 1) return fail('round');
  if (!Array.isArray(raw.foes)) return fail('foes');
  const ids = new Set<string>();
  for (let i = 0; i < raw.foes.length; i++) {
    const f = raw.foes[i];
    if (!isObj(f)) return fail(`foes[${i}]`);
    const s = ['id', 'name'].find((k) => !isStr(f[k]));
    if (s) return fail(`foes[${i}] ${s}`);
    if (ids.has(f.id as string)) return fail(`foes[${i}] id is a duplicate`);
    ids.add(f.id as string);
    const n = ['hp', 'startHp'].find((k) => !isInt(f[k]));
    if (n) return fail(`foes[${i}] ${n}`);
    const o = ['xp', 'shift', 'defeatedInRound'].find((k) => !intOrNull(f[k]));
    if (o) return fail(`foes[${i}] ${o}`);
    if (f.treasure !== null && !isStr(f.treasure)) return fail(`foes[${i}] treasure`);
  }
  if (!Array.isArray(raw.pending)) return fail('pending');
  for (let i = 0; i < raw.pending.length; i++) {
    const p = raw.pending[i];
    if (!isObj(p)) return fail(`pending[${i}]`);
    if (!isStr(p.code)) return fail(`pending[${i}] code`);
    if (!isInt(p.modifier)) return fail(`pending[${i}] modifier`);
  }
  if (!Array.isArray(raw.rolled)) return fail('rolled');
  for (let i = 0; i < raw.rolled.length; i++) {
    const r = raw.rolled[i];
    if (!isObj(r)) return fail(`rolled[${i}]`);
    if (!isStr(r.code)) return fail(`rolled[${i}] code`);
    const n = ['modifier', 'die', 'total'].find((k) => !isInt(r[k]));
    if (n) return fail(`rolled[${i}] ${n}`);
    if ((r.die as number) < 1 || (r.die as number) > 6) return fail(`rolled[${i}] die`);
    if ((r.total as number) < 1 || (r.total as number) > 6) return fail(`rolled[${i}] total`);
  }
  if (!isInt(raw.xpAwarded) || raw.xpAwarded < 0) return fail('xpAwarded');
  if (!isStr(raw.turn) || (raw.turn !== 'hero' && !ids.has(raw.turn))) return fail('turn');
  return null;
}
