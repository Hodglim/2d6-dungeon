import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/dungeon-tables.fixture.json';
import type { RefRoll } from '../../src/systems/dungeon/referenceTables';
import type { DungeonTables } from '../../src/systems/dungeon/tables';
import { goBack, initialTablesState, openTable, searchTables, setModifier, setResult, showList } from '../../src/ui/tables/tablesState';

const tables = JSON.parse(JSON.stringify(fixture)) as DungeonTables;
const roll = (row: number | null): RefRoll => ({ natural: 2, modifier: -1, total: 1, clamped: 1, row });

describe('openTable', () => {
  it('opens a table with modifier 0 by default and pushes nothing from the list', () => {
    const s = openTable(initialTablesState, 'XX1');
    expect(s.open).toBe('XX1');
    expect(s.modifier.XX1).toBe(0);
    expect(s.back).toEqual([]);
  });
  it('pushes the previous table and its modifier, and sets the new modifier', () => {
    let s = openTable(initialTablesState, 'XX1');
    s = setModifier(s, 'XX1', -1);
    s = openTable(s, 'XX2', 1);
    expect(s.open).toBe('XX2');
    expect(s.modifier.XX2).toBe(1);
    expect(s.back).toEqual([{ code: 'XX1', modifier: -1 }]);
  });
  it('does not push a duplicate when the same table opens again', () => {
    let s = openTable(initialTablesState, 'XX1');
    s = openTable(s, 'XX1', 2);
    expect(s.back).toEqual([]);
    expect(s.modifier.XX1).toBe(2);
  });
  it('does not change the state it is given', () => {
    const s = openTable(initialTablesState, 'XX1');
    openTable(s, 'XX2', 1);
    expect(s.open).toBe('XX1');
    expect(s.back).toEqual([]);
    expect(initialTablesState.open).toBeNull();
  });
});

describe('goBack', () => {
  it('restores the previous table and modifier and keeps its result', () => {
    let s = openTable(initialTablesState, 'XX1');
    s = setModifier(s, 'XX1', -1);
    s = setResult(s, 'XX1', roll(0));
    s = openTable(s, 'XX2', 1);
    s = setModifier(s, 'XX1', 5); // anything that touched it meanwhile is undone by Back
    s = goBack(s);
    expect(s.open).toBe('XX1');
    expect(s.modifier.XX1).toBe(-1);
    expect(s.results.XX1).toEqual(roll(0));
    expect(s.back).toEqual([]);
  });
  it('does nothing with an empty back stack', () => {
    const s = openTable(initialTablesState, 'XX1');
    expect(goBack(s)).toBe(s);
  });
});

describe('setResult and showList', () => {
  it('keeps a result per table', () => {
    let s = setResult(initialTablesState, 'XX1', roll(0));
    s = setResult(s, 'XX2', roll(null));
    expect(s.results.XX1!.row).toBe(0);
    expect(s.results.XX2!.row).toBeNull();
  });
  it('showList closes the table and clears the back stack, keeping results', () => {
    let s = openTable(initialTablesState, 'XX1');
    s = setResult(s, 'XX1', roll(0));
    s = openTable(s, 'XX2');
    s = showList(s);
    expect(s.open).toBeNull();
    expect(s.back).toEqual([]);
    expect(s.results.XX1).toBeDefined();
  });
});

describe('searchTables', () => {
  const codes = (q: string, g: Parameters<typeof searchTables>[2] = 'all') => searchTables(tables, q, g).map((r) => r.code);
  it('lists everything, ordered by group then page then code', () => {
    // generic XX1 (p7) and practice-shelf (p12), random XX3, loot XX2, level XX4, optional LIST1
    expect(codes('')).toEqual(['XX1', 'practice-shelf', 'XX3', 'XX2', 'XX4', 'LIST1']);
  });
  it('matches by code and by name, case-insensitively', () => {
    expect(codes('xx2')).toEqual(['XX2']);
    expect(codes('PRICE')).toEqual(['LIST1']);
    expect(codes('practice')).toEqual(['XX1', 'practice-shelf', 'XX3', 'XX2', 'XX4', 'LIST1']);
    expect(codes('SHELF')).toEqual(['practice-shelf']);
    expect(codes('nothing like it')).toEqual([]);
  });
  it('filters by group', () => {
    expect(codes('', 'loot')).toEqual(['XX2']);
    expect(codes('practice', 'optional')).toEqual(['LIST1']);
    expect(codes('', 'level')).toEqual(['XX4']);
    expect(codes('crate', 'loot')).toEqual([]);
  });
  it('lists no tables under a card kind', () => {
    expect(codes('', 'god')).toEqual([]);
    expect(codes('', 'herb')).toEqual([]);
  });
  it('orders by group before page and by code within a page', () => {
    const t = JSON.parse(JSON.stringify(fixture)) as DungeonTables;
    const ref = t.tables.referenceTables!;
    ref.B2 = { ...ref.XX1!, group: 'random', page: 3 };
    ref.A2 = { ...ref.XX1!, group: 'random', page: 3 };
    ref.Z9 = { ...ref.XX1!, group: 'generic', page: 50 };
    ref.A1 = { ...ref.XX1!, group: 'level', page: 1 };
    expect(searchTables(t, '', 'all').map((r) => r.code)).toEqual(['XX1', 'practice-shelf', 'Z9', 'A2', 'B2', 'XX3', 'XX2', 'A1', 'XX4', 'LIST1']);
  });
  it('is empty with no table file or no reference tables', () => {
    expect(searchTables(null, '', 'all')).toEqual([]);
    const bare = JSON.parse(JSON.stringify(fixture)) as DungeonTables;
    delete bare.tables.referenceTables;
    expect(searchTables(bare, '', 'all')).toEqual([]);
  });
});
