import { describe, expect, it } from 'vitest';
import {
  bombDamage,
  carriedBombs,
  carriedThrowing,
  itemModifier,
  recovers,
  throwDamage,
  type PotionBomb,
  type ThrowingWeapon,
} from '../../src/systems/dungeon/throwing';
import type { CreatureInterrupt } from '../../src/systems/dungeon/tables';

const weapons: ThrowingWeapon[] = [
  { name: 'Pebble Sling', damage: 3, aliases: ['pebble slings'] },
  { name: 'Spike', damage: 5 },
];
const bombs: PotionBomb[] = [
  { name: 'Fizz Jar', effect: 'Made-up: it fizzes.', damage: '2D6 +1' },
  { name: 'Gloom Shell', effect: 'Made-up: gloom.', damagePerLevel: 4 },
  { name: 'Glare Phial', effect: 'Made-up: a glare.', noAttack: true },
];
const hero = {
  largeItems: ['Rope', 'Spike +1'],
  smallItems: ['2 pebble slings', 'Candle'],
  potions: [
    { name: 'Healing Draught', effect: '' },
    { name: 'Fizz Jar', effect: '' },
    { name: 'fizz jar', effect: '' },
  ],
};

describe('throwing weapons and potion bombs', () => {
  it('finds the throwing weapons the hero carries, by name or alias, with any modifier', () => {
    expect(carriedThrowing(hero, weapons)).toEqual([
      { weapon: weapons[1], list: 'largeItems', index: 1, item: 'Spike +1', modifier: 1 },
      { weapon: weapons[0], list: 'smallItems', index: 0, item: '2 pebble slings', modifier: 0 },
    ]);
    expect(itemModifier('Spike -2', 'Spike')).toBe(-2);
    expect(itemModifier('2 pebble slings', 'pebble slings')).toBe(0);
  });
  it('finds each potion bomb once per potion', () => {
    expect(carriedBombs(hero, bombs)).toEqual([
      { bomb: bombs[0], index: 1 },
      { bomb: bombs[0], index: 2 },
    ]);
  });
  it('takes off each matching Interrupt, primary against red and secondary against blue', () => {
    const ints: CreatureInterrupt[] = [
      { name: 'Moss Cloak', side: 'primary', dice: [3], modifier: -2 },
      { name: 'Bark Skin', side: 'secondary', dice: [4], modifier: -1 },
    ];
    expect(throwDamage([1, 1], 5, 1, ints, 1)).toEqual({ damage: 6, hits: [], deflected: false });
    expect(throwDamage([3, 1], 5, 0, ints, 1)).toEqual({ damage: 3, hits: [0], deflected: true });
    expect(throwDamage([3, 4], 5, 0, ints, 1)).toEqual({ damage: 2, hits: [0, 1], deflected: true });
    expect(throwDamage([3, 4], 2, 0, ints, 1)).toEqual({ damage: 0, hits: [0, 1], deflected: true });
  });
  it('works out bomb damage', () => {
    expect(bombDamage(bombs[0]!, 9, 3)).toBe(9);
    expect(bombDamage(bombs[1]!, null, 3)).toBe(12);
    expect(bombDamage(bombs[2]!, null, 3)).toBe(0);
  });
  it('recovers a thrown weapon on 4 to 6', () => {
    expect([1, 2, 3, 4, 5, 6].map(recovers)).toEqual([false, false, false, true, true, true]);
  });
});
