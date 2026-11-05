import { describe, expect, it } from 'vitest';
import { DICE, DICE_PREFS_KEY, addToHistory, describeRoll, diceLabel, parseDamage, readDicePrefs, rollDice, rollLabel, rollTotal, writeDicePrefs } from '../../src/ui/diceRoller';

/** An rng that returns the given values in turn. */
const seq = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length]!;
};

function fakeStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('dice roller helper', () => {
  it('lists the four dice in chip order with labels', () => {
    expect(DICE.map((d) => d.label)).toEqual(['D6', '2D6', 'D66', 'D3']);
    expect(diceLabel('d66')).toBe('D66');
    expect(diceLabel('2d6')).toBe('2D6');
  });
  it('rolls one die for D6 and D3, two for 2D6 and D66', () => {
    expect(rollDice('d6', seq(0.99))).toEqual([6]);
    // A D3 is a real D6 read in halves: the face rolled is a D6 face.
    expect(rollDice('d3', seq(0))).toEqual([1]);
    expect(rollDice('d3', seq(0.99))).toEqual([6]);
    expect(rollDice('2d6', seq(0.5, 0))).toEqual([4, 1]);
    expect(rollDice('d66', seq(0.2, 0.99))).toEqual([2, 6]);
  });
  it('stays in range for any rng value', () => {
    for (let x = 0; x < 1; x += 0.01) {
      const [d3] = rollDice('d3', () => x);
      expect(d3).toBeGreaterThanOrEqual(1);
      expect(d3).toBeLessThanOrEqual(6);
      const [d6] = rollDice('d6', () => x);
      expect(d6).toBeGreaterThanOrEqual(1);
      expect(d6).toBeLessThanOrEqual(6);
    }
  });
  it('totals: a sum for 2D6, tens and units for D66, the face otherwise', () => {
    expect(rollTotal('2d6', [4, 5])).toBe('9');
    expect(rollTotal('d66', [3, 4])).toBe('34');
    expect(rollTotal('d6', [5])).toBe('5');
    expect(rollTotal('d3', [2])).toBe('1');
    expect(rollTotal('d3', [4])).toBe('2');
    expect(rollTotal('d3', [5])).toBe('3');
  });
  it('describes a roll for the history', () => {
    expect(describeRoll('2d6', [4, 5])).toBe('2D6: 4 + 5 = 9');
    expect(describeRoll('d66', [3, 4])).toBe('D66: 34');
    expect(describeRoll('d6', [6])).toBe('D6: 6');
    expect(describeRoll('d3', [1])).toBe('D3: 1 → 1');
    expect(describeRoll('d3', [5])).toBe('D3: 5 → 3');
  });
  it('reads a damage text as a die and a modifier, or null when there is nothing to roll', () => {
    expect(parseDamage('D6 -1')).toEqual({ dice: 'd6', modifier: -1 });
    expect(parseDamage('D6')).toEqual({ dice: 'd6', modifier: 0 });
    expect(parseDamage('2D6 +7')).toEqual({ dice: '2d6', modifier: 7 });
    expect(parseDamage(' d6+2 ')).toEqual({ dice: 'd6', modifier: 2 });
    expect(parseDamage('D6 −1')).toEqual({ dice: 'd6', modifier: -1 });
    expect(parseDamage('D3 +1')).toEqual({ dice: 'd3', modifier: 1 });
    expect(parseDamage('1')).toBeNull();
    expect(parseDamage('')).toBeNull();
    expect(parseDamage('D66')).toBeNull();
    expect(parseDamage('D6 x2')).toBeNull();
  });
  it('adds a modifier to the total, the label and the history line', () => {
    expect(rollTotal('d6', [4], -1)).toBe('3');
    expect(rollTotal('2d6', [4, 5], 7)).toBe('16');
    expect(rollTotal('d3', [5], 1)).toBe('4');
    expect(rollLabel('d6', -1)).toBe('D6 −1');
    expect(rollLabel('2d6', 7)).toBe('2D6 +7');
    expect(rollLabel('d6', 0)).toBe('D6');
    expect(describeRoll('d6', [4], -1)).toBe('D6 −1: 4 − 1 = 3');
    expect(describeRoll('2d6', [4, 5], 7)).toBe('2D6 +7: 4 + 5 + 7 = 16');
    expect(describeRoll('d3', [5], 1)).toBe('D3 +1: 5 → 3 + 1 = 4');
  });
  it('keeps the last five rolls, newest first', () => {
    let h: string[] = [];
    for (let i = 1; i <= 7; i++) h = addToHistory(h, `r${i}`);
    expect(h).toEqual(['r7', 'r6', 'r5', 'r4', 'r3']);
  });
  it('remembers the open state and die, and survives bad or missing storage', () => {
    const s = fakeStorage();
    expect(readDicePrefs(s)).toEqual({ open: false, dice: 'd6' });
    writeDicePrefs(s, { open: true, dice: 'd66' });
    expect(readDicePrefs(s)).toEqual({ open: true, dice: 'd66' });
    s.m.set(DICE_PREFS_KEY, '{nope');
    expect(readDicePrefs(s)).toEqual({ open: false, dice: 'd6' });
    s.m.set(DICE_PREFS_KEY, JSON.stringify({ open: 'yes', dice: 'd20' }));
    expect(readDicePrefs(s)).toEqual({ open: false, dice: 'd6' });
    const throws = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
    expect(readDicePrefs(throws)).toEqual({ open: false, dice: 'd6' });
    expect(() => writeDicePrefs(throws, { open: true, dice: 'd3' })).not.toThrow();
    expect(readDicePrefs(undefined)).toEqual({ open: false, dice: 'd6' });
  });
});
