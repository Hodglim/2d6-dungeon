// The app shell hands its one dice desk down to every panel that rolls: text buttons roll freely,
// roll cards register their job.
import { getContext, setContext } from 'svelte';
import type { DiceDesk } from './diceDesk';

const KEY = Symbol('dice-desk');

export function provideDiceDesk(desk: DiceDesk): void {
  setContext(KEY, desk);
}

/** The shell's dice desk, or undefined outside the app (then dice phrases stay text). */
export function useDiceDesk(): DiceDesk | undefined {
  return getContext<DiceDesk | undefined>(KEY);
}
