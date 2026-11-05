/**
 * Throwing weapons and potion bombs: what the hero carries, the damage a throw does, and getting a
 * thrown weapon back. The weapons and bombs themselves come from the player's table file. Pure.
 */
import { interruptHits } from './creatureCombat';
import type { CreatureInterrupt } from './tables';

/** A throwing weapon: its damage before modifiers, and other names it goes by on the sheet. */
export interface ThrowingWeapon {
  name: string;
  damage: number;
  aliases?: string[];
}

/**
 * A potion bomb. `damage`: dice rolled for damage ("2D6 +4"). `damagePerLevel`: damage per level
 * of the dungeon. `noAttack`: the target can't attack this round. `noMovementInterrupts`: the
 * target can't use movement Interrupts this round.
 */
export interface PotionBomb {
  name: string;
  effect: string;
  damage?: string;
  damagePerLevel?: number;
  noAttack?: boolean;
  noMovementInterrupts?: boolean;
}

type ItemList = 'largeItems' | 'smallItems';
interface Carrier {
  largeItems: string[];
  smallItems: string[];
  potions: { name: string }[];
}

export interface CarriedWeapon {
  weapon: ThrowingWeapon;
  list: ItemList;
  index: number;
  /** The sheet's text for the item, put back as it was if the weapon is recovered. */
  item: string;
  modifier: number;
}

const has = (text: string, name: string) => text.toLowerCase().includes(name.toLowerCase());

/** The +1 or −1 on an item ("Throwing Spike +1"), read from after its name; 0 when there is none. */
export function itemModifier(item: string, name: string): number {
  const at = item.toLowerCase().indexOf(name.toLowerCase());
  const after = at < 0 ? item : item.slice(at + name.length);
  const m = /([+\-−])\s*(\d+)/.exec(after);
  if (!m) return 0;
  return m[1] === '+' ? Number(m[2]) : -Number(m[2]);
}

/** Each item on the sheet that is a throwing weapon (large items first, then small). */
export function carriedThrowing(hero: Carrier, weapons: readonly ThrowingWeapon[]): CarriedWeapon[] {
  const out: CarriedWeapon[] = [];
  for (const list of ['largeItems', 'smallItems'] as const) {
    hero[list].forEach((item, index) => {
      for (const weapon of weapons) {
        const name = [weapon.name, ...(weapon.aliases ?? [])].find((n) => has(item, n));
        if (name) {
          out.push({ weapon, list, index, item, modifier: itemModifier(item, name) });
          return;
        }
      }
    });
  }
  return out;
}

/** Each potion on the sheet that is a potion bomb. */
export function carriedBombs(hero: Carrier, bombs: readonly PotionBomb[]): { bomb: PotionBomb; index: number }[] {
  const out: { bomb: PotionBomb; index: number }[] = [];
  hero.potions.forEach((p, index) => {
    const bomb = bombs.find((b) => has(p.name, b.name));
    if (bomb) out.push({ bomb, index });
  });
  return out;
}

/**
 * A throwing weapon always hits. Its D66 is checked against the target's Interrupts (red against
 * primary sets, blue against secondary): each one that matches comes off the damage, and the
 * weapon was deflected (so it is lost).
 */
export function throwDamage(
  faces: readonly number[],
  damage: number,
  modifier: number,
  interrupts: readonly CreatureInterrupt[],
  round: number,
): { damage: number; hits: number[]; deflected: boolean } {
  const hits = interruptHits(faces, interrupts, round);
  const off = hits.reduce((n, i) => n + interrupts[i]!.modifier, 0);
  return { damage: Math.max(0, damage + modifier + off), hits, deflected: hits.length > 0 };
}

/** A bomb's damage: the rolled total for dice damage, or so much per dungeon level; 0 for an effect-only bomb. */
export function bombDamage(bomb: PotionBomb, rolled: number | null, dungeonLevel: number): number {
  if (bomb.damage) return Math.max(0, rolled ?? 0);
  if (bomb.damagePerLevel) return bomb.damagePerLevel * dungeonLevel;
  return 0;
}

/** After a fight, a thrown weapon that wasn't deflected comes back on a D6 of 4 to 6. */
export const recovers = (face: number): boolean => face >= 4;
