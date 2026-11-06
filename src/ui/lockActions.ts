// Locked-door actions run through History, one undo step each (like encounterActions).
import { setPlay, updateDoor } from '../core/commands';
import { damageLock, lockDoor, markChecked, openLock, setLockQuality } from '../core/doorLock';
import type { ExecResult, History } from '../core/history';
import type { Door } from '../core/types';
import { newEncounter, queueRoll, type Encounter } from '../systems/dungeon/combat';
import type { Hero } from '../systems/dungeon/hero';
import { lockGate, lockThreshold, parseLockPick, patrolTableFor, rollLocks, useLockPick, waitFood } from '../systems/dungeon/locks';
import type { DungeonTables } from '../systems/dungeon/tables';

const no = (reason: string): ExecResult => ({ ok: false, reason });
const doorOf = (history: History, id: string): Door | undefined => history.map.doors.find((d) => d.id === id);

/** The D6 lock check on a fresh exit. */
export function checkLock(history: History, tables: DungeonTables, doorId: string, roll: number): ExecResult {
  const d = doorOf(history, doorId);
  if (!d || lockGate(d, tables) !== 'check') return no('That door needs no lock check');
  const threshold = lockThreshold(tables, d.type)!;
  const locked = rollLocks(threshold, roll);
  const cmd = updateDoor(d, locked ? lockDoor(d) : markChecked(d));
  return history.execute({ ...cmd, label: `Lock check: ${locked ? 'locked' : 'unlocked'}` });
}

/** The 2D6 lock quality, rolled once before the first pick. */
export function rollLockQuality(history: History, doorId: string, total: number): ExecResult {
  const d = doorOf(history, doorId);
  if (!d?.lock?.locked || d.lock.quality !== null) return no('That lock has its quality already');
  if (!Number.isInteger(total) || total < 2 || total > 12) return no('Lock quality is from 2 to 12');
  return history.execute({ ...updateDoor(d, setLockQuality(d, total)), label: `Lock quality ${total}` });
}

/** One pick roll: `total` includes Precision and the pick's bonus. Uses up one use either way. */
export function pickLock(history: History, doorId: string, pickIndex: number, total: number): ExecResult {
  const d = doorOf(history, doorId);
  const hero = history.hero as Hero | null;
  if (!d?.lock?.locked || d.lock.damaged || d.lock.quality === null) return no('That lock cannot be picked');
  const item = hero?.smallItems[pickIndex];
  if (!hero || item === undefined || !parseLockPick(item)) return no('That is not a lock pick');
  const opened = total >= d.lock.quality;
  const after = opened ? openLock(d) : damageLock(d);
  return history.execute({
    ...setPlay({ hero: useLockPick(hero, pickIndex), encounter: history.encounter }, `Pick the lock: ${opened ? 'opened' : 'failed'}`),
    apply: updateDoor(d, after).apply,
  });
}

/** Wait at a locked door: eat or go hungry, then a patrol fight that opens the door when won. */
export function waitForPatrol(history: History, tables: DungeonTables | null, doorId: string, eat: boolean): ExecResult {
  if (history.encounter) return no('Finish the fight first');
  if (!doorOf(history, doorId)?.lock?.locked) return no('That door is not locked');
  const h = history.hero as Hero | null;
  const hero = h ? waitFood(h, eat) : null;
  if (hero && hero.hp === 0) return history.execute(setPlay({ hero, encounter: null }, 'Wait at the door: went hungry'));
  const code = patrolTableFor(tables, history.map.level);
  let e: Encounter = { ...newEncounter(), waitingDoorId: doorId };
  if (code) e = queueRoll(e, { code, modifier: 0 });
  return history.execute(setPlay({ hero, encounter: e }, 'Wait for a patrol'));
}
