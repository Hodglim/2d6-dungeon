/** Encounter edits run through History. Pure apart from the History argument. */
import { setPlay, updateRoom } from '../../core/commands';
import { roomAt } from '../../core/query';
import type { ExecResult, History } from '../../core/history';
import { addFoe, defeatedLine, defeatedXp, dropRolled, logThrow, newEncounter, queueRoll, recordRoll, resolveRoll, setFoeHp, setRecovered, type Encounter, type ThrowLog } from '../../systems/dungeon/combat';
import { bombDamage, recovers, throwDamage, type CarriedWeapon, type PotionBomb } from '../../systems/dungeon/throwing';
import { parseDamage, rollTotal } from '../diceRoller';
import { findCreature, rollCreatureTable, type CreatureRoll } from '../../systems/dungeon/creatures';
import type { Hero } from '../../systems/dungeon/hero';
import { addXp } from '../hero/heroActions';
import type { CreatureInterrupt, DungeonTables } from '../../systems/dungeon/tables';

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
 * Each creature's XP goes to the hero the moment it falls (so a level up can come mid-fight), and
 * comes back off if it is brought back above 0 HP. `xpAwarded` keeps what has gone in so far.
 */
function withDefeatXp(e: Encounter, hero: Hero): { e: Encounter; hero: Hero } {
  const d = defeatedXp(e) - e.xpAwarded;
  return d === 0 ? { e, hero } : { e: { ...e, xpAwarded: e.xpAwarded + d }, hero: addXp(hero, d) };
}

/**
 * Run an encounter change through History as one step. With `hero`, the same step sets the hero
 * too; otherwise the hero is left as it is, apart from the XP of creatures defeated or revived.
 * A foe-HP tap (mergeKey "foe-hp:<id>") is labelled from the encounter as it was before the whole
 * run of taps, and a run that nets out to nothing leaves no step behind.
 */
export function commitEncounter(
  history: History,
  next: Encounter | null,
  label: string,
  opts: { mergeKey?: string; hero?: Hero } = {},
): ExecResult {
  if (import.meta.env?.DEV) structuredClone({ next, hero: opts.hero }); // reactive proxies fail here, not at save time
  let hero = (opts.hero ?? history.hero) as Hero | null;
  if (next && hero) ({ e: next, hero } = withDefeatXp(next, hero));
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
  const gained = hero && base.hero ? hero.xp - (base.hero as Hero).xp : 0;
  if (gained && next && defeatedXp(next) !== defeatedXp((base.encounter as Encounter | null) ?? next)) text += `, XP ${signed(gained)}`;
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

/**
 * The Victory panel's Done: the fight closes and the foes defeated are noted on a new line of the
 * narrative of the room the hero token stands in (none without a token in a room), as one step.
 * Any defeated XP not in yet (a fight saved before XP came per creature) goes to the hero too.
 */
export function winFight(history: History): ExecResult {
  const e = history.encounter as Encounter | null;
  const line = e ? defeatedLine(e) : null;
  const map = history.map;
  const r = map.token ? roomAt(map, map.token) : undefined;
  const h = history.hero as Hero | null;
  const hero = e && h ? withDefeatXp(e, h).hero : h;
  const cmd = setPlay({ hero, encounter: null }, 'Win the fight');
  // The hero's room gets the defeated foes in its narrative and one more won fight (signs of battle on the map).
  if (r) {
    const narrative = !line ? r.label.narrative : r.label.narrative ? `${r.label.narrative}\n${line}` : line;
    cmd.apply = updateRoom(r, { ...r, label: { ...r.label, narrative }, battles: (r.battles ?? 0) + 1 }).apply;
  }
  return history.execute(cmd);
}

// ---- throwing weapons and potion bombs ----

const minusHp = (e: Encounter, foeId: string, damage: number): Encounter => {
  const f = e.foes.find((x) => x.id === foeId);
  return f ? setFoeHp(e, foeId, Math.max(0, f.hp - damage)) : e;
};

/**
 * Throw a carried weapon at foe `foeId`: roll a D66 against its Interrupts, take the weapon out of
 * the pack (a recovery roll after the fight may put it back), log the throw and take the damage
 * off, all as one step.
 */
export function throwWeapon(history: History, c: CarriedWeapon, foeId: string, interrupts: readonly CreatureInterrupt[], faces: number[]): ExecResult {
  const e = history.encounter as Encounter | null;
  const h = history.hero as Hero | null;
  if (!e || !h || !e.foes.some((f) => f.id === foeId)) return { ok: false, reason: 'No fight or no hero' };
  if (h[c.list][c.index] !== c.item) return { ok: false, reason: `${c.item} is no longer in the pack` };
  const r = throwDamage(faces, c.weapon.damage, c.modifier, interrupts, e.round);
  const log: ThrowLog = {
    kind: 'weapon', name: c.weapon.name, foeId, round: e.round, faces, damage: r.damage,
    interrupts: r.hits.map((i) => interrupts[i]!.name), item: c.item, list: c.list, deflected: r.deflected,
  };
  const hero = { ...h, [c.list]: h[c.list].filter((_, i) => i !== c.index) };
  return commitEncounter(history, minusHp(logThrow(e, log), foeId, r.damage), `Throw ${c.weapon.name}`, { hero });
}

/** Throw a carried potion bomb at foe `foeId`: used up, its damage (if any) rolled and taken off, as one step. */
export function throwBomb(history: History, c: { bomb: PotionBomb; index: number }, foeId: string, dungeonLevel: number, faces: number[]): ExecResult {
  const e = history.encounter as Encounter | null;
  const h = history.hero as Hero | null;
  if (!e || !h || !e.foes.some((f) => f.id === foeId)) return { ok: false, reason: 'No fight or no hero' };
  if (!h.potions[c.index]?.name.toLowerCase().includes(c.bomb.name.toLowerCase())) return { ok: false, reason: `${c.bomb.name} is no longer in the pack` };
  const dice = c.bomb.damage ? parseDamage(c.bomb.damage) : null;
  const rolled = dice ? Number(rollTotal(dice.dice, faces, dice.modifier)) : null;
  const damage = bombDamage(c.bomb, rolled, dungeonLevel);
  const log: ThrowLog = {
    kind: 'bomb', name: c.bomb.name, foeId, round: e.round, faces: dice ? faces : [], damage,
    ...(c.bomb.noAttack ? { noAttack: true } : {}),
    ...(c.bomb.noMovementInterrupts ? { noMovementInterrupts: true } : {}),
  };
  const hero = { ...h, potions: h.potions.filter((_, i) => i !== c.index) };
  return commitEncounter(history, minusHp(logThrow(e, log), foeId, damage), `Throw ${c.bomb.name}`, { hero });
}

/** After the fight: thrown weapon `index` comes back on a D6 `face` of 4 to 6 (back into its list as it was). */
export function recoverThrown(history: History, index: number, face: number): ExecResult {
  const e = history.encounter as Encounter | null;
  const h = history.hero as Hero | null;
  const t = e?.throws?.[index];
  if (!e || !h || !t || t.kind !== 'weapon') return { ok: false, reason: 'No thrown weapon' };
  if (t.deflected || t.recovered !== undefined) return { ok: false, reason: `${t.name} has already been dealt with` };
  const back = recovers(face);
  const hero = back && t.item && t.list ? { ...h, [t.list]: [...h[t.list], t.item] } : h;
  return commitEncounter(history, setRecovered(e, index, back), back ? `Recover ${t.name}` : `Lose ${t.name}`, { hero });
}
