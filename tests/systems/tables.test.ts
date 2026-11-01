import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/dungeon-tables.fixture.json';
import { MAX_TABLE_FILE_BYTES, parseTableFile } from '../../src/systems/dungeon/tables';

const text = JSON.stringify(fixture);
const parse = (o: unknown) => {
  const t = JSON.stringify(o);
  return parseTableFile(t, t.length);
};
const clone = () => JSON.parse(text);
const err = (r: ReturnType<typeof parse>) => (r.ok ? '' : r.error);

describe('parseTableFile', () => {
  it('parses the fixture', () => {
    const r = parseTableFile(text, text.length);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tables.tables.levels).toHaveLength(3);
  });
  it('refuses oversized text', () => {
    expect(err(parseTableFile(text, MAX_TABLE_FILE_BYTES + 1))).toBe('This file is too large to be a table file.');
  });
  it('refuses non-JSON and non-objects', () => {
    expect(err(parseTableFile('nope', 4))).toMatch(/isn't a 2D6 Dungeon table file/);
    expect(err(parse([1]))).toMatch(/isn't a 2D6 Dungeon table file/);
  });
  it('refuses the wrong systemId', () => {
    const o = clone(); o.systemId = 'other';
    expect(err(parse(o))).toBe("This isn't a 2D6 Dungeon table file");
  });
  it('refuses a newer format', () => {
    const o = clone(); o.format = 2;
    expect(err(parse(o))).toBe('Made by a newer version of the app');
  });
  it('names a missing table', () => {
    const o = clone(); delete o.tables.weapons;
    expect(err(parse(o))).toBe('The table file is missing Weapons');
  });
  it('refuses a die face of 7', () => {
    const o = clone(); o.tables.weapons[0].manoeuvres[0].dice = [1, 7];
    expect(err(parse(o))).toMatch(/^The table file is damaged: /);
  });
  it('refuses manoeuvre dice of the wrong length and armour dice of 3', () => {
    const o = clone(); o.tables.weapons[0].manoeuvres[0].dice = [1];
    expect(err(parse(o))).toMatch(/damaged/);
    const p = clone(); p.tables.startingArmour[0].dice = [1, 2, 3];
    expect(err(parse(p))).toMatch(/damaged/);
  });
  it('refuses unsorted or empty levels', () => {
    const o = clone(); o.tables.levels.reverse();
    expect(err(parse(o))).toMatch(/damaged/);
    const p = clone(); p.tables.levels = [];
    expect(err(parse(p))).toMatch(/damaged/);
  });
  it('refuses a weapon with too few level-1 manoeuvres', () => {
    const o = clone(); o.tables.weapons[1].manoeuvres.splice(0, 1);
    expect(err(parse(o))).toMatch(/damaged/);
  });
  it('keeps unknown extra tables', () => {
    const o = clone(); o.tables.extra = { a: 1 };
    const r = parse(o);
    expect(r.ok && (r.tables.tables as Record<string, unknown>).extra).toEqual({ a: 1 });
  });
});
