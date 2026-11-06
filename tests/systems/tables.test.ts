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

describe('creature tables and creatures', () => {
  const D = 'The table file is damaged: ';
  it("parses the fixture's creature tables", () => {
    const r = parse(clone());
    expect(r.ok).toBe(true);
    if (r.ok) expect(Object.keys(r.tables.tables.creatureTables!.PRAC1!)).toEqual(['1', '2', '3', '4', '5', '6']);
  });
  it('refuses a missing key', () => {
    const o = clone(); delete o.tables.creatureTables.PRAC1['4'];
    expect(err(parse(o))).toBe(D + 'Creature Tables PRAC1 4');
  });
  it('refuses an extra key', () => {
    const o = clone(); o.tables.creatureTables.PRAC1['7'] = { text: 'x' };
    expect(err(parse(o))).toBe(D + 'Creature Tables PRAC1 7 (not a valid key)');
  });
  it('refuses an entry with neither creatures nor text', () => {
    const o = clone(); o.tables.creatureTables.PRAC1['2'] = {};
    expect(err(parse(o))).toBe(D + 'Creature Tables PRAC1 2');
  });
  it('refuses an empty creatures list', () => {
    const o = clone(); o.tables.creatureTables.PRAC1['2'] = { creatures: [] };
    expect(err(parse(o))).toBe(D + 'Creature Tables PRAC1 2 creatures (empty)');
  });
  it('refuses a creature not in Creatures, ignoring case', () => {
    const o = clone(); delete o.tables.creatures.Grumbler;
    expect(err(parse(o))).toBe(D + 'Creature Tables PRAC1 2 (no creature named Grumbler in Creatures)');
    const p = clone(); p.tables.creatureTables.PRAC1['2'] = { creatures: ['Grumbler', 'moss lurker'] };
    expect(parse(p).ok).toBe(true);
    const q = clone(); q.tables.creatureTables.PRAC1['2'] = { creatures: ['Grumbler'] };
    q.tables.creatureTables.PRAC1['1'] = { creatures: ['Zorp'] };
    expect(err(parse(q))).toBe(D + 'Creature Tables PRAC1 1 (no creature named Zorp in Creatures)');
  });
  it('checks creature stats', () => {
    const a = clone(); a.tables.creatures.Grumbler.hp = -1;
    expect(err(parse(a))).toBe(D + 'Creatures Grumbler hp');
    const b = clone(); b.tables.creatures.Grumbler.shift = -1;
    expect(parse(b).ok).toBe(true);
    const c = clone(); c.tables.creatures.Grumbler.level = 11;
    expect(err(parse(c))).toBe(D + 'Creatures Grumbler level (must be a whole number from 1 to 10)');
    const d = clone(); d.tables.creatures.Grumbler.treasure = 3;
    expect(err(parse(d))).toBe(D + 'Creatures Grumbler treasure');
  });
  it('takes optional combat details from the creature card', () => {
    const o = clone();
    o.tables.creatures.Grumbler = {
      ...o.tables.creatures.Grumbler,
      manoeuvres: [{ name: 'Pebble Toss', dice: [3, 4], damage: 'D6 -2 damage' }],
      interrupts: [
        { name: 'Moss Cloak', side: 'secondary', dice: [2, 5], modifier: -1 },
        { name: 'Hop Aside', side: 'primary', dice: [6], modifier: -2, movement: true, effect: 'Made-up: it lands behind you.' },
      ],
      mishap: 'Made-up: it trips.',
      prime: 'Made-up: it shouts.',
    };
    const r = parse(o);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tables.tables.creatures!.Grumbler!.interrupts![1]!.movement).toBe(true);
  });
  it('checks the combat details', () => {
    const at = 'Creatures Grumbler';
    const bad = (patch: Record<string, unknown>, msg: string) => {
      const o = clone();
      Object.assign(o.tables.creatures.Grumbler, patch);
      expect(err(parse(o))).toBe(D + `${at} ${msg}`);
    };
    bad({ manoeuvres: {} }, 'manoeuvres');
    bad({ manoeuvres: [{ name: 'x', dice: [3], damage: 'D6' }] }, 'manoeuvres 1 dice');
    bad({ manoeuvres: [{ name: '', dice: [3, 4], damage: 'D6' }] }, 'manoeuvres 1 name (empty)');
    bad({ manoeuvres: [{ name: 'x', dice: [3, 4] }] }, 'manoeuvres 1 damage');
    bad({ interrupts: [{ name: 'x', side: 'left', dice: [1], modifier: -1 }] }, 'interrupts 1 side');
    bad({ interrupts: [{ name: 'x', side: 'primary', dice: [], modifier: -1 }] }, 'interrupts 1 dice');
    bad({ interrupts: [{ name: 'x', side: 'primary', dice: [7], modifier: -1 }] }, 'interrupts 1 dice');
    bad({ interrupts: [{ name: 'x', side: 'primary', dice: [1], modifier: 1 }] }, 'interrupts 1 modifier');
    bad({ interrupts: [{ name: 'x', side: 'primary', dice: [1], modifier: -1, movement: 'yes' }] }, 'interrupts 1 movement');
    bad({ interrupts: [{ name: 'x', side: 'primary', dice: [1], modifier: -1, effect: 3 }] }, 'interrupts 1 effect');
    bad({ mishap: 3 }, 'mishap');
    bad({ prime: null }, 'prime');
  });
  it('still parses a file with neither key', () => {
    const o = clone(); delete o.tables.creatureTables; delete o.tables.creatures; delete o.tables.dungeonLevels[0].patrolTable;
    expect(parse(o).ok).toBe(true);
  });
});

describe('throwing weapons and potion bombs', () => {
  const D = 'The table file is damaged: ';
  it('takes both optional lists', () => {
    const o = clone();
    o.tables.throwingWeapons = [{ name: 'Spike', damage: 5, aliases: ['spikes'] }];
    o.tables.potionBombs = [
      { name: 'Fizz Jar', effect: 'Made-up: it fizzes.', damage: '2D6 +1' },
      { name: 'Glare Phial', effect: 'Made-up: a glare.', noAttack: true },
    ];
    o.tables.potions = [{ name: 'Potion of Glow', effect: 'Made-up: you glow.' }];
    expect(parse(o).ok).toBe(true);
  });
  it('checks them', () => {
    const bad = (key: string, v: unknown, msg: string) => {
      const o = clone();
      o.tables[key] = v;
      expect(err(parse(o))).toBe(D + msg);
    };
    bad('throwingWeapons', {}, 'Throwing Weapons');
    bad('throwingWeapons', [{ name: '', damage: 1 }], 'Throwing Weapons 1 name (empty)');
    bad('throwingWeapons', [{ name: 'x', damage: -1 }], 'Throwing Weapons 1 damage');
    bad('throwingWeapons', [{ name: 'x', damage: 1, aliases: [''] }], 'Throwing Weapons 1 aliases');
    bad('potionBombs', [{ name: 'x' }], 'Potion Bombs 1 effect');
    bad('potionBombs', [{ name: 'x', effect: '', damage: 3 }], 'Potion Bombs 1 damage');
    bad('potionBombs', [{ name: 'x', effect: '', damagePerLevel: 'a' }], 'Potion Bombs 1 damagePerLevel');
    bad('potionBombs', [{ name: 'x', effect: '', noAttack: 1 }], 'Potion Bombs 1 noAttack');
    bad('potions', {}, 'Potions');
    bad('potions', [{ name: '', effect: '' }], 'Potions 1 name (empty)');
    bad('potions', [{ name: 'x' }], 'Potions 1 effect');
  });
});

describe('recovery table', () => {
  const D = 'The table file is damaged: ';
  it('takes the id of a rollable reference table', () => {
    const o = clone();
    o.tables.recoveryTable = 'XX2';
    expect(parse(o).ok).toBe(true);
  });
  it('checks it', () => {
    const bad = (v: unknown, msg: string) => {
      const o = clone();
      o.tables.recoveryTable = v;
      expect(err(parse(o))).toBe(D + msg);
    };
    bad(7, 'Recovery Table');
    bad('NOPE', 'Recovery Table (no table named NOPE in Reference Tables)');
    bad('LIST1', 'Recovery Table (LIST1 is a list with no dice)');
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

describe('door locks and patrol tables', () => {
  const withLocks = (doorLocks: unknown, patrolTable?: unknown) => {
    const o = clone();
    if (doorLocks !== undefined) o.tables.doorLocks = doorLocks;
    if (patrolTable !== undefined) o.tables.dungeonLevels[0].patrolTable = patrolTable;
    return o;
  };
  it('accepts lock numbers and a level patrol table', () => {
    expect(parse(withLocks({ wooden: 6, metal: 4, reinforced: 5 }, 'PRAC1')).ok).toBe(true);
  });
  it('still loads a file without them', () => {
    const o = clone();
    delete o.tables.doorLocks;
    delete o.tables.dungeonLevels[0].patrolTable;
    expect(parse(o).ok).toBe(true);
  });
  it('refuses a lock number outside 1-6', () => {
    expect(err(parse(withLocks({ metal: 7 })))).toContain('Door Locks metal (a whole number from 1 to 6)');
  });
  it('refuses a door type that is never locked', () => {
    expect(err(parse(withLocks({ archway: 3 })))).toContain('Door Locks archway (only wooden, metal or reinforced)');
  });
  it('refuses door locks that are not an object', () => {
    expect(err(parse(withLocks([])))).toContain('Door Locks');
  });
  it('refuses a patrol table that is not a creature table', () => {
    expect(err(parse(withLocks(undefined, 'NOPE')))).toContain('Dungeon Levels[0] patrolTable (no table named NOPE in Creature Tables)');
  });
});
