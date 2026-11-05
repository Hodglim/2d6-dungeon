/** The player's own dungeon table file: types and validation. The app ships no table content. */

import { dungeonSystem } from './index';
import { referenceProblem, type RefTable } from './referenceTables';
import type { PotionBomb, ThrowingWeapon } from './throwing';

export const TABLE_FILE_FORMAT = 1;
export const MAX_TABLE_FILE_BYTES = 2_000_000;

/** Die faces 1-6, in printed order; primary (red) first. */
export type Dice = number[];

export interface LevelRow {
  level: number;
  title: string;
  manoeuvres: number;
  maxManoeuvreLevel: number;
  xpToLevelUp: number | null;
  shift: number;
  discipline: number;
  precision: number;
  hpBaseline: number;
}

export interface Limits {
  potions: number;
  scrolls: number;
  largeItems: number;
  armour: number;
}

export type DoorId = 'archway' | 'wooden' | 'metal' | 'reinforced' | 'curtain' | 'portcullis' | 'stoneSlab';
export type ExitSpec = { door: DoorId; locked?: boolean } | 'random';
export interface RoomEntry { type: string; description: string; encounter: string; exit: ExitSpec; unique: boolean }
/** Small rooms always have archway exits, so there is no exit column. */
export interface SmallRoomEntry { type: string; description: string; unique: boolean }
export interface LevelTables {
  level: number;
  name: string;
  /** Key into exitTables, e.g. "EXT1". */
  exitTable: string;
  /** Keys "11".."66". */
  rooms: Record<string, RoomEntry>;
  /** Keys "2".."12". */
  smallRooms: Record<string, SmallRoomEntry>;
  /** Keys "2".."12". */
  largeRooms: Record<string, RoomEntry>;
}

export type CreatureTableEntry = { creatures: string[] } | { text: string };
/** One attack off a creature card: hit when the attack dice (after shifting) read `dice`, red then blue. */
export interface CreatureManoeuvre { name: string; dice: Dice; damage: string }
/**
 * One Interrupt off a creature card: when your successful attack's `side` die (red for primary,
 * blue for secondary) shows one of `dice`, take `modifier` (0 or less) off your damage. `movement`:
 * it moves the creature or an item, so it stops counting from round 7.
 */
export interface CreatureInterrupt {
  name: string;
  side: 'primary' | 'secondary';
  dice: number[];
  modifier: number;
  effect?: string;
  movement?: boolean;
}
export interface CreatureStats {
  level: number;
  hp: number;
  xp: number;
  shift: number;
  treasure: string;
  /** The card's combat details (optional): its attacks, Interrupts and Mishap/Prime results. */
  manoeuvres?: CreatureManoeuvre[];
  interrupts?: CreatureInterrupt[];
  mishap?: string;
  prime?: string;
}

export interface DungeonTables {
  format: 1;
  systemId: 'dungeon';
  name: string;
  tables: {
    starting: {
      level: number; xp: number; shift: number; discipline: number; precision: number; hp: number;
      rations: number; potions: { name: string; effect: string }[]; kit: string[];
    };
    startingArmour: { name: string; dice: Dice; modifier: string }[];
    startingScrolls: { name: string; effect: string; orbit: string; dispelDoubles: string; effectModifier: string }[];
    weapons: { name: string; manoeuvres: { level: number; name: string; dice: Dice; damage: string }[] }[];
    levels: LevelRow[];
    gods: string[];
    conditions: {
      bloodied: { label: string; boxes: number };
      soaked: { label: string; boxes: number };
      fever: { label: string; effect: string };
      pneumonia: { label: string; effect: string };
    };
    favourBoxes: number;
    limits: Limits;
    /** Room tables per dungeon level (optional, so older files still load). Not the hero `levels` above. */
    dungeonLevels?: LevelTables[];
    /** Exit Type tables, each keyed "11".."66". */
    exitTables?: Record<string, Record<string, Exclude<ExitSpec, 'random'>>>;
    /** Creature tables, each keyed "1".."6" (optional). */
    creatureTables?: Record<string, Record<string, CreatureTableEntry>>;
    /** Creature stats keyed by printed name (optional). */
    creatures?: Record<string, CreatureStats>;
    /** Printed tables for the Tables pane, keyed by table id (optional). Display and rolling only. */
    referenceTables?: Record<string, RefTable>;
    /** Throwing weapons and potion bombs the encounter pane can throw (optional). */
    throwingWeapons?: ThrowingWeapon[];
    potionBombs?: PotionBomb[];
  };
}

export type TablesParse = { ok: true; tables: DungeonTables } | { ok: false; error: string };

const NOT_A_TABLE_FILE = "This isn't a 2D6 Dungeon table file";
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isCount = (v: unknown): v is number => isInt(v) && v >= 0;
const isPositive = (v: unknown): v is number => isInt(v) && v >= 1;

/** A check returns null when fine, or a place such as "Weapons[1] manoeuvre 3 dice". */
type Check = (v: unknown) => string | null;

const field = (o: Record<string, unknown>, at: string, keys: string[], ok: (v: unknown) => boolean): string | null => {
  for (const k of keys) if (!ok(o[k])) return `${at} ${k}`;
  return null;
};
/** Like `field`, for names that must not be left blank (as in the blank template). */
const named = (o: Record<string, unknown>, at: string, keys: string[]): string | null => {
  for (const k of keys) {
    if (!isStr(o[k])) return `${at} ${k}`;
    if ((o[k] as string).trim() === '') return `${at} ${k} (empty)`;
  }
  return null;
};
/** A list of names: each a string, none blank. */
const strsAt = (name: string, v: unknown): string | null => {
  if (!Array.isArray(v)) return name;
  const i = v.findIndex((x) => !isStr(x));
  if (i >= 0) return `${name}[${i}]`;
  const j = v.findIndex((x) => (x as string).trim() === '');
  return j >= 0 ? `${name}[${j}] (empty)` : null;
};
const rows = (name: string, v: unknown, nonEmpty: boolean, each: (r: Record<string, unknown>, at: string) => string | null): string | null => {
  if (!Array.isArray(v)) return name;
  if (nonEmpty && v.length === 0) return `${name} has no entries`;
  for (let i = 0; i < v.length; i++) {
    const at = `${name}[${i}]`;
    if (!isObj(v[i])) return at;
    const p = each(v[i] as Record<string, unknown>, at);
    if (p) return p;
  }
  return null;
};
const diceAt = (at: string, v: unknown, min: number, max: number): string | null =>
  Array.isArray(v) && v.length >= min && v.length <= max && v.every((d) => isInt(d) && d >= 1 && d <= 6) ? null : `${at} dice`;

/** Each required table: its key, display name for messages, and its shape check. */
const TABLES: [string, string, Check][] = [
  ['starting', 'Starting Values', (v) => {
    if (!isObj(v)) return 'Starting Values';
    const p = field(v, 'Starting Values', ['level', 'xp', 'shift', 'discipline', 'precision', 'hp', 'rations'], isCount);
    if (p) return p;
    if (!isPositive(v.level)) return 'Starting Values level';
    return rows('Starting Values potions', v.potions, false, (r, at) => named(r, at, ['name']) ?? field(r, at, ['effect'], isStr)) ?? strsAt('Starting Values kit', v.kit);
  }],
  ['startingArmour', 'Starting Armour', (v) =>
    rows('Starting Armour', v, true, (a, at) => named(a, at, ['name']) ?? field(a, at, ['modifier'], isStr) ?? diceAt(at, a.dice, 1, 2))],
  ['startingScrolls', 'Starting Scrolls', (v) =>
    rows('Starting Scrolls', v, true, (s, at) => named(s, at, ['name']) ?? field(s, at, ['effect', 'orbit', 'dispelDoubles', 'effectModifier'], isStr))],
  ['weapons', 'Weapons', (v) =>
    rows('Weapons', v, true, (w, at) => named(w, at, ['name']) ??
      rows(`${at} manoeuvres`, w.manoeuvres, false, (m, _a) => {
        const idx = (w.manoeuvres as unknown[]).indexOf(m) + 1;
        const mat = `${at} manoeuvre ${idx}`;
        return named(m, mat, ['name']) ?? field(m, mat, ['damage'], isStr) ?? field(m, mat, ['level'], isPositive) ?? diceAt(mat, m.dice, 2, 2);
      }))],
  ['levels', 'Levels', (v) =>
    rows('Levels', v, true, (l, at) => {
      const p = named(l, at, ['title']) ?? field(l, at, ['level', 'maxManoeuvreLevel'], isPositive) ??
        field(l, at, ['manoeuvres', 'shift', 'discipline', 'precision', 'hpBaseline'], isCount);
      if (p) return p;
      const last = at === `Levels[${(v as unknown[]).length - 1}]`;
      if (last) return l.xpToLevelUp === null ? null : `${at} xpToLevelUp (must be null on the last level)`;
      return isCount(l.xpToLevelUp) ? null : `${at} xpToLevelUp (must be a whole number)`;
    })],
  ['gods', 'Gods', (v) => (Array.isArray(v) && v.length === 0 ? 'Gods has no entries' : strsAt('Gods', v))],
  ['conditions', 'Conditions', (v) => {
    if (!isObj(v)) return 'Conditions';
    for (const k of ['bloodied', 'soaked']) {
      const c = v[k];
      if (!isObj(c)) return `Conditions ${k}`;
      const p = named(c, `Conditions ${k}`, ['label']) ?? field(c, `Conditions ${k}`, ['boxes'], isCount);
      if (p) return p;
    }
    for (const k of ['fever', 'pneumonia']) {
      const c = v[k];
      if (!isObj(c)) return `Conditions ${k}`;
      const p = named(c, `Conditions ${k}`, ['label']) ?? field(c, `Conditions ${k}`, ['effect'], isStr);
      if (p) return p;
    }
    return null;
  }],
  ['favourBoxes', 'Favour Boxes', (v) => (isCount(v) ? null : 'Favour Boxes')],
  ['limits', 'Limits', (v) => (isObj(v) ? field(v, 'Limits', ['potions', 'scrolls', 'largeItems', 'armour'], isCount) : 'Limits')],
];

const D66_KEYS = [1, 2, 3, 4, 5, 6].flatMap((a) => [1, 2, 3, 4, 5, 6].map((b) => `${a}${b}`));
const TWO_D6_KEYS = Array.from({ length: 11 }, (_, i) => String(i + 2));
const DOOR_IDS: string[] = dungeonSystem.doorTypes.map((d) => d.id);

/** Every key present, each entry an object; `each` checks one entry and returns a place or null. */
const keyed = (at: string, v: unknown, keys: string[], each: (e: Record<string, unknown>, eat: string) => string | null): string | null => {
  if (!isObj(v)) return at;
  for (const k of keys) {
    const e = v[k];
    if (!isObj(e)) return `${at} ${k}`;
    const p = each(e, `${at} ${k}`);
    if (p) return p;
  }
  const extra = Object.keys(v).find((k) => !keys.includes(k));
  return extra === undefined ? null : `${at} ${extra} (not a valid key)`;
};
const exitProblem = (at: string, v: unknown, allowRandom: boolean): string | null => {
  if (allowRandom && v === 'random') return null;
  if (isObj(v) && isStr(v.door) && DOOR_IDS.includes(v.door)) {
    return v.locked === undefined || typeof v.locked === 'boolean' ? null : `${at} locked (true or false)`;
  }
  return `${at} exit — use one of ${DOOR_IDS.join(', ')}`;
};
const roomEntry = (r: Record<string, unknown>, at: string, hasExit: boolean, hasEncounter: boolean): string | null =>
  named(r, at, ['type']) ??
  field(r, at, hasEncounter ? ['description', 'encounter'] : ['description'], isStr) ??
  (typeof r.unique === 'boolean' ? null : `${at} unique`) ??
  (hasExit ? exitProblem(at, r.exit, true) : null);

const SIX_KEYS = ['1', '2', '3', '4', '5', '6'];

const isFace = (v: unknown): boolean => isInt(v) && (v as number) >= 1 && (v as number) <= 6;

/** The optional card details on one creature. */
function creatureCombatProblem(c: Record<string, unknown>, at: string): string | null {
  const list = (key: string, each: (r: Record<string, unknown>, rat: string) => string | null): string | null => {
    const v = c[key];
    if (v === undefined) return null;
    if (!Array.isArray(v)) return `${at} ${key}`;
    for (const [i, r] of v.entries()) {
      const rat = `${at} ${key} ${i + 1}`;
      if (!isObj(r)) return rat;
      const p = each(r, rat);
      if (p) return p;
    }
    return null;
  };
  return (
    list('manoeuvres', (r, rat) =>
      named(r, rat, ['name']) ??
      (Array.isArray(r.dice) && r.dice.length === 2 && r.dice.every(isFace) ? null : `${rat} dice`) ??
      field(r, rat, ['damage'], isStr),
    ) ??
    list('interrupts', (r, rat) =>
      named(r, rat, ['name']) ??
      (r.side === 'primary' || r.side === 'secondary' ? null : `${rat} side`) ??
      (Array.isArray(r.dice) && r.dice.length >= 1 && r.dice.every(isFace) ? null : `${rat} dice`) ??
      (isInt(r.modifier) && (r.modifier as number) <= 0 ? null : `${rat} modifier`) ??
      (r.effect === undefined || isStr(r.effect) ? null : `${rat} effect`) ??
      (r.movement === undefined || typeof r.movement === 'boolean' ? null : `${rat} movement`),
    ) ??
    (c.mishap === undefined || isStr(c.mishap) ? null : `${at} mishap`) ??
    (c.prime === undefined || isStr(c.prime) ? null : `${at} prime`)
  );
}

const isFlag = (v: unknown): boolean => v === undefined || typeof v === 'boolean';

/** `throwingWeapons` and `potionBombs`, both optional lists. */
function throwingProblem(t: Record<string, unknown>): string | null {
  const list = (key: string, label: string, each: (r: Record<string, unknown>, at: string) => string | null): string | null => {
    const v = t[key];
    if (v === undefined) return null;
    if (!Array.isArray(v)) return label;
    for (const [i, r] of v.entries()) {
      const at = `${label} ${i + 1}`;
      if (!isObj(r)) return at;
      const p = each(r, at);
      if (p) return p;
    }
    return null;
  };
  return (
    list('throwingWeapons', 'Throwing Weapons', (r, at) =>
      named(r, at, ['name']) ??
      field(r, at, ['damage'], isCount) ??
      (r.aliases === undefined || (Array.isArray(r.aliases) && r.aliases.every((a) => isStr(a) && a.trim() !== '')) ? null : `${at} aliases`),
    ) ??
    list('potionBombs', 'Potion Bombs', (r, at) =>
      named(r, at, ['name']) ??
      field(r, at, ['effect'], isStr) ??
      (r.damage === undefined || isStr(r.damage) ? null : `${at} damage`) ??
      (r.damagePerLevel === undefined || isCount(r.damagePerLevel) ? null : `${at} damagePerLevel`) ??
      (isFlag(r.noAttack) ? null : `${at} noAttack`) ??
      (isFlag(r.noMovementInterrupts) ? null : `${at} noMovementInterrupts`),
    )
  );
}

/** `creatures` is checked first so the names in `creatureTables` have something to match. */
function creatureProblem(t: Record<string, unknown>): string | null {
  const known = new Set<string>();
  if (t.creatures !== undefined) {
    if (!isObj(t.creatures)) return 'Creatures';
    for (const [name, c] of Object.entries(t.creatures)) {
      if (name.trim() === '') return 'Creatures (a creature name is empty)';
      const at = `Creatures ${name}`;
      if (!isObj(c)) return at;
      if (!isInt(c.level) || c.level < 1 || c.level > 10) return `${at} level (must be a whole number from 1 to 10)`;
      const p = field(c, at, ['hp', 'xp'], isCount) ?? field(c, at, ['shift'], isInt) ?? field(c, at, ['treasure'], isStr) ?? creatureCombatProblem(c, at);
      if (p) return p;
      known.add(name.toLowerCase());
    }
  }
  if (t.creatureTables === undefined) return null;
  if (!isObj(t.creatureTables)) return 'Creature Tables';
  for (const [name, table] of Object.entries(t.creatureTables)) {
    const p = keyed(`Creature Tables ${name}`, table, SIX_KEYS, (e, at) => {
      if (e.creatures !== undefined) {
        if (Array.isArray(e.creatures) && e.creatures.length === 0) return `${at} creatures (empty)`;
        const bad = strsAt(`${at} creatures`, e.creatures);
        if (bad) return bad;
        const missing = (e.creatures as string[]).find((c) => !known.has(c.toLowerCase()));
        return missing === undefined ? null : `${at} (no creature named ${missing} in Creatures)`;
      }
      return isStr(e.text) ? null : at;
    });
    if (p) return p;
  }
  return null;
}

function roomTablesProblem(t: Record<string, unknown>): string | null {
  const exitTables = t.exitTables;
  if (exitTables !== undefined) {
    if (!isObj(exitTables)) return 'Exit Tables';
    for (const [name, table] of Object.entries(exitTables)) {
      const p = keyed(`Exit Tables ${name}`, table, D66_KEYS, (e, at) => exitProblem(at, e, false));
      if (p) return p;
    }
  }
  const dl = t.dungeonLevels;
  const roomP = dl === undefined ? null : roomLevelsProblem(dl, exitTables);
  return roomP ?? creatureProblem(t) ?? referenceProblem(t) ?? throwingProblem(t);
}

function roomLevelsProblem(dl: unknown, exitTables: unknown): string | null {
  const seen = new Set<number>();
  return rows('Dungeon Levels', dl, false, (l, at) => {
    const p = field(l, at, ['name', 'exitTable'], isStr);
    if (p) return p;
    if (!isInt(l.level) || (l.level as number) < 1 || (l.level as number) > 10) return `${at} level (must be a whole number from 1 to 10)`;
    if (seen.has(l.level as number)) return `${at} level (another entry already uses level ${l.level})`;
    seen.add(l.level as number);
    if (!isObj(exitTables) || !Object.hasOwn(exitTables, l.exitTable as string)) {
      return `${at} exitTable (no table named ${l.exitTable} in Exit Tables)`;
    }
    return keyed(`${at} rooms`, l.rooms, D66_KEYS, (r, rat) => roomEntry(r, rat, true, true)) ??
      keyed(`${at} smallRooms`, l.smallRooms, TWO_D6_KEYS, (r, rat) => roomEntry(r, rat, false, false)) ??
      keyed(`${at} largeRooms`, l.largeRooms, TWO_D6_KEYS, (r, rat) => roomEntry(r, rat, true, true));
  });
}

const damaged = (detail: string): TablesParse => ({ ok: false, error: `The table file is damaged: ${detail}` });

/** Size guard first, then JSON parse and full validation. */
export function parseTableFile(text: string, byteLength: number): TablesParse {
  if (byteLength > MAX_TABLE_FILE_BYTES) return { ok: false, error: 'This file is too large to be a table file.' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: NOT_A_TABLE_FILE };
  }
  return validateTableFile(data);
}

/** Full validation of an already-parsed value (also used for the copy stored on the device). */
export function validateTableFile(data: unknown): TablesParse {
  if (!isObj(data) || data.systemId !== 'dungeon' || typeof data.format !== 'number') return { ok: false, error: NOT_A_TABLE_FILE };
  if (!isInt(data.format)) return damaged('format');
  if (data.format > TABLE_FILE_FORMAT) return { ok: false, error: 'Made by a newer version of the app' };
  if (data.format !== TABLE_FILE_FORMAT) return damaged('format');
  if (!isStr(data.name)) return damaged('name');
  if (!isObj(data.tables)) return { ok: false, error: 'The table file is missing Tables' };
  const t = data.tables;
  for (const [key, label] of TABLES) {
    if (t[key] === undefined) return { ok: false, error: `The table file is missing ${label}` };
  }
  for (const [key, , check] of TABLES) {
    const problem = check(t[key]);
    if (problem) return damaged(problem);
  }
  const levels = t.levels as LevelRow[];
  for (let i = 0; i < levels.length; i++) {
    if (levels[i]!.level !== i + 1) return damaged(`Levels[${i}] level (levels must run 1, 2, 3 ... in order)`);
    if (i > 0 && (levels[i - 1]!.xpToLevelUp as number) >= (levels[i]!.xpToLevelUp ?? Infinity) && i < levels.length - 1) {
      return damaged(`Levels[${i}] xpToLevelUp (must be higher than the level before)`);
    }
  }
  const starting = t.starting as DungeonTables['tables']['starting'];
  if (!levels.some((l) => l.level === starting.level)) return damaged('Starting Values level (no matching row in Levels)');
  const need = levels[0]!.manoeuvres;
  const weapons = t.weapons as DungeonTables['tables']['weapons'];
  for (let i = 0; i < weapons.length; i++) {
    if (weapons[i]!.manoeuvres.filter((m) => m.level === 1).length < need) {
      return damaged(`Weapons[${i}] has fewer than ${need} level 1 manoeuvres`);
    }
  }
  const roomProblem = roomTablesProblem(t);
  if (roomProblem) return damaged(roomProblem);
  return { ok: true, tables: data as unknown as DungeonTables };
}
