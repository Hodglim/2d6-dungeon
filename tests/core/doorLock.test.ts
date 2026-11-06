import { describe, expect, it } from 'vitest';
import { damageLock, isChecked, lockDoor, markChecked, openLock, setLockQuality } from '../../src/core/doorLock';
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
