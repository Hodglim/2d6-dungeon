/** When to ask the two ending questions. `dismissed` is the exact state object whose question was cancelled. */
import { allDefeated, type Encounter } from '../systems/dungeon/combat';
import type { Hero } from '../systems/dungeon/hero';

/** The hero is at 0 HP or below, the game isn't over, and this state hasn't already been answered "not yet". */
export function shouldAskDeath(hero: Hero | null, gameOver: boolean, dismissed: Hero | null): boolean {
  return hero !== null && hero.hp <= 0 && !gameOver && hero !== dismissed;
}

/** Every creature is down, and this state hasn't already been answered "keep fighting". */
export function shouldAskWin(enc: Encounter | null, dismissed: Encounter | null): boolean {
  return enc !== null && allDefeated(enc) && enc !== dismissed;
}
