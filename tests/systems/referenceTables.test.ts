import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/dungeon-tables.fixture.json';
import { parseRange } from '../../src/systems/dungeon/referenceTables';
import { validateTableFile } from '../../src/systems/dungeon/tables';

const clone = () => JSON.parse(JSON.stringify(fixture));
const err = (o: unknown) => {
  const r = validateTableFile(o);
  return r.ok ? '' : r.error;
};
const P = 'The table file is damaged: Reference Tables';

describe('parseRange', () => {
  it('reads single values, ranges, open ends', () => {
    expect(parseRange('3')).toEqual({ min: 3, max: 3 });
    expect(parseRange('1-2')).toEqual({ min: 1, max: 2 });
    expect(parseRange('1–2')).toEqual({ min: 1, max: 2 });
    expect(parseRange('11-16')).toEqual({ min: 11, max: 16 });
    expect(parseRange('7+')).toEqual({ min: 7, max: Infinity });
    expect(parseRange('0 or less')).toEqual({ min: -Infinity, max: 0 });
  });
  it('refuses anything else', () => {
    expect(parseRange('x')).toBeNull();
    expect(parseRange('')).toBeNull();
    expect(parseRange('5-2')).toBeNull();
  });
});

describe('reference table validation', () => {
  it('accepts the fixture, with gaps, and a file without the key', () => {
    expect(err(fixture)).toBe('');
    const o = clone(); delete o.tables.referenceTables;
    expect(err(o)).toBe('');
  });
  it('refuses an unparseable roll', () => {
    const o = clone(); o.tables.referenceTables.XX1.rows[2].roll = 'x';
    expect(err(o)).toBe(`${P} XX1 rows[2] roll`);
  });
  it('refuses overlapping rolls', () => {
    const o = clone(); o.tables.referenceTables.XX1.rows[3].roll = '5-6';
    expect(err(o)).toBe(`${P} XX1 rows[3] roll (overlaps rows[2])`);
  });
  it('refuses the wrong number of cells', () => {
    const o = clone(); o.tables.referenceTables.XX1.rows[0].cells = ['a', 'b'];
    expect(err(o)).toBe(`${P} XX1 rows[0] cells (expected 1)`);
    const l = clone(); l.tables.referenceTables.LIST1.rows[0].cells = ['a'];
    expect(err(l)).toBe(`${P} LIST1 rows[0] cells (expected 3)`);
  });
  it('refuses a roll in a list', () => {
    const o = clone(); o.tables.referenceTables.LIST1.rows[0].roll = '1';
    expect(err(o)).toBe(`${P} LIST1 rows[0] roll (a list has no roll)`);
  });
  it('refuses a missing roll in a rollable table', () => {
    const o = clone(); delete o.tables.referenceTables.XX1.rows[1].roll;
    expect(err(o)).toBe(`${P} XX1 rows[1] roll`);
  });
  it('refuses bad group, dice, page and blank name at their own place', () => {
    const g = clone(); g.tables.referenceTables.XX1.group = 'nope';
    expect(err(g)).toMatch(`${P} XX1 group`);
    const d = clone(); d.tables.referenceTables.XX2.dice = 'd20';
    expect(err(d)).toMatch(`${P} XX2 dice`);
    const p = clone(); p.tables.referenceTables.XX1.page = 0;
    expect(err(p)).toMatch(`${P} XX1 page`);
    const n = clone(); n.tables.referenceTables.XX1.name = ' ';
    expect(err(n)).toBe(`${P} XX1 name (empty)`);
  });
});

describe('reference table column headings', () => {
  it('allows blank headings and a one-column rollable table', () => {
    const o = clone();
    o.tables.referenceTables.XX2.columns = ['', 'Trinket', 'Worth'];
    o.tables.referenceTables.XX1.columns = [''];
    for (const r of o.tables.referenceTables.XX1.rows) r.cells = [];
    expect(err(o)).toBe('');
  });
});

import { findTable, naturalTotal, rollReference } from '../../src/systems/dungeon/referenceTables';
import type { RefDice, RefTable } from '../../src/systems/dungeon/referenceTables';
import type { DungeonTables } from '../../src/systems/dungeon/tables';

const mk = (dice: RefDice | null, rolls: string[]): RefTable => ({
  name: 'Made-up', group: 'generic', page: 1, dice, columns: ['Roll', 'Result'],
  rows: rolls.map((r, i) => (dice === null ? { cells: [`r${i}`] } : { roll: r, cells: [`r${i}`] })),
});
const d6 = mk('d6', ['1-2', '3', '4-6', '7+']);

describe('naturalTotal', () => {
  it('reads faces per dice', () => {
    expect(naturalTotal('d3', [1])).toBe(1);
    expect(naturalTotal('d3', [3])).toBe(2);
    expect(naturalTotal('d3', [4])).toBe(2);
    expect(naturalTotal('d3', [6])).toBe(3);
    expect(naturalTotal('d3', [7])).toBeNull();
    expect(naturalTotal('d3', [0])).toBeNull();
    expect(naturalTotal('d6', [6])).toBe(6);
    expect(naturalTotal('d6', [0])).toBeNull();
    expect(naturalTotal('d6', [1, 2])).toBeNull();
    expect(naturalTotal('2d6', [3, 4])).toBe(7);
    expect(naturalTotal('2d6', [3])).toBeNull();
    expect(naturalTotal('d66', [2, 5])).toBe(25);
    expect(naturalTotal('d66', [2, 7])).toBeNull();
    expect(naturalTotal('d6', [1.5])).toBeNull();
  });
});

describe('rollReference', () => {
  it('adds the modifier and finds the row', () => {
    expect(rollReference(d6, [4], -1)).toEqual({ natural: 4, modifier: -1, total: 3, clamped: 3, row: 1 });
  });
  it('clamps low totals to the lowest row', () => {
    expect(rollReference(d6, [1], -2)).toEqual({ natural: 1, modifier: -2, total: -1, clamped: 1, row: 0 });
  });
  it('lands on an open-ended row', () => {
    expect(rollReference(d6, [6], 3)).toMatchObject({ total: 9, clamped: 9, row: 3 });
  });
  it('rolls 2d6', () => {
    expect(rollReference(mk('2d6', ['2-6', '7-12']), [3, 4], 0)).toMatchObject({ natural: 7, row: 1 });
  });
  it('d66 ignores the modifier', () => {
    const t = mk('d66', ['11-25', '26-66']);
    expect(rollReference(t, [2, 5], 9)).toEqual({ natural: 25, modifier: 0, total: 25, clamped: 25, row: 0 });
    expect(rollReference(t, [2, 7], 0)).toBeNull();
  });
  it('a natural total no row covers is no row, not clamped', () => {
    const t = mk('d66', ['11-36', '41-56']);
    expect(rollReference(t, [6, 1], 0)).toEqual({ natural: 61, modifier: 0, total: 61, clamped: 61, row: null });
    const d = mk('d6', ['1-2', '3-4']);
    expect(rollReference(d, [6], -1)).toMatchObject({ total: 5, clamped: 5, row: null });
  });
  it('a total that lands on a row uses it even when the natural total has none', () => {
    const d = mk('d6', ['1-2', '3-4']);
    expect(rollReference(d, [5], -1)).toMatchObject({ total: 4, clamped: 4, row: 1 });
  });
  it('clamps only when the modifier moved the total off the table', () => {
    const t = mk('2d6', ['2-6', '7-12']);
    expect(rollReference(t, [6, 6], 3)).toMatchObject({ total: 15, clamped: 12, row: 1 });
    expect(rollReference(t, [1, 1], -4)).toMatchObject({ total: -2, clamped: 2, row: 0 });
  });
  it('a natural total in the rows still clamps a modified total in no row', () => {
    const d = mk('d6', ['1-2', '3-4']);
    expect(rollReference(d, [4], 2)).toMatchObject({ total: 6, clamped: 4, row: 1 });
  });
  it('reports a gap as row null', () => {
    expect(rollReference(mk('d6', ['1', '3', '6']), [2], 0)).toMatchObject({ total: 2, clamped: 2, row: null });
  });
  it('d3 reads a D6 face in halves, keeps the face, and rejects 7', () => {
    const t = mk('d3', ['1', '2', '3']);
    expect(rollReference(t, [5], 0)).toMatchObject({ natural: 3, d3Face: 5, row: 2 });
    expect(rollReference(t, [4], 0)).toMatchObject({ natural: 2, d3Face: 4, row: 1 });
    expect(rollReference(t, [2], 1)).toMatchObject({ natural: 1, total: 2, row: 1 });
    expect(rollReference(t, [7], 0)).toBeNull();
    expect(rollReference(mk('d6', ['1-6']), [5], 0)).not.toHaveProperty('d3Face');
  });
  it('a list is not rollable', () => {
    expect(rollReference(mk(null, ['']), [1], 0)).toBeNull();
  });
});

describe('findTable', () => {
  const t = fixture as unknown as DungeonTables;
  it('finds a code case-insensitively', () => {
    expect(findTable(t, 'xx1')?.code).toBe('XX1');
    expect(findTable(t, 'XX2')?.table.name).toBe('Practice Trinket Table');
  });
  it('returns null when absent', () => {
    expect(findTable(t, 'NOPE')).toBeNull();
    expect(findTable(null, 'XX1')).toBeNull();
  });
});
