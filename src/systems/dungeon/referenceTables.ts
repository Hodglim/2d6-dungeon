import type { DungeonTables } from './tables';
import { d3FromD6 } from './rules';

/** Reference tables in the player's table file: types, roll-range parsing and validation. Display and rolling only. */

export type RefDice = 'd3' | 'd6' | '2d6' | 'd66';
export type RefGroup = 'generic' | 'random' | 'loot' | 'level' | 'optional';
export interface RefRow { roll?: string; cells: string[] }
export interface RefTable {
  name: string; group: RefGroup; level?: number; page: number; dice: RefDice | null;
  intro?: string; notes?: string; columns: string[]; rows: RefRow[];
}
/** Inclusive; -Infinity / Infinity for open ends. */
export interface RollRange { min: number; max: number }

const GROUPS: string[] = ['generic', 'random', 'loot', 'level', 'optional'];
const DICE: string[] = ['d3', 'd6', '2d6', 'd66'];
const N = '(-?\\d+)';
const DASH = '[-\\u2013\\u2212]';

/** "3", "1-2" (hyphen, en dash or minus), "7+", "0 or less"; null when it is none of these. */
export function parseRange(s: string): RollRange | null {
  const t = s.trim();
  let m = new RegExp(`^${N}$`).exec(t);
  if (m) return { min: Number(m[1]), max: Number(m[1]) };
  m = new RegExp(`^${N}\\s*${DASH}\\s*(\\d+)$`).exec(t);
  if (m) {
    const a = Number(m[1]), b = Number(m[2]);
    return a <= b ? { min: a, max: b } : null;
  }
  m = new RegExp(`^${N}\\s*\\+$`).exec(t);
  if (m) return { min: Number(m[1]), max: Infinity };
  m = new RegExp(`^${N}\\s+or\\s+less$`, 'i').exec(t);
  if (m) return { min: -Infinity, max: Number(m[1]) };
  return null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isInt = (v: unknown): v is number => Number.isInteger(v);

function rowsProblem(at: string, t: Record<string, unknown>): string | null {
  const dice = t.dice as RefDice | null;
  const cols = t.columns as string[];
  const expected = dice === null ? cols.length : cols.length - 1;
  const rows = t.rows;
  if (!Array.isArray(rows)) return `${at} rows`;
  if (rows.length === 0) return `${at} rows has no entries`;
  const ranges: (RollRange | null)[] = [];
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rat = `${at} rows[${i}]`;
    if (!isObj(r)) return rat;
    if (dice === null) {
      if (r.roll !== undefined) return `${rat} roll (a list has no roll)`;
    } else {
      const range = isStr(r.roll) ? parseRange(r.roll) : null;
      if (!range) return `${rat} roll`;
      const j = ranges.findIndex((o) => o !== null && o.min <= range.max && range.min <= o.max);
      if (j >= 0) return `${rat} roll (overlaps rows[${j}])`;
      ranges.push(range);
    }
    if (!Array.isArray(r.cells) || !r.cells.every(isStr)) return `${rat} cells`;
    if (r.cells.length !== expected) return `${rat} cells (expected ${expected})`;
  }
  return null;
}

/** null when fine, or a located message such as "Reference Tables XX1 rows[2] roll". */
export function referenceProblem(t: Record<string, unknown>): string | null {
  const all = t.referenceTables;
  if (all === undefined) return null;
  if (!isObj(all)) return 'Reference Tables';
  for (const [id, table] of Object.entries(all)) {
    if (id.trim() === '') return 'Reference Tables (a table id is empty)';
    const at = `Reference Tables ${id}`;
    if (!isObj(table)) return at;
    if (!isStr(table.name)) return `${at} name`;
    if (table.name.trim() === '') return `${at} name (empty)`;
    if (!isStr(table.group) || !GROUPS.includes(table.group)) return `${at} group (use one of ${GROUPS.join(', ')})`;
    if (!isInt(table.page) || table.page < 1) return `${at} page (must be a whole number, 1 or more)`;
    if (table.dice !== null && (!isStr(table.dice) || !DICE.includes(table.dice))) return `${at} dice (use one of ${DICE.join(', ')}, or null for a list)`;
    if (table.level !== undefined && (!isInt(table.level) || table.level < 1 || table.level > 10)) return `${at} level (must be a whole number from 1 to 10)`;
    for (const k of ['intro', 'notes']) if (table[k] !== undefined && !isStr(table[k])) return `${at} ${k}`;
    const cols = table.columns;
    if (!Array.isArray(cols) || cols.length === 0 || !cols.every(isStr)) return `${at} columns`;
    const p = rowsProblem(at, table);
    if (p) return p;
  }
  return null;
}

/** `d3Face`: on a D3 table, the D6 face rolled (the natural total is that face read in halves). */
export interface RefRoll { natural: number; modifier: number; total: number; clamped: number; row: number | null; d3Face?: number }

const validFace = (f: number): boolean => Number.isInteger(f) && f >= 1 && f <= 6;

/** Natural total of the faces for the dice; null when the faces do not fit the dice. */
export function naturalTotal(dice: RefDice, faces: number[]): number | null {
  if (dice === 'd3') return faces.length === 1 && validFace(faces[0]!) ? d3FromD6(faces[0]!) : null;
  if (dice === 'd6') return faces.length === 1 && validFace(faces[0]!) ? faces[0]! : null;
  if (faces.length !== 2 || !faces.every(validFace)) return null;
  return dice === '2d6' ? faces[0]! + faces[1]! : faces[0]! * 10 + faces[1]!;
}

/**
 * Modified Ranges Rule: when the modifier moves the total off the table (past the lowest or highest
 * value the rows cover), it counts as that end. A natural total no row covers is never clamped:
 * it, like a total in a gap, gives row null ("No row for N").
 */
export function rollReference(t: RefTable, faces: number[], modifier: number): RefRoll | null {
  if (t.dice === null) return null;
  const natural = naturalTotal(t.dice, faces);
  if (natural === null) return null;
  const mod = t.dice === 'd66' ? 0 : modifier;
  const total = natural + mod;
  const ranges = t.rows.map((r) => (r.roll === undefined ? null : parseRange(r.roll)));
  const rowOf = (n: number): number => ranges.findIndex((r) => r !== null && n >= r.min && n <= r.max);
  let lo = Infinity, hi = -Infinity;
  for (const r of ranges) if (r) { lo = Math.min(lo, r.min); hi = Math.max(hi, r.max); }
  const offTable = total < lo || total > hi;
  const clamped = offTable && rowOf(natural) >= 0 ? Math.min(Math.max(total, lo), hi) : total;
  const i = rowOf(clamped);
  const roll: RefRoll = { natural, modifier: mod, total, clamped, row: i < 0 ? null : i };
  if (t.dice === 'd3') roll.d3Face = faces[0]!;
  return roll;
}

/** Case-insensitive lookup by table id. */
export function findTable(t: DungeonTables | null, code: string): { code: string; table: RefTable } | null {
  const all = t?.tables.referenceTables;
  if (!all) return null;
  const want = code.toLowerCase();
  for (const [id, table] of Object.entries(all)) if (id.toLowerCase() === want) return { code: id, table };
  return null;
}
