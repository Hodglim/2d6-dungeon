import { describe, expect, it } from 'vitest';
import { armourGroups, armourModifier, deflects, formatDiceSet, isArmourDice, parseDiceSet } from '../../src/systems/dungeon/armour';

describe('armour dice sets', () => {
  it('reads a dice set as pairs of primary and secondary dice', () => {
    expect(parseDiceSet('4')).toEqual([4]);
    expect(parseDiceSet('6 & 5')).toEqual([6, 5]);
    expect(parseDiceSet('4 & 3 + 1')).toEqual([4, 3, 1]);
    expect(parseDiceSet('6 & 4 + 3 & 3')).toEqual([6, 4, 3, 3]);
    expect(parseDiceSet(' 5&4+3&2 ')).toEqual([5, 4, 3, 2]);
    // A lone primary in front of another group keeps an empty secondary slot.
    expect(parseDiceSet('4 + 2')).toEqual([4, 0, 2]);
  });
  it('rejects anything that is not a dice set', () => {
    for (const bad of ['', '7', '0', '4 &', '& 3', '4 & 3 + 1 + 2', 'x', '4 & 3 & 2']) expect(parseDiceSet(bad)).toBeNull();
  });
  it('groups the dice and writes them back', () => {
    expect(armourGroups([4, 3, 1])).toEqual([[4, 3], [1]]);
    expect(armourGroups([4, 0, 2])).toEqual([[4], [2]]);
    expect(formatDiceSet([4])).toBe('4');
    expect(formatDiceSet([4, 3, 1])).toBe('4 & 3 + 1');
    expect(formatDiceSet([6, 4, 3, 3])).toBe('6 & 4 + 3 & 3');
    expect(formatDiceSet([4, 0, 2])).toBe('4 + 2');
  });
  it('checks stored armour dice', () => {
    expect(isArmourDice([4])).toBe(true);
    expect(isArmourDice([6, 4, 3, 3])).toBe(true);
    expect(isArmourDice([4, 0, 2])).toBe(true);
    expect(isArmourDice([])).toBe(false);
    expect(isArmourDice([0, 3])).toBe(false);
    expect(isArmourDice([4, 3, 0])).toBe(false);
    expect(isArmourDice([1, 2, 3, 4, 5])).toBe(false);
    expect(isArmourDice([7])).toBe(false);
  });
  it('deflects when the attack primary matches any primary or the secondary any secondary', () => {
    const armour = [
      { name: 'A', dice: [5], modifier: '-1 Damage' },
      { name: 'B', dice: [6, 5], modifier: '-2 Damage' },
      { name: 'C', dice: [5, 4, 2], modifier: '-3 Damage' },
    ];
    expect(deflects([6, 3], armour)).toEqual([1]);
    expect(deflects([5, 1], armour)).toEqual([0, 2]);
    expect(deflects([2, 5], armour)).toEqual([1, 2]);
    expect(deflects([3, 4], armour)).toEqual([2]);
    expect(deflects([1, 1], armour)).toEqual([]);
  });
  it('reads the damage taken off a modifier', () => {
    expect(armourModifier('-2 Damage')).toBe(2);
    expect(armourModifier('−3')).toBe(3);
    expect(armourModifier('1')).toBe(1);
    expect(armourModifier('')).toBe(0);
  });
});
