import { describe, expect, it } from 'vitest';
import { damageLock, isChecked, lockDoor, markChecked, openLock, setLockQuality, withPadlock } from '../../src/core/doorLock';
import { door } from './fixtures';

const metal = () => door('d1', 2, 2, 'W', 'metal');

describe('doorLock', () => {
  it('markChecked remembers the check and leaves the lock alone', () => {
    const d = markChecked(metal());
    expect(d.checked).toBe(true);
    expect(d.lock).toBeNull();
  });
  it('lockDoor locks a checked door with no quality yet', () => {
    expect(lockDoor(metal())).toMatchObject({ checked: true, lock: { locked: true, note: '', quality: null } });
  });
  it('lockDoor keeps an existing note and quality', () => {
    const d = { ...metal(), lock: { locked: false, note: 'rusty', quality: 7 } };
    expect(lockDoor(d).lock).toEqual({ locked: true, note: 'rusty', quality: 7 });
  });
  it('setLockQuality writes the quality on a lock', () => {
    expect(setLockQuality(lockDoor(metal()), 8).lock?.quality).toBe(8);
  });
  it('setLockQuality leaves a door with no lock unchanged', () => {
    const d = metal();
    expect(setLockQuality(d, 8)).toBe(d);
  });
  it('damageLock marks the lock damaged and keeps it locked', () => {
    expect(damageLock(lockDoor(metal())).lock).toMatchObject({ locked: true, damaged: true });
  });
  it('openLock opens, drops damaged and keeps the quality', () => {
    const d = openLock(damageLock(setLockQuality(lockDoor(metal()), 9)));
    expect(d.lock).toEqual({ locked: false, note: '', quality: 9 });
    expect(d.checked).toBe(true);
  });
  it('isChecked: checked flag or any lock', () => {
    expect(isChecked(metal())).toBe(false);
    expect(isChecked(markChecked(metal()))).toBe(true);
    expect(isChecked({ ...metal(), lock: { locked: false, note: '', quality: null } })).toBe(true);
  });
});

describe('withPadlock (the Door editor padlock)', () => {
  const locked = { ...metal(), checked: true as const, lock: { locked: true, note: 'n', quality: 7, damaged: true as const } };
  it('none: no lock and fresh for a new check', () => {
    const d = withPadlock(locked, 'none');
    expect(d.lock).toBeNull();
    expect(d.checked).toBeUndefined();
  });
  it('opened: unlocked, not damaged, note and quality kept', () => {
    expect(withPadlock(locked, 'opened').lock).toEqual({ locked: false, note: 'n', quality: 7 });
  });
  it('locked: keeps the damage on a damaged lock', () => {
    expect(withPadlock(locked, 'locked').lock).toEqual({ locked: true, note: 'n', quality: 7, damaged: true });
  });
  it('locked on a fresh door: a plain lock', () => {
    expect(withPadlock(metal(), 'locked').lock).toEqual({ locked: true, note: '', quality: null });
  });
});
