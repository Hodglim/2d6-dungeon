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
 * A throwing weapon or potion bomb thrown this fight, oldest first. `faces`: the weapon's D66 (red,
 * blue), or the bomb's damage dice (none for a bomb without dice). A weapon keeps the sheet's item
 * text and list so a recovered one goes back as it was; `deflected` (an Interrupt matched: the
 * weapon is lost) and `recovered` (after the fight: true back in the pack, false lost, absent not
 * rolled yet). A bomb keeps its round effects.
 */
export interface ThrowLog {
  kind: 'weapon' | 'bomb';
  name: string;
  foeId: string;
  round: number;
  faces: number[];
  damage: number;
  /** The Interrupts that came off a weapon's damage, by name. */
  interrupts?: string[];
  item?: string;
  list?: 'largeItems' | 'smallItems';
  deflected?: boolean;
  recovered?: boolean;
  noAttack?: boolean;
  noMovementInterrupts?: boolean;
}

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
  /** Throwing weapons and potion bombs thrown (absent in fights saved before throwing existed). */
  throws?: ThrowLog[];
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
  ...(e.throws ? { throws: e.throws.map((t) => ({ ...t })) } : {}),
});

/** Log a throw (its damage is applied separately, with setFoeHp). */
export const logThrow = (e: Encounter, t: ThrowLog): Encounter => ({ ...copy(e), throws: [...(e.throws ?? []), t] });

/** Record whether thrown weapon `i` came back after the fight. */
export function setRecovered(e: Encounter, i: number, recovered: boolean): Encounter {
  const c = copy(e);
  return { ...c, throws: (c.throws ?? []).map((t, j) => (j === i ? { ...t, recovered } : t)) };
}

/** This round's bomb effect on a foe (a Flash-style bomb stops its attack; a Smoke-style one its movement Interrupts). */
export function bombEffect(e: Encounter, foeId: string, key: 'noAttack' | 'noMovementInterrupts'): string | null {
  const t = (e.throws ?? []).find((x) => x.kind === 'bomb' && x.foeId === foeId && x.round === e.round && x[key]);
  return t ? t.name : null;
}

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
/** "Defeated Rat ×2, Troll.": the foes brought to 0 HP, by name in first-seen order, or null when there are none. */
export function defeatedLine(e: Encounter): string | null {
  const counts = new Map<string, number>();
  for (const f of e.foes) if (f.hp <= 0) counts.set(f.name, (counts.get(f.name) ?? 0) + 1);
  if (!counts.size) return null;
  return `Defeated ${[...counts].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name)).join(', ')}.`;
}
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
  if (raw.throws !== undefined) {
    if (!Array.isArray(raw.throws)) return fail('throws');
    for (let i = 0; i < raw.throws.length; i++) {
      const t = raw.throws[i];
      const at = `throws[${i}]`;
      if (!isObj(t)) return fail(at);
      if (t.kind !== 'weapon' && t.kind !== 'bomb') return fail(`${at} kind`);
      if (!isStr(t.name)) return fail(`${at} name`);
      if (!isStr(t.foeId) || !ids.has(t.foeId)) return fail(`${at} foeId`);
      if (!isInt(t.round) || t.round < 1) return fail(`${at} round`);
      if (!Array.isArray(t.faces) || !t.faces.every((d) => isInt(d) && d >= 1 && d <= 6)) return fail(`${at} faces`);
      if (!isInt(t.damage) || t.damage < 0) return fail(`${at} damage`);
      if (t.interrupts !== undefined && !(Array.isArray(t.interrupts) && t.interrupts.every(isStr))) return fail(`${at} interrupts`);
      if (t.item !== undefined && !isStr(t.item)) return fail(`${at} item`);
      if (t.list !== undefined && t.list !== 'largeItems' && t.list !== 'smallItems') return fail(`${at} list`);
      const flag = ['deflected', 'recovered', 'noAttack', 'noMovementInterrupts'].find((k) => t[k] !== undefined && typeof t[k] !== 'boolean');
      if (flag) return fail(`${at} ${flag}`);
    }
  }
  return null;
}
