import { describe, expect, it } from 'vitest';
import { knownPotions, potionInRow } from '../../src/systems/dungeon/potions';
import type { DungeonTables } from '../../src/systems/dungeon/tables';

const tables = (extra: Partial<DungeonTables['tables']>) =>
  ({ tables: { starting: { potions: [{ name: 'Potion of Mild Fizz', effect: 'Made-up: heals 1 HP.' }] }, ...extra } }) as unknown as DungeonTables;

describe('known potions', () => {
  it('lists the starting potions, the potion list and the potion bombs, each name once', () => {
    const t = tables({
      potions: [
        { name: 'potion of mild fizz', effect: 'A second copy, left out.' },
        { name: 'Potion of Glow', effect: 'Made-up: you glow.' },
      ],
      potionBombs: [{ name: 'Fizz Jar', effect: 'Made-up: it fizzes.', damage: '2D6 +1' }],
    });
    expect(knownPotions(t)).toEqual([
      {
        label: 'Potions',
        items: [
          { name: 'Potion of Glow', effect: 'Made-up: you glow.' },
          { name: 'Potion of Mild Fizz', effect: 'Made-up: heals 1 HP.' },
        ],
      },
      { label: 'Potion bombs', items: [{ name: 'Fizz Jar', effect: 'Made-up: it fizzes.' }] },
    ]);
  });
  it('leaves out empty groups, and has nothing without a table file', () => {
    expect(knownPotions(tables({}))).toEqual([{ label: 'Potions', items: [{ name: 'Potion of Mild Fizz', effect: 'Made-up: heals 1 HP.' }] }]);
    expect(knownPotions(null)).toEqual([]);
  });
});

describe('potion in a rolled row', () => {
  const t = tables({
    potions: [{ name: 'Potion of Glow', effect: 'Made-up: you glow.' }],
    potionBombs: [{ name: 'Fizz Jar', effect: 'Made-up: it fizzes.', damage: '2D6 +1' }],
  });
  it("finds a known potion by name, whatever the capitals, and gives the list's name and effect", () => {
    expect(potionInRow(t, ['  POTION OF GLOW '])).toEqual({ name: 'Potion of Glow', effect: 'Made-up: you glow.' });
    expect(potionInRow(t, ['potion of mild fizz'])).toEqual({ name: 'Potion of Mild Fizz', effect: 'Made-up: heals 1 HP.' });
  });
  it('finds a potion bomb, and looks past cells that are not potions', () => {
    expect(potionInRow(t, ['3 GC', 'FIZZ JAR'])).toEqual({ name: 'Fizz Jar', effect: 'Made-up: it fizzes.' });
  });
  it('has nothing for a row naming no known potion, or without a table file', () => {
    expect(potionInRow(t, ['POTION OF NOTHING MUCH'])).toBeNull();
    expect(potionInRow(t, ['Potion of Glow and a rope'])).toBeNull();
    expect(potionInRow(null, ['Potion of Glow'])).toBeNull();
  });
});
