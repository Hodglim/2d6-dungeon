// Locked doors (Core Rules p. 16–17): the lock check, lock picks and waiting for a patrol.
// Pure rules; the numbers come from the player's table file.
import { isChecked } from '../../core/doorLock';
import type { Door } from '../../core/types';
import type { Hero } from './hero';
import { LOCKABLE_DOORS, type DungeonTables, type LockableDoor } from './tables';

/** What a tap on an exit must go through first: a lock check, the locked-door choices, or nothing. */
export type LockGate = 'check' | 'locked' | null;

export function lockThreshold(tables: DungeonTables | null, type: string): number | null {
  const locks = tables?.tables.doorLocks;
  if (!locks || !(LOCKABLE_DOORS as readonly string[]).includes(type)) return null;
  return locks[type as LockableDoor] ?? null;
}

export function lockGate(door: Door, tables: DungeonTables | null): LockGate {
  if (door.lock?.locked) return 'locked';
  if (door.secret || isChecked(door)) return null;
  return lockThreshold(tables, door.type) === null ? null : 'check';
}

export const rollLocks = (threshold: number, roll: number): boolean => roll >= threshold;

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** "Metal: locked on 4–6", highest threshold (least likely) first. */
export function lockTableLines(tables: DungeonTables): string[] {
  const locks = tables.tables.doorLocks ?? {};
  return LOCKABLE_DOORS.filter((k) => locks[k] !== undefined)
    .map((k) => [k, locks[k]!] as const)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${capital(k)}: locked on ${n === 6 ? '6' : `${n}–6`}`);
}

export interface LockPick {
  index: number;
  text: string;
  bonus: number;
  uses: number;
}

const PICK = /\block\s?pick\s*([+\-−])(\d+)\s*\((\d+)\)/i;

/** "Lock Pick +2 (3)" → bonus 2, 3 uses; anything else → null. */
export function parseLockPick(item: string): { bonus: number; uses: number } | null {
  const m = PICK.exec(item);
  if (!m) return null;
  const n = Number(m[2]);
  const uses = Number(m[3]);
  return uses > 0 ? { bonus: m[1] === '+' ? n : -n, uses } : null;
}

export function findLockPicks(hero: Hero): LockPick[] {
  return hero.smallItems.flatMap((text, index) => {
    const p = parseLockPick(text);
    return p ? [{ index, text, ...p }] : [];
  });
}

/** One use off the lock pick at `index`; it goes when none are left. */
export function useLockPick(hero: Hero, index: number): Hero {
  const text = hero.smallItems[index];
  const p = text === undefined ? null : parseLockPick(text);
  if (!p || text === undefined) return hero;
  const items = [...hero.smallItems];
  if (p.uses <= 1) items.splice(index, 1);
  // Rewrite the count inside the pick's own match, not some other "(n)" in the item.
  else items[index] = text.replace(PICK, (whole) => whole.replace(/\(\s*\d+\s*\)$/, `(${p.uses - 1})`));
  return { ...hero, smallItems: items };
}

/** Waiting at a door: eat a ration (+2 HP per level, up to the baseline) or go hungry (−2 HP per level). */
export function waitFood(hero: Hero, eat: boolean): Hero {
  const change = 2 * hero.level;
  if (eat && hero.rations > 0) {
    return { ...hero, rations: hero.rations - 1, hp: Math.max(hero.hp, Math.min(hero.hpBaseline, hero.hp + change)) };
  }
  return { ...hero, hp: Math.max(0, hero.hp - change) };
}

export function patrolTableFor(tables: DungeonTables | null, level: number): string | null {
  return tables?.tables.dungeonLevels?.find((l) => l.level === level)?.patrolTable ?? null;
}
