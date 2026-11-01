/** The player's own dungeon table file: types and validation. The app ships no table content. */

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
const strsAt = (name: string, v: unknown): string | null =>
  !Array.isArray(v) ? name : v.findIndex((x) => !isStr(x)) >= 0 ? `${name}[${v.findIndex((x) => !isStr(x))}]` : null;
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
    return rows('Starting Values potions', v.potions, false, (r, at) => field(r, at, ['name', 'effect'], isStr)) ?? strsAt('Starting Values kit', v.kit);
  }],
  ['startingArmour', 'Starting Armour', (v) =>
    rows('Starting Armour', v, true, (a, at) => field(a, at, ['name', 'modifier'], isStr) ?? diceAt(at, a.dice, 1, 2))],
  ['startingScrolls', 'Starting Scrolls', (v) =>
    rows('Starting Scrolls', v, true, (s, at) => field(s, at, ['name', 'effect', 'orbit', 'dispelDoubles', 'effectModifier'], isStr))],
  ['weapons', 'Weapons', (v) =>
    rows('Weapons', v, true, (w, at) => field(w, at, ['name'], isStr) ??
      rows(`${at} manoeuvres`, w.manoeuvres, false, (m, _a) => {
        const idx = (w.manoeuvres as unknown[]).indexOf(m) + 1;
        const mat = `${at} manoeuvre ${idx}`;
        return field(m, mat, ['name', 'damage'], isStr) ?? field(m, mat, ['level'], isPositive) ?? diceAt(mat, m.dice, 2, 2);
      }))],
  ['levels', 'Levels', (v) =>
    rows('Levels', v, true, (l, at) => {
      const p = field(l, at, ['title'], isStr) ?? field(l, at, ['level', 'maxManoeuvreLevel'], isPositive) ??
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
      const p = field(c, `Conditions ${k}`, ['label'], isStr) ?? field(c, `Conditions ${k}`, ['boxes'], isCount);
      if (p) return p;
    }
    for (const k of ['fever', 'pneumonia']) {
      const c = v[k];
      if (!isObj(c)) return `Conditions ${k}`;
      const p = field(c, `Conditions ${k}`, ['label', 'effect'], isStr);
      if (p) return p;
    }
    return null;
  }],
  ['favourBoxes', 'Favour Boxes', (v) => (isCount(v) ? null : 'Favour Boxes')],
  ['limits', 'Limits', (v) => (isObj(v) ? field(v, 'Limits', ['potions', 'scrolls', 'largeItems', 'armour'], isCount) : 'Limits')],
];

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
  return { ok: true, tables: data as unknown as DungeonTables };
}
