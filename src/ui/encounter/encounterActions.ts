/** Encounter edits run through History. Pure apart from the History argument. */
import { setPlay } from '../../core/commands';
import type { ExecResult, History } from '../../core/history';
import { addFoe, awardXp, dropRolled, newEncounter, queueRoll, recordRoll, resolveRoll, totalXp, type Encounter } from '../../systems/dungeon/combat';
import { findCreature, rollCreatureTable, type CreatureRoll } from '../../systems/dungeon/creatures';
import type { Hero } from '../../systems/dungeon/hero';
import { addXp } from '../hero/heroActions';
import type { DungeonTables } from '../../systems/dungeon/tables';

/** What the encounter-text buttons do (given by the shell, which owns the encounter pane). */
export interface EncounterHooks {
  onroll: (code: string, modifier: number) => void;
  onfight: (name: string) => void;
  /** A reference-table code: show that table (with the modifier) in the Tables pane. */
  onopentable: (code: string, modifier: number) => void;
}

/**
 * Hooks for encounter text on a room that isn't placed yet (the room-type result): Roll and Fight
 * place the room first, and do nothing if it couldn't be placed. A fight is saved at once, but an
 * unplaced room lives only in memory, so a reload would otherwise keep the fight and lose the room.
 * Opening a table saves nothing and leaves the room as it is.
 */
export function placingFirst(hooks: EncounterHooks, place: () => boolean): EncounterHooks {
  return {
    onroll: (code, modifier) => {
      if (place()) hooks.onroll(code, modifier);
    },
    onfight: (name) => {
      if (place()) hooks.onfight(name);
    },
    onopentable: hooks.onopentable,
  };
}

const FOE_HP = 'foe-hp:';
const signed = (d: number) => `${d < 0 ? '−' : '+'}${Math.abs(d)}`;
/** "PRAC1 −1", or just "PRAC1" with no modifier. */
export const rollName = (code: string, modifier: number): string => (modifier === 0 ? code : `${code} ${signed(modifier)}`);

/** "Guard HP −5": the change to one foe's HP between two encounters, or null when there is none. */
function foeHpLabel(id: string, before: Encounter | null, after: Encounter | null): string | null {
  const a = before?.foes.find((f) => f.id === id);
  const b = after?.foes.find((f) => f.id === id);
  if (!a || !b || a.hp === b.hp) return null;
  return `${b.name} HP ${signed(b.hp - a.hp)}`;
}

/**
 * Run an encounter change through History as one step. With `hero`, the same step sets the hero
 * too; otherwise the hero is left as it is. A foe-HP tap (mergeKey "foe-hp:<id>") is labelled from
 * the encounter as it was before the whole run of taps, and a run that nets out to nothing leaves
 * no step behind.
 */
export function commitEncounter(
  history: History,
  next: Encounter | null,
  label: string,
  opts: { mergeKey?: string; hero?: Hero } = {},
): ExecResult {
  if (import.meta.env?.DEV) structuredClone({ next, hero: opts.hero }); // reactive proxies fail here, not at save time
  const hero = opts.hero ?? history.hero;
  const merging = opts.mergeKey !== undefined && history.canMerge(opts.mergeKey);
  const base = merging ? { hero: history.heroBeforeLast, encounter: history.encounterBeforeLast } : { hero: history.hero, encounter: history.encounter };
  if (merging && JSON.stringify(next) === JSON.stringify(base.encounter) && JSON.stringify(hero) === JSON.stringify(base.hero)) {
    history.dropLast();
    return { ok: true };
  }
  let text = label;
  if (opts.mergeKey?.startsWith(FOE_HP)) {
    text = foeHpLabel(opts.mergeKey.slice(FOE_HP.length), base.encounter as Encounter | null, next) ?? label;
  }
  return history.execute(setPlay({ hero, encounter: next }, text), { mergeKey: opts.mergeKey });
}

/** Add a foe for each name to `e`: stats from the table file, or HP from askHp (skipped on null). */
function addNamed(
  e: Encounter,
  tables: DungeonTables | null,
  names: string[],
  newId: () => string,
  askHp: (name: string) => number | null,
): { e: Encounter; added: string[] } {
  const added: string[] = [];
  for (const raw of names) {
    const found = findCreature(tables, raw);
    if (found) {
      e = addFoe(e, found.name, found.stats, found.stats.hp, newId());
      added.push(found.name);
      continue;
    }
    const name = raw.trim();
    if (!name) continue;
    const hp = askHp(name);
    if (hp === null) continue;
    e = addFoe(e, name, null, hp, newId());
    added.push(name);
  }
  return { e, added };
}

/**
 * Start an encounter (if none is open) and add a foe for each name, as one undo step. A name found
 * in the table file's creatures takes its stats from there; any other name asks for its starting
 * HP and is skipped when that returns null.
 */
export function startOrJoin(
  history: History,
  tables: DungeonTables | null,
  names: string[],
  newId: () => string,
  askHp: (name: string) => number | null,
): ExecResult {
  const open = history.encounter as Encounter | null;
  const { e, added } = addNamed(open ?? newEncounter(), tables, names, newId, askHp);
  if (added.length === 0) return { ok: true };
  return commitEncounter(history, e, open ? `Add ${added.join(', ')}` : 'Start encounter');
}

/** The "Roll on CODE ±n" button: queue a creature-table roll, starting an encounter if none is open. One step. */
export function queueCreatureRoll(history: History, code: string, modifier: number): ExecResult {
  const open = history.encounter as Encounter | null;
  return commitEncounter(history, queueRoll(open ?? newEncounter(), { code, modifier }), `Roll on ${rollName(code, modifier)}`);
}

/** The × on an unrolled creature-table roll. */
export function dropPendingRoll(history: History, index: number): ExecResult {
  const e = history.encounter as Encounter | null;
  const p = e?.pending[index];
  if (!e || !p) return { ok: false, reason: 'That roll is no longer waiting' };
  return commitEncounter(history, resolveRoll(e, index), `Remove roll on ${rollName(p.code, p.modifier)}`);
}

/**
 * Resolve `pending[index]` with a raw die (1–6): the modifier is added and the total clamped to
 * 1..6. A creatures entry adds those foes (askHp for any with no stats; null skips that one), a
 * text entry adds none; either way the pending roll moves to `rolled` (so its result stays on
 * show), all in one undo step.
 */
export function applyCreatureRoll(
  history: History,
  tables: DungeonTables,
  index: number,
  die: number,
  newId: () => string,
  askHp: (name: string) => number | null,
): { ok: true; roll: CreatureRoll } | { ok: false; reason: string } {
  const e = history.encounter as Encounter | null;
  const p = e?.pending[index];
  if (!e || !p) return { ok: false, reason: 'That roll is no longer waiting' };
  if (!Number.isInteger(die) || die < 1 || die > 6) return { ok: false, reason: 'Type a number from 1 to 6.' };
  const roll = rollCreatureTable(tables, p.code, die, p.modifier);
  if (!roll) return { ok: false, reason: `Your table file has no table ${p.code}` };
  const resolved = recordRoll(resolveRoll(e, index), { code: p.code, modifier: p.modifier, die, total: roll.total });
  const { e: next, added } =
    'creatures' in roll.entry ? addNamed(resolved, tables, roll.entry.creatures, newId, askHp) : { e: resolved, added: [] };
  const label = `${rollName(p.code, p.modifier)}: ${added.length ? added.join(', ') : 'no creatures'}`;
  const res = commitEncounter(history, next, label);
  return res.ok ? { ok: true, roll } : res;
}

/** The × on a creature-table roll's result: clears it from the encounter, as an undoable step. */
export function dismissRolled(history: History, index: number): ExecResult {
  const e = history.encounter as Encounter | null;
  const r = e?.rolled[index];
  if (!e || !r) return { ok: false, reason: 'That roll result is already gone' };
  return commitEncounter(history, dropRolled(e, index), `Clear ${rollName(r.code, r.modifier)} result`);
}

/** XP from the fight not yet added to the hero (0 when it all has been, or there is none). */
export const xpToAward = (e: Encounter): number => Math.max(0, totalXp(e) - e.xpAwarded);

/** The Victory panel's Add XP: the hero's XP and the encounter's record of it change in one step. */
export function awardVictoryXp(history: History): ExecResult {
  const e = history.encounter as Encounter | null;
  const h = history.hero as Hero | null;
  if (!e || !h) return { ok: false, reason: 'No fight or no hero' };
  const n = xpToAward(e);
  if (n <= 0) return { ok: false, reason: 'That XP has already been added' };
  return commitEncounter(history, awardXp(e, n), `XP +${n}`, { hero: addXp(h, n) });
}
