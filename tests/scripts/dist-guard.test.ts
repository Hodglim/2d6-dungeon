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
