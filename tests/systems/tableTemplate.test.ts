import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/dungeon-tables.fixture.json';
import { blankTableFile, TEMPLATE_FILE_NAME } from '../../src/systems/dungeon/template';
import { validateTableFile } from '../../src/systems/dungeon/tables';

const D66 = [1, 2, 3, 4, 5, 6].flatMap((a) => [1, 2, 3, 4, 5, 6].map((b) => `${a}${b}`));
const TWO_D6 = Array.from({ length: 11 }, (_, i) => String(i + 2));
const err = (o: unknown) => {
  const r = validateTableFile(o);
  return r.ok ? '' : r.error;
};
/** Every string value in the template, for the no-content check. */
const strings = (v: unknown): string[] =>
  typeof v === 'string' ? [v] : Array.isArray(v) ? v.flatMap(strings) : v && typeof v === 'object' ? Object.values(v).flatMap(strings) : [];

describe('blankTableFile', () => {
  it('has the file header and every table, including the room tables', () => {
    const t = blankTableFile();
    expect(t.format).toBe(1);
    expect(t.systemId).toBe('dungeon');
    expect(Object.keys(t.tables).sort()).toEqual(
      ['conditions', 'creatureTables', 'creatures', 'dungeonLevels', 'exitTables', 'favourBoxes', 'gods', 'levels', 'limits', 'referenceTables', 'starting', 'startingArmour', 'startingScrolls', 'weapons'].sort(),
    );
    expect(TEMPLATE_FILE_NAME).toMatch(/\.json$/);
  });

  it('has every dice key in the room and exit tables', () => {
    const t = blankTableFile();
    const lvl = t.tables.dungeonLevels[0]!;
    expect(Object.keys(lvl.rooms)).toEqual(D66);
    expect(Object.keys(lvl.smallRooms)).toEqual(TWO_D6);
    expect(Object.keys(lvl.largeRooms)).toEqual(TWO_D6);
    expect(Object.keys(t.tables.exitTables[lvl.exitTable]!)).toEqual(D66);
  });

  it('has one creature table with keys 1-6 and one blank creature row', () => {
    const t = blankTableFile();
    expect(Object.keys(t.tables.creatureTables)).toEqual(['L1X']);
    expect(Object.keys(t.tables.creatureTables.L1X!)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(t.tables.creatureTables.L1X!['1']).toEqual({ creatures: [''] });
    expect(t.tables.creatures).toEqual({ '': { level: null, hp: null, xp: null, shift: null, treasure: '' } });
  });

  it('has one blank reference list, XX1, refused until filled in', () => {
    const t = blankTableFile();
    expect(t.tables.referenceTables).toEqual({
      XX1: { name: '', group: '', page: null, dice: null, columns: [''], rows: [{ cells: [''] }] },
    });
    const f = fixture as any;
    const o = { ...t, tables: { ...f.tables, referenceTables: t.tables.referenceTables } };
    expect(err(o)).toBe('The table file is damaged: Reference Tables XX1 name (empty)');
  });

  it('holds no text at all except the file name and the exit table name', () => {
    const t = blankTableFile();
    const nonEmpty = strings(t).filter((s) => s !== '');
    expect(new Set(nonEmpty)).toEqual(new Set(['dungeon', t.name, 'EXT1']));
  });

  it('is refused as it stands, pointing at the first blank value', () => {
    expect(err(blankTableFile())).toBe('The table file is damaged: Starting Values level');
  });

  it('is accepted once every blank is filled in', () => {
    const t = blankTableFile() as any;
    const f = fixture as any;
    t.tables = { ...f.tables, dungeonLevels: t.tables.dungeonLevels, exitTables: t.tables.exitTables, creatureTables: t.tables.creatureTables, creatures: t.tables.creatures };
    t.tables.creatures = { Grumbler: { level: 1, hp: 4, xp: 2, shift: 0, treasure: '' } };
    for (const e of Object.values(t.tables.creatureTables.L1X) as any[]) e.creatures = ['Grumbler'];
    for (const e of Object.values(t.tables.exitTables.EXT1) as any[]) e.door = 'archway';
    const lvl = t.tables.dungeonLevels[0];
    for (const table of [lvl.rooms, lvl.smallRooms, lvl.largeRooms]) {
      for (const e of Object.values(table) as any[]) {
        e.type = 'Made-up Room';
        e.unique = false;
        if ('exit' in e) e.exit = 'random';
      }
    }
    expect(err(t)).toBe('');
  });

  it('returns a fresh copy each time', () => {
    const a = blankTableFile();
    a.tables.gods.push('x');
    expect(blankTableFile().tables.gods).toEqual(['']);
  });
});

describe('validation of names left blank', () => {
  const clone = () => JSON.parse(JSON.stringify(fixture));
  it('refuses an empty weapon name', () => {
    const o = clone(); o.tables.weapons[0].name = ' ';
    expect(err(o)).toBe('The table file is damaged: Weapons[0] name (empty)');
  });
  it('refuses an empty god', () => {
    const o = clone(); o.tables.gods = [''];
    expect(err(o)).toBe('The table file is damaged: Gods[0] (empty)');
  });
  it('refuses an empty kit item', () => {
    const o = clone(); o.tables.starting.kit = [''];
    expect(err(o)).toBe('The table file is damaged: Starting Values kit[0] (empty)');
  });
});
