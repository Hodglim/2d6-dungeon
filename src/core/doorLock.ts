// Door lock state changes for the lock check, picking and waiting. Pure: each returns a new Door.
import type { Door } from './types';

/** The lock check found it unlocked: remembered, nothing drawn. */
export const markChecked = (d: Door): Door => ({ ...d, checked: true });

/** The lock check (or an exit table) found it locked: an "L" on the map. */
export const lockDoor = (d: Door): Door => ({
  ...d,
  checked: true,
  lock: { ...d.lock, locked: true, note: d.lock?.note ?? '', quality: d.lock?.quality ?? null },
});

export const setLockQuality = (d: Door, q: number): Door => (d.lock ? { ...d, lock: { ...d.lock, quality: q } } : d);

/** A failed pick: still locked, and can't be picked again. */
export const damageLock = (d: Door): Door => (d.lock ? { ...d, lock: { ...d.lock, damaged: true } } : d);

/** Picked, or a patrol came through: the "L" is crossed out. */
export function openLock(d: Door): Door {
  const { damaged: _gone, ...lock } = d.lock ?? { locked: false, note: '', quality: null };
  return { ...d, checked: true, lock: { ...lock, locked: false } };
}

/** Checked already: by the flag, or because it has a lock (set by the check, a table or by hand). */
export const isChecked = (d: Door): boolean => d.checked === true || d.lock !== null;

/** The Door editor's padlock, set by hand: "none" also forgets the lock check, so the door is fresh again. */
export function withPadlock(d: Door, p: 'none' | 'locked' | 'opened'): Door {
  if (p === 'none') {
    const { checked: _gone, ...rest } = d;
    return { ...rest, lock: null };
  }
  if (p === 'opened') return openLock(d);
  return { ...d, lock: { ...d.lock, locked: true, note: d.lock?.note ?? '', quality: d.lock?.quality ?? null } };
}
