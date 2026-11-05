/** A creature card's Interrupts against the hero's attack dice. Pure. */
import { interruptReminder } from './combat';
import type { CreatureInterrupt } from './tables';

/** A movement (or item) Interrupt stops counting from round 7. */
export const interruptLapsed = (i: CreatureInterrupt, round: number): boolean => !!i.movement && interruptReminder(round);

/**
 * Indexes of the Interrupts a successful attack whose dice (after shifting) read [red, blue] sets
 * off: a primary set matching the red die, or a secondary set matching the blue. Lapsed ones are
 * left out. Only one counts each round; the player picks.
 */
export function interruptHits(faces: readonly number[], interrupts: readonly CreatureInterrupt[], round: number): number[] {
  const out: number[] = [];
  interrupts.forEach((it, i) => {
    if (interruptLapsed(it, round)) return;
    const die = it.side === 'primary' ? faces[0] : faces[1];
    if (it.dice.includes(die!)) out.push(i);
  });
  return out;
}
