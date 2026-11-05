import { describe, expect, it } from 'vitest';
import { knownPotions } from '../../src/systems/dungeon/potions';
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
