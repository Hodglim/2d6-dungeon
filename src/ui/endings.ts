/** When to ask the two ending questions. `dismissed` is the exact state object whose question was cancelled. */
import { allDefeated, type Encounter } from '../systems/dungeon/combat';
import type { Hero } from '../systems/dungeon/hero';

/**
 * How a hero at 0 HP or below fell. With a fight open the creature finishes them off: the adventure
 * is over. Anything else (a trap, poison, starving) knocks them out, and the recovery table decides.
 */
export type DeathCause = 'slain' | 'unconscious';
export function deathCause(enc: Encounter | null): DeathCause {
  return enc !== null ? 'slain' : 'unconscious';
}

/**
 * The hero is at 0 HP or below, the game isn't over, and it hasn't already been answered "not yet".
 * In a fight that answer holds for this exact state only. Out of one it means the hero woke: it holds
 * while the sheet is put right (HP last, perhaps), until the shell clears it once HP is above 0.
 */
export function shouldAskDeath(hero: Hero | null, gameOver: boolean, dismissed: Hero | null, fighting: boolean): boolean {
  if (hero === null || hero.hp > 0 || gameOver) return false;
  return fighting ? hero !== dismissed : dismissed === null;
}

/** Every creature is down, and this state hasn't already been answered "keep fighting". */
export function shouldAskWin(enc: Encounter | null, dismissed: Encounter | null): boolean {
  return enc !== null && allDefeated(enc) && enc !== dismissed;
}
