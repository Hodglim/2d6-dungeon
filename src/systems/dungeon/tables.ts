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
const isCount = (v: unknown): v is number => isInt(v) && (v as number) >= 0;
const strs = (v: unknown): boolean => Array.isArray(v) && v.every(isStr);
const list = (v: unknown, ok: (x: Record<string, unknown>) => boolean): boolean =>
  Array.isArray(v) && v.every((x) => isObj(x) && ok(x));
const diceOk = (v: unknown, min: number, max: number): boolean =>
  Array.isArray(v) && v.length >= min && v.length <= max && v.every((d) => isInt(d) && d >= 1 && d <= 6);
const hasStrs = (o: Record<string, unknown>, keys: string[]): boolean => keys.every((k) => isStr(o[k]));
const hasCounts = (o: Record<string, unknown>, keys: string[]): boolean => keys.every((k) => isCount(o[k]));

/** Each required table: display name for the "missing" message, and its shape check. */
const TABLES: [string, string, (v: unknown) => boolean][] = [
  ['starting', 'Starting Values', (v) =>
    isObj(v) && hasCounts(v, ['level', 'xp', 'shift', 'discipline', 'precision', 'hp', 'rations']) &&
    list(v.potions, (p) => hasStrs(p, ['name', 'effect'])) && strs(v.kit)],
  ['startingArmour', 'Starting Armour', (v) =>
    list(v, (a) => isStr(a.name) && isStr(a.modifier) && diceOk(a.dice, 1, 2))],
  ['startingScrolls', 'Starting Scrolls', (v) =>
    list(v, (s) => hasStrs(s, ['name', 'effect', 'orbit', 'dispelDoubles', 'effectModifier']))],
  ['weapons', 'Weapons', (v) =>
    list(v, (w) => isStr(w.name) && list(w.manoeuvres, (m) =>
      isCount(m.level) && isStr(m.name) && isStr(m.damage) && diceOk(m.dice, 2, 2)))],
  ['levels', 'Levels', (v) =>
    list(v, (l) => isStr(l.title) && hasCounts(l, ['level', 'manoeuvres', 'maxManoeuvreLevel', 'shift', 'discipline', 'precision', 'hpBaseline']) &&
      (l.xpToLevelUp === null || isCount(l.xpToLevelUp)))],
  ['gods', 'Gods', strs],
  ['conditions', 'Conditions', (v) =>
    isObj(v) &&
    ['bloodied', 'soaked'].every((k) => isObj(v[k]) && isStr(v[k].label) && isCount(v[k].boxes)) &&
    ['fever', 'pneumonia'].every((k) => isObj(v[k]) && hasStrs(v[k], ['label', 'effect']))],
  ['favourBoxes', 'Favour Boxes', isCount],
  ['limits', 'Limits', (v) => isObj(v) && hasCounts(v, ['potions', 'scrolls', 'largeItems', 'armour'])],
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
  if (!isObj(data) || data.systemId !== 'dungeon' || !isInt(data.format)) return { ok: false, error: NOT_A_TABLE_FILE };
  if (data.format > TABLE_FILE_FORMAT) return { ok: false, error: 'Made by a newer version of the app' };
  if (data.format !== TABLE_FILE_FORMAT) return damaged('unknown format');
  if (!isStr(data.name)) return damaged('missing name');
  if (!isObj(data.tables)) return { ok: false, error: 'The table file is missing Tables' };
  const t = data.tables;
  for (const [key, label] of TABLES) {
    if (t[key] === undefined) return { ok: false, error: `The table file is missing ${label}` };
  }
  for (const [key, label, ok] of TABLES) {
    if (!ok(t[key])) return damaged(`${label} is not in the expected shape`);
  }
  const levels = t.levels as LevelRow[];
  if (levels.length === 0) return damaged('Levels has no rows');
  for (let i = 1; i < levels.length; i++) {
    if (levels[i]!.level <= levels[i - 1]!.level) return damaged('Levels are not sorted by level');
  }
  const need = levels[0]!.manoeuvres;
  for (const w of t.weapons as DungeonTables['tables']['weapons']) {
    if (w.manoeuvres.filter((m) => m.level === 1).length < need) {
      return damaged(`${w.name} has fewer than ${need} level 1 manoeuvres`);
    }
  }
  return { ok: true, tables: data as unknown as DungeonTables };
}
