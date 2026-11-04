/** Shifting the attack dice: the per-turn Shift pool, moving dice, manoeuvre matches and special rolls. Pure. */
import { fatigueShift } from './combat';

/**
 * One attack's dice: `natural` as rolled (red, blue), `faces` after shifting, `spent` the points
 * used so far (always the total distance of the faces from the natural roll).
 */
export interface DiceState {
  natural: [number, number];
  faces: [number, number];
  spent: number;
}

export const freshDice = (red: number, blue: number): DiceState => ({ natural: [red, blue], faces: [red, blue], spent: 0 });

const isDouble = (s: DiceState, v: number) => s.natural[0] === v && s.natural[1] === v;
/** A natural double 1 or double 6 can't be shifted. */
export const locked = (s: DiceState): boolean => isDouble(s, 1) || isDouble(s, 6);

/**
 * Move die `i` one step (`d` = +1 up, −1 down). Unchanged (the same object) when the die would
 * leave 1..6, when the roll is locked, or when the move costs a point the pool doesn't have.
 * Moving back toward the natural roll refunds the point.
 */
export function shiftDie(s: DiceState, i: 0 | 1, d: 1 | -1, pool: number): DiceState {
  const v = s.faces[i] + d;
  if (v < 1 || v > 6 || locked(s)) return s;
  const faces: [number, number] = [...s.faces];
  faces[i] = v;
  const spent = Math.abs(faces[0] - s.natural[0]) + Math.abs(faces[1] - s.natural[1]);
  if (spent > s.spent && spent > pool) return s;
  return { natural: [...s.natural], faces, spent };
}

/** Indexes of the manoeuvres whose dice are exactly [red, blue], in that order. */
export function matches(faces: readonly number[], manoeuvres: readonly { dice: readonly number[] }[]): number[] {
  const out: number[] = [];
  manoeuvres.forEach((m, i) => {
    if (m.dice.length === 2 && m.dice[0] === faces[0] && m.dice[1] === faces[1]) out.push(i);
  });
  return out;
}

export type RollNote = 'miss' | 'prime' | 'exact' | 'mishap';

/**
 * What's special about a roll. Hero: natural 1-1 misses, natural 6-6 is a Prime Attack, a match
 * with no shift spent is an Exact Strike. Creature: natural 1-1 Mishap, 6-6 Prime.
 */
export function rollNote(s: DiceState, who: 'hero' | 'creature', manoeuvres: readonly { dice: readonly number[] }[] = []): RollNote | null {
  if (isDouble(s, 1)) return who === 'hero' ? 'miss' : 'mishap';
  if (isDouble(s, 6)) return 'prime';
  if (who === 'hero' && s.spent === 0 && matches(s.faces, manoeuvres).length > 0) return 'exact';
  return null;
}

/** The hero's Shift pool for one attack: base + fatigue + Fearful Momentum. */
export const heroPool = (shift: number, round: number, momentum: number): number => shift + fatigueShift(round) + momentum;

/** A creature's Shift pool for one attack: its SH + fatigue; unknown SH gives no pool. */
export const foePool = (foe: { shift: number | null }, round: number): number =>
  foe.shift === null ? 0 : foe.shift + fatigueShift(round);
