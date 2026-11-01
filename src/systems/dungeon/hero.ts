/** The dungeon hero: model, creation from the player's table file, level-up and sheet-limit rules. */
import type { DungeonTables, Dice, LevelRow, Limits } from './tables';

export interface HeroRules {
  limits: Limits;
  levels: LevelRow[];
  gods: string[];
  conditions: DungeonTables['tables']['conditions'];
  favourBoxes: number;
}

export interface Hero {
  version: 1;
  name: string;
  weapon: string;
  level: number;
  title: string;
  xp: number;
  hp: number;
  hpBaseline: number;
  shift: number;
  discipline: number;
  precision: number;
  appliedRunes: string;
  manoeuvres: { name: string; dice: Dice; modifier: string }[];
  armour: { name: string; dice: Dice; modifier: string }[];
  scrolls: { name: string; orbit: string; dispelDoubles: string; effectModifier: string }[];
  potions: { name: string; effect: string }[];
  legendLevel: number;
  bloodied: number;
  soaked: number;
  fever: boolean;
  pneumonia: boolean;
  coins: { gc: number; sc: number; cc: number };
  treasure: string[];
  prisoners: string[];
  sideQuests: string[];
  favour: { god: string; points: number }[];
  narrative: string;
  largeItems: string[];
  smallItems: string[];
  lootLockup: string[];
  rations: number;
  rationsNote: string;
  notes: string;
  rules: HeroRules;
}

export interface CreationChoices {
  name: string;
  weapon: string;
  manoeuvres: string[];
  armour: string;
  scroll: string;
}

const startRow = (t: DungeonTables) => t.tables.levels.find((l) => l.level === t.tables.starting.level)!;

export function creationProblem(t: DungeonTables, c: CreationChoices): string | null {
  const row = startRow(t);
  const weapon = t.tables.weapons.find((w) => w.name === c.weapon);
  if (!weapon) return 'Choose a weapon';
  if (c.manoeuvres.length !== row.manoeuvres) return `Choose exactly ${row.manoeuvres} manoeuvres`;
  if (new Set(c.manoeuvres).size !== c.manoeuvres.length) return 'Choose different manoeuvres';
  for (const n of c.manoeuvres) {
    const m = weapon.manoeuvres.find((x) => x.name === n);
    if (!m) return `${n} is not a manoeuvre for ${weapon.name}`;
    if (m.level > row.maxManoeuvreLevel) return `${n} is too advanced for a new hero`;
  }
  if (!t.tables.startingArmour.some((a) => a.name === c.armour)) return 'Choose starting armour';
  if (!t.tables.startingScrolls.some((s) => s.name === c.scroll)) return 'Choose a starting scroll';
  return null;
}

export function createHero(t: DungeonTables, c: CreationChoices): Hero {
  const problem = creationProblem(t, c);
  if (problem) throw new Error(problem);
  const { starting, weapons, startingArmour, startingScrolls, levels, gods, conditions, favourBoxes, limits } = t.tables;
  const row = startRow(t);
  const weapon = weapons.find((w) => w.name === c.weapon)!;
  const a = startingArmour.find((x) => x.name === c.armour)!;
  const s = startingScrolls.find((x) => x.name === c.scroll)!;
  return {
    version: 1,
    name: c.name,
    weapon: weapon.name,
    level: starting.level,
    title: row.title,
    xp: starting.xp,
    hp: starting.hp,
    hpBaseline: starting.hp,
    shift: starting.shift,
    discipline: starting.discipline,
    precision: starting.precision,
    appliedRunes: '',
    manoeuvres: c.manoeuvres.map((n) => {
      const m = weapon.manoeuvres.find((x) => x.name === n)!;
      return { name: m.name, dice: [...m.dice], modifier: m.damage };
    }),
    armour: [{ name: a.name, dice: [...a.dice], modifier: a.modifier }],
    scrolls: [{ name: s.name, orbit: s.orbit, dispelDoubles: s.dispelDoubles, effectModifier: s.effectModifier }],
    potions: starting.potions.map((p) => ({ ...p })),
    legendLevel: 0,
    bloodied: 0,
    soaked: 0,
    fever: false,
    pneumonia: false,
    coins: { gc: 0, sc: 0, cc: 0 },
    treasure: [],
    prisoners: [],
    sideQuests: [],
    favour: gods.map((god) => ({ god, points: 0 })),
    narrative: '',
    largeItems: [],
    smallItems: [...starting.kit],
    lootLockup: [],
    rations: starting.rations,
    rationsNote: '',
    notes: '',
    rules: structuredClone({ limits, levels, gods, conditions, favourBoxes }),
  };
}

// ---- validation of a loaded hero ----
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isCount = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isDice = (v: unknown): boolean =>
  Array.isArray(v) && v.length >= 1 && v.length <= 2 && v.every((d) => Number.isInteger(d) && d >= 1 && d <= 6);

function listProblem(h: Record<string, unknown>, key: string, each: (r: Record<string, unknown>) => string | null): string | null {
  const v = h[key];
  if (!Array.isArray(v)) return key;
  for (let i = 0; i < v.length; i++) {
    if (!isObj(v[i])) return `${key}[${i}]`;
    const p = each(v[i] as Record<string, unknown>);
    if (p) return `${key}[${i}] ${p}`;
  }
  return null;
}
const strFields = (r: Record<string, unknown>, keys: string[]) => keys.find((k) => !isStr(r[k])) ?? null;
const strList = (h: Record<string, unknown>, key: string) =>
  Array.isArray(h[key]) && (h[key] as unknown[]).every(isStr) ? null : key;

function rulesProblem(r: unknown): string | null {
  if (!isObj(r)) return 'rules';
  if (!isObj(r.limits) || ['potions', 'scrolls', 'largeItems', 'armour'].some((k) => !isCount((r.limits as Record<string, unknown>)[k]))) return 'rules limits';
  if (!Array.isArray(r.levels) || r.levels.length === 0) return 'rules levels';
  for (let i = 0; i < r.levels.length; i++) {
    const l = r.levels[i];
    if (!isObj(l)) return `rules levels[${i}]`;
    if (!isStr(l.title)) return `rules levels[${i}] title`;
    const bad = ['level', 'manoeuvres', 'maxManoeuvreLevel', 'shift', 'discipline', 'precision', 'hpBaseline'].find((k) => !isCount(l[k]));
    if (bad) return `rules levels[${i}] ${bad}`;
    if (l.xpToLevelUp !== null && !isCount(l.xpToLevelUp)) return `rules levels[${i}] xpToLevelUp`;
  }
  if (!Array.isArray(r.gods) || !r.gods.every(isStr)) return 'rules gods';
  const c = r.conditions;
  if (!isObj(c)) return 'rules conditions';
  for (const k of ['bloodied', 'soaked']) {
    const x = c[k];
    if (!isObj(x) || !isStr(x.label) || !isCount(x.boxes)) return `rules conditions ${k}`;
  }
  for (const k of ['fever', 'pneumonia']) {
    const x = c[k];
    if (!isObj(x) || !isStr(x.label) || !isStr(x.effect)) return `rules conditions ${k}`;
  }
  if (!isCount(r.favourBoxes)) return 'rules favourBoxes';
  return null;
}

export function heroProblem(raw: unknown): string | null {
  if (!isObj(raw)) return 'The hero is not a record';
  const h = raw;
  const fail = (what: string) => `The hero is damaged: ${what}`;
  if (h.version !== 1) return fail('version');
  const s = ['name', 'weapon', 'title', 'appliedRunes', 'narrative', 'notes', 'rationsNote'].find((k) => !isStr(h[k]));
  if (s) return fail(s);
  // HP may drop to zero or below, and XP is a plain whole number: integers only.
  const ints = ['hp', 'xp'].find((k) => !Number.isInteger(h[k]));
  if (ints) return fail(ints);
  const n = ['level', 'hpBaseline', 'shift', 'discipline', 'precision', 'legendLevel', 'bloodied', 'soaked', 'rations'].find((k) => !isCount(h[k]));
  if (n) return fail(n);
  if ((h.legendLevel as number) > 10) return fail('legendLevel');
  if (typeof h.fever !== 'boolean') return fail('fever');
  if (typeof h.pneumonia !== 'boolean') return fail('pneumonia');
  if (!isObj(h.coins)) return fail('coins');
  const coin = ['gc', 'sc', 'cc'].find((k) => !isCount((h.coins as Record<string, unknown>)[k]));
  if (coin) return fail(`coins ${coin}`);
  const dm = (r: Record<string, unknown>) => strFields(r, ['name', 'modifier']) ?? (isDice(r.dice) ? null : 'dice');
  const p =
    listProblem(h, 'manoeuvres', dm) ??
    listProblem(h, 'armour', dm) ??
    listProblem(h, 'scrolls', (r) => strFields(r, ['name', 'orbit', 'dispelDoubles', 'effectModifier'])) ??
    listProblem(h, 'potions', (r) => strFields(r, ['name', 'effect'])) ??
    listProblem(h, 'favour', (r) => strFields(r, ['god']) ?? (isCount(r.points) ? null : 'points')) ??
    ['treasure', 'prisoners', 'sideQuests', 'largeItems', 'smallItems', 'lootLockup'].map((k) => strList(h, k)).find((x) => x) ??
    rulesProblem(h.rules);
  return p ? fail(p) : null;
}

// ---- rules ----
const row = (h: Hero, level: number) => h.rules.levels.find((r) => r.level === level) ?? null;

export const nextLevelRow = (h: Hero): LevelRow | null => row(h, h.level + 1);

export function levelUpAvailable(h: Hero): boolean {
  const cur = row(h, h.level);
  if (!cur || cur.xpToLevelUp === null || !nextLevelRow(h)) return false;
  return h.xp >= cur.xpToLevelUp;
}

/** Callers must check `levelUpAvailable` first; this does not check XP. */
export function levelUp(h: Hero): Hero {
  const next = nextLevelRow(h);
  if (!next) return h;
  return {
    ...h,
    level: next.level,
    title: next.title,
    hp: h.hp + 10,
    hpBaseline: next.hpBaseline,
    shift: next.shift,
    discipline: next.discipline,
    precision: next.precision,
  };
}

export type ListKey = 'potions' | 'scrolls' | 'largeItems' | 'armour' | 'manoeuvres';

export function listLimit(h: Hero, key: ListKey): number {
  return key === 'manoeuvres' ? (row(h, h.level)?.manoeuvres ?? 0) : h.rules.limits[key];
}

export const overLimit = (h: Hero, key: ListKey): boolean => h[key].length > listLimit(h, key);

// ---- undo labels ----
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const signed = (d: number) => `${d < 0 ? '−' : '+'}${Math.abs(d)}`;
const NUMERIC: [string, string][] = [['hp', 'HP'], ['xp', 'XP']];
const COINS: [string, string][] = [['gc', 'GC'], ['sc', 'SC'], ['cc', 'CC']];
const itemName = (x: unknown) => (isObj(x) && isStr(x.name) ? x.name : String(x));

export function heroEdit(before: Hero, after: Hero): string {
  const keys = (Object.keys(after) as (keyof Hero)[]).filter((k) => k !== 'coins' && !same(before[k], after[k]));
  const coinKeys = COINS.filter(([k]) => before.coins[k as 'gc'] !== after.coins[k as 'gc']);
  if (keys.length + coinKeys.length !== 1) return 'Edit hero';
  if (coinKeys.length === 1) {
    const [k, label] = coinKeys[0]!;
    return `${label} ${signed(after.coins[k as 'gc'] - before.coins[k as 'gc'])}`;
  }
  const k = keys[0]!;
  const num = NUMERIC.find(([nk]) => nk === k);
  if (num) return `${num[1]} ${signed((after[k] as number) - (before[k] as number))}`;
  const a = before[k];
  const b = after[k];
  if (Array.isArray(a) && Array.isArray(b) && k !== 'favour' && Math.abs(a.length - b.length) === 1) {
    const [long, short] = a.length > b.length ? [a, b] : [b, a];
    const extra = long.filter((x) => !short.some((y) => same(x, y)));
    const verb = b.length > a.length ? 'Add' : 'Remove';
    if (extra.length === 1) return `${verb} ${itemName(extra[0])}`;
    // A duplicate name leaves no unique extra: if the shorter list is a prefix, the last element is the one.
    if (short.every((x, i) => same(x, long[i]))) return `${verb} ${itemName(long[long.length - 1])}`;
  }
  return 'Edit hero';
}
