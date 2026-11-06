import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script helper without types
import { cardNames, containsName, tableNames } from '../../scripts/dist-guard.mjs';

describe('dist guard helpers', () => {
  it('reads names from data.tables', () => {
    const data = { tables: { weapons: [{ name: 'Zorgblade', manoeuvres: [{ name: 'Wobbly Poke' }] }], startingArmour: [{ name: 'Tin Hat' }], startingScrolls: [{ name: 'Fizz' }, { name: 'Rat' }] } };
    expect(tableNames(data)).toEqual(['Zorgblade', 'Wobbly Poke', 'Tin Hat', 'Fizz'].filter((n) => n.length >= 4));
    expect(tableNames({ weapons: [{ name: 'Zorgblade' }] })).toEqual([]);
  });
  it('reads card names, skipping short ones', () => {
    expect(cardNames({ cards: [{ name: 'Bog Lord' }, { name: 'Rat' }] })).toEqual(['Bog Lord']);
  });
  it('matches whole names only', () => {
    expect(containsName('x="Rations"', 'Rat')).toBe(false);
    expect(containsName('Import', 'Imp')).toBe(false);
    expect(containsName('x="Bog Lord";', 'Bog Lord')).toBe(true);
    expect(containsName('a(b)', 'a(b)')).toBe(true);
  });
});

describe('book terms (made-up data)', () => {
  // @ts-expect-error plain .mjs script helper without types
  const load = () => import('../../scripts/dist-guard.mjs');
  const tables = {
    tables: {
      weapons: [{ name: 'Zorgblade', manoeuvres: [{ name: 'Wobbly Poke' }] }],
      startingArmour: [{ name: 'Tin Hat' }],
      startingScrolls: [{ name: 'Fizzle Scroll' }],
      gods: ['Mogg the Damp'],
      potions: [{ name: 'Draught of Murk' }],
      throwingWeapons: [{ name: 'Spikeling' }],
      potionBombs: [{ name: 'Fizz Jar' }],
      dungeonLevels: [{ name: 'Mossy Deeps', rooms: { 11: { type: 'Bone Larder' } }, smallRooms: { 2: { type: 'Nook of Teeth' } }, largeRooms: {} }],
      exitTables: { QX7: {} },
      creatureTables: { ZZ3P: {} },
      creatures: { 'Bog Lurker': {} },
      referenceTables: { 'qq-table-2': { name: 'Wobble Table 2' } },
    },
  };
  it('collects codes, names and room and level names, and leaves out allowed words', async () => {
    const { bookTerms } = await load();
    const terms = bookTerms({ tables, pack: { cards: [{ name: 'Gloom Crab' }] }, nameMaps: [{ '1:1': 'Herb of Ash' }], allow: ['Tin Hat'] });
    for (const t of ['Zorgblade', 'Wobbly Poke', 'Fizzle Scroll', 'Mogg the Damp', 'Draught of Murk', 'Spikeling', 'Fizz Jar', 'Mossy Deeps', 'Bone Larder', 'Nook of Teeth', 'QX7', 'ZZ3P', 'Bog Lurker', 'qq-table-2', 'Wobble Table 2', 'Gloom Crab', 'Herb of Ash']) {
      expect(terms).toContain(t);
    }
    expect(terms).not.toContain('Tin Hat');
  });
  it('keeps short codes with a digit but drops other short names', async () => {
    const { bookTerms } = await load();
    const terms = bookTerms({ tables: { tables: { exitTables: { QX7: {} }, creatures: { Rat: {} } } } });
    expect(terms).toContain('QX7');
    expect(terms).not.toContain('Rat');
  });
  it('findTerms reports each whole-word hit once', async () => {
    const { findTerms } = await load();
    expect(findTerms('the Bone Larder and Bone Larders, QX7 and QX77', ['Bone Larder', 'QX7', 'Mogg'])).toEqual(['Bone Larder', 'QX7']);
  });
  it('addedLines keeps only lines a diff adds, with their file', async () => {
    const { addedLines } = await load();
    const diff = ['diff --git a/x.md b/x.md', '--- a/x.md', '+++ b/x.md', '@@ -1 +1 @@', '-old Bone Larder', '+new line', ' context'].join('\n');
    expect(addedLines(diff)).toEqual([{ file: 'x.md', text: 'new line' }]);
  });
});
