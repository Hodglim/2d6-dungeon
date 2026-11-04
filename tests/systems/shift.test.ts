import { describe, it, expect } from 'vitest';
import { shiftDie, matches, rollNote, heroPool, foePool, type DiceState } from '../../src/systems/dungeon/shift';

const roll = (a: number, b: number): DiceState => ({ natural: [a, b], faces: [a, b], spent: 0 });
const moves = (s: DiceState, steps: [0 | 1, 1 | -1][], pool: number) => steps.reduce((x, [i, d]) => shiftDie(x, i, d, pool), s);

describe('shiftDie', () => {
  it('moves one die one step and spends a point', () => {
    const s = shiftDie(roll(3, 4), 0, 1, 2);
    expect(s).toEqual({ natural: [3, 4], faces: [4, 4], spent: 1 });
    expect(shiftDie(s, 1, -1, 2)).toEqual({ natural: [3, 4], faces: [4, 3], spent: 2 });
  });
  it('never goes above 6 or below 1', () => {
    const top = roll(6, 1);
    expect(shiftDie(top, 0, 1, 5)).toBe(top);
    expect(shiftDie(top, 1, -1, 5)).toBe(top);
    expect(shiftDie(roll(5, 2), 0, 1, 5).faces).toEqual([6, 2]);
    expect(shiftDie(roll(5, 2), 1, -1, 5).faces).toEqual([5, 1]);
  });
  it('stops when the pool is spent', () => {
    const s = moves(roll(2, 2), [[0, 1], [1, 1]], 2);
    expect(s.spent).toBe(2);
    expect(shiftDie(s, 0, 1, 2)).toBe(s);
    expect(shiftDie(roll(2, 2), 0, 1, 0).spent).toBe(0);
  });
  it('a negative or zero pool allows no shifting', () => {
    const s = roll(3, 3);
    expect(shiftDie(s, 0, 1, -1)).toBe(s);
  });
  it('moving back toward the natural roll refunds the point', () => {
    const s = moves(roll(3, 4), [[0, 1], [0, 1]], 2);
    expect(s.spent).toBe(2);
    const back = shiftDie(s, 0, -1, 2);
    expect(back).toEqual({ natural: [3, 4], faces: [4, 4], spent: 1 });
    // with the pool spent, a refund is still allowed and frees a point for the other die
    expect(shiftDie(back, 1, 1, 2)).toEqual({ natural: [3, 4], faces: [4, 5], spent: 2 });
    expect(shiftDie(shiftDie(back, 0, -1, 2), 0, -1, 2).spent).toBe(1); // past natural costs again
  });
  it('a natural double 1 or double 6 is locked', () => {
    for (const s of [roll(1, 1), roll(6, 6)]) {
      expect(shiftDie(s, 0, 1, 3)).toBe(s);
      expect(shiftDie(s, 1, -1, 3)).toBe(s);
    }
  });
  it('does not change the input', () => {
    const s = roll(3, 3);
    shiftDie(s, 0, 1, 2);
    expect(s).toEqual(roll(3, 3));
  });
});

describe('matches', () => {
  const ms = [{ dice: [1, 4] }, { dice: [2, 6] }, { dice: [4, 1] }, { dice: [1, 4] }];
  it('matches red then blue, in order', () => {
    expect(matches([1, 4], ms)).toEqual([0, 3]);
    expect(matches([4, 1], ms)).toEqual([2]);
    expect(matches([3, 4], [{ dice: [4, 3] }])).toEqual([]);
    expect(matches([5, 5], ms)).toEqual([]);
  });
});

describe('rollNote', () => {
  const ms = [{ dice: [1, 4] }];
  it('hero: miss, prime, exact', () => {
    expect(rollNote(roll(1, 1), 'hero', ms)).toBe('miss');
    expect(rollNote(roll(6, 6), 'hero', ms)).toBe('prime');
    expect(rollNote(roll(1, 4), 'hero', ms)).toBe('exact');
    expect(rollNote(roll(2, 4), 'hero', ms)).toBeNull();
  });
  it('hero: a match reached by shifting is not exact', () => {
    expect(rollNote(shiftDie(roll(2, 4), 0, -1, 2), 'hero', ms)).toBeNull();
  });
  it('hero: a 6-6 reached by shifting is not prime', () => {
    expect(rollNote(shiftDie(roll(5, 6), 0, 1, 2), 'hero', [])).toBeNull();
  });
  it('creature: mishap, prime, otherwise nothing', () => {
    expect(rollNote(roll(1, 1), 'creature')).toBe('mishap');
    expect(rollNote(roll(6, 6), 'creature')).toBe('prime');
    expect(rollNote(roll(1, 4), 'creature', ms)).toBeNull();
  });
});

describe('pools', () => {
  it('hero: base + fatigue + momentum', () => {
    expect(heroPool(2, 1, 0)).toBe(2);
    expect(heroPool(2, 2, 2)).toBe(4);
    expect(heroPool(2, 6, 0)).toBe(5);
    expect(heroPool(2, 9, 0)).toBe(5);
  });
  it('foe: SH + fatigue, unknown SH is no pool', () => {
    expect(foePool({ shift: 0 }, 1)).toBe(0);
    expect(foePool({ shift: -1 }, 5)).toBe(1);
    expect(foePool({ shift: 1 }, 4)).toBe(2);
    expect(foePool({ shift: null }, 6)).toBe(0);
  });
});
