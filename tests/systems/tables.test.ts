import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/dungeon-tables.fixture.json';
import { MAX_TABLE_FILE_BYTES, parseTableFile, validateTableFile } from '../../src/systems/dungeon/tables';

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
  const bad = (mutate: (o: any) => void, place?: RegExp) => {
    const o = clone(); mutate(o);
    const e = err(parse(o));
    expect(e).toMatch(/^The table file is damaged: /);
    if (place) expect(e).toMatch(place);
  };
  it('requires null xpToLevelUp on the last level only, strictly increasing', () => {
    bad((o) => { o.tables.levels[2].xpToLevelUp = 50; }, /Levels\[2\] xpToLevelUp/);
    bad((o) => { o.tables.levels[0].xpToLevelUp = null; }, /Levels\[0\] xpToLevelUp/);
    bad((o) => { o.tables.levels[1].xpToLevelUp = 10; }, /Levels\[1\] xpToLevelUp/);
    bad((o) => { o.tables.levels[0].xpToLevelUp = 1.5; }, /Levels\[0\] xpToLevelUp/);
  });
  it('requires consecutive levels from 1 and a matching starting level', () => {
    bad((o) => { o.tables.levels[0].level = 2; });
    bad((o) => { o.tables.levels[2].level = 4; }, /Levels\[2\] level/);
    bad((o) => { o.tables.starting.level = 9; }, /Starting Values level/);
  });
  it('requires positive levels', () => {
    bad((o) => { o.tables.levels[1].maxManoeuvreLevel = 0; }, /maxManoeuvreLevel/);
    bad((o) => { o.tables.starting.level = 0; });
    bad((o) => { o.tables.weapons[0].manoeuvres[0].level = 0; }, /Weapons\[0\] manoeuvre 1 level/);
  });
  it('requires non-empty lists but allows empty kit and potions', () => {
    for (const k of ['weapons', 'startingArmour', 'startingScrolls', 'gods']) bad((o) => { o.tables[k] = []; });
    const o = clone(); o.tables.starting.kit = []; o.tables.starting.potions = [];
    expect(parse(o).ok).toBe(true);
  });
  it('names the place of a problem', () => {
    bad((o) => { o.tables.weapons[1].manoeuvres[2].dice = [1, 9]; }, /Weapons\[1\] manoeuvre 3 dice/);
  });
  it('refuses odd values', () => {
    bad((o) => { o.tables.limits.potions = -1; }, /Limits potions/);
    bad((o) => { o.tables.favourBoxes = 2.5; }, /Favour Boxes/);
    bad((o) => { o.tables.gods[0] = 5; }, /Gods\[0\]/);
    bad((o) => { o.tables.weapons[0].name = 5; });
    bad((o) => { o.tables.limits = null; });
    bad((o) => { o.tables.conditions = null; });
  });
  it('refuses format 0 and 1.5', () => {
    bad((o) => { o.format = 0; });
    bad((o) => { o.format = 1.5; });
  });
});

describe('room and exit tables', () => {
  it('parses the fixture with a dungeon level and exit table', () => {
    const r = parseTableFile(text, text.length);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.tables.tables.dungeonLevels?.[0]?.name).toBe('Test Halls');
      expect(Object.keys(r.tables.tables.exitTables ?? {})).toEqual(['EXT1']);
    }
  });
  it('refuses a missing D66 key in rooms, naming it', () => {
    const o = clone(); delete o.tables.dungeonLevels[0].rooms['34'];
    expect(err(parse(o))).toBe('The table file is damaged: Dungeon Levels[0] rooms 34');
  });
  it('refuses a missing key in an exit table, small rooms and large rooms', () => {
    const o = clone(); delete o.tables.exitTables.EXT1['66'];
    expect(err(parse(o))).toBe('The table file is damaged: Exit Tables EXT1 66');
    const p = clone(); delete p.tables.dungeonLevels[0].smallRooms['7'];
    expect(err(parse(p))).toBe('The table file is damaged: Dungeon Levels[0] smallRooms 7');
    const q = clone(); delete q.tables.dungeonLevels[0].largeRooms['12'];
    expect(err(parse(q))).toBe('The table file is damaged: Dungeon Levels[0] largeRooms 12');
  });
  it('refuses an unknown door id and lists the allowed ones', () => {
    const o = clone(); o.tables.dungeonLevels[0].rooms['23'].exit = { door: 'trapdoor' };
    expect(err(parse(o))).toBe(
      'The table file is damaged: Dungeon Levels[0] rooms 23 exit — use one of archway, wooden, metal, reinforced, curtain, portcullis, stoneSlab',
    );
    const p = clone(); p.tables.exitTables.EXT1['11'] = 'random';
    expect(err(parse(p))).toMatch(/Exit Tables EXT1 11/);
  });
  it('refuses extra keys in rooms, exit tables and smallRooms', () => {
    const o = clone(); o.tables.dungeonLevels[0].rooms['67'] = o.tables.dungeonLevels[0].rooms['11'];
    expect(err(parse(o))).toBe('The table file is damaged: Dungeon Levels[0] rooms 67 (not a valid key)');
    const p = clone(); p.tables.exitTables.EXT1['70'] = { door: 'archway' };
    expect(err(parse(p))).toBe('The table file is damaged: Exit Tables EXT1 70 (not a valid key)');
    const q = clone(); q.tables.dungeonLevels[0].smallRooms['13'] = q.tables.dungeonLevels[0].smallRooms['2'];
    expect(err(parse(q))).toBe('The table file is damaged: Dungeon Levels[0] smallRooms 13 (not a valid key)');
  });
  it('refuses an inherited name as exitTable', () => {
    const o = clone(); o.tables.dungeonLevels[0].exitTable = 'constructor';
    expect(err(parse(o))).toMatch(/Dungeon Levels\[0\] exitTable/);
  });
  it('refuses a non-boolean locked', () => {
    const o = clone(); o.tables.dungeonLevels[0].rooms['11'].exit = { door: 'wooden', locked: 'yes' };
    expect(err(parse(o))).toBe('The table file is damaged: Dungeon Levels[0] rooms 11 locked (true or false)');
  });
  it('refuses an exitTable that names no table', () => {
    const o = clone(); o.tables.dungeonLevels[0].exitTable = 'EXQ9';
    expect(err(parse(o))).toBe('The table file is damaged: Dungeon Levels[0] exitTable (no table named EXQ9 in Exit Tables)');
  });
  it('refuses a duplicate or out-of-range level', () => {
    const o = clone(); o.tables.dungeonLevels.push(structuredClone(o.tables.dungeonLevels[0]));
    expect(err(parse(o))).toMatch(/Dungeon Levels\[1\] level/);
    const p = clone(); p.tables.dungeonLevels[0].level = 11;
    expect(err(parse(p))).toMatch(/Dungeon Levels\[0\] level/);
  });
  it('refuses bad text fields', () => {
    const o = clone(); o.tables.dungeonLevels[0].rooms['11'].encounter = 3;
    expect(err(parse(o))).toBe('The table file is damaged: Dungeon Levels[0] rooms 11 encounter');
  });
  it('still parses a file with no dungeon levels or exit tables', () => {
    const o = clone(); delete o.tables.dungeonLevels; delete o.tables.exitTables;
    expect(parse(o).ok).toBe(true);
  });
});

describe('docs/table-file-format.md', () => {
  it('the inline example is a valid table file', () => {
    const doc = readFileSync('docs/table-file-format.md', 'utf8');
    const block = /complete, valid example[^`]*```json\n([\s\S]*?)\n```/.exec(doc)?.[1];
    expect(block).toBeTruthy();
    expect(validateTableFile(JSON.parse(block!)).ok).toBe(true);
  });
});
