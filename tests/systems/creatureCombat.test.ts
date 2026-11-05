import { describe, expect, it } from 'vitest';
import { interruptHits, interruptLapsed } from '../../src/systems/dungeon/creatureCombat';
import type { CreatureInterrupt } from '../../src/systems/dungeon/tables';

const ints: CreatureInterrupt[] = [
  { name: 'Moss Cloak', side: 'primary', dice: [1, 4], modifier: -2 },
  { name: 'Hop Aside', side: 'secondary', dice: [2], modifier: -1, movement: true },
  { name: 'Bark Skin', side: 'secondary', dice: [4, 6], modifier: -3 },
];

describe('creature interrupts', () => {
  it('match the red die against primary sets and the blue die against secondary sets', () => {
    expect(interruptHits([1, 3], ints, 1)).toEqual([0]);
    expect(interruptHits([3, 2], ints, 1)).toEqual([1]);
    expect(interruptHits([4, 6], ints, 1)).toEqual([0, 2]);
    expect(interruptHits([5, 5], ints, 1)).toEqual([]);
  });
  it('drop movement Interrupts from round 7', () => {
    expect(interruptLapsed(ints[1]!, 6)).toBe(false);
    expect(interruptLapsed(ints[1]!, 7)).toBe(true);
    expect(interruptLapsed(ints[0]!, 9)).toBe(false);
    expect(interruptHits([3, 2], ints, 7)).toEqual([]);
    expect(interruptHits([1, 2], ints, 7)).toEqual([0]);
  });
  it('drop movement Interrupts when a bomb stops them this round', () => {
    expect(interruptHits([3, 2], ints, 1, true)).toEqual([]);
    expect(interruptHits([1, 4], ints, 1, true)).toEqual([0, 2]);
  });
});
