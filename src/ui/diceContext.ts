// The app shell hands "roll these dice in the dice roller" down to every encounter and reference text.
import { getContext, setContext } from 'svelte';
import type { DiceKind } from './diceRoller';

const KEY = Symbol('dice-roll');

/** Roll `dice` once, adding `modifier` (a manoeuvre's "D6 −1") to the total. */
export type DiceRollFn = (dice: DiceKind, modifier?: number) => void;

export function provideDiceRoll(fn: DiceRollFn): void {
  setContext(KEY, fn);
}

/** The shell's roll function, or undefined outside the app (then dice phrases stay text). */
export function useDiceRoll(): DiceRollFn | undefined {
  return getContext<DiceRollFn | undefined>(KEY);
}
