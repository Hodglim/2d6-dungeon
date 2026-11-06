import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Door } from '../../src/core/types';
import type { DungeonTables } from '../../src/systems/dungeon/tables';
import { lockStage, lockViewKey } from '../../src/ui/lockPanel';
import { door } from '../core/fixtures';

const t = JSON.parse(readFileSync('tests/fixtures/dungeon-tables.fixture.json', 'utf8')) as DungeonTables;
const d = (patch: Partial<Door> = {}): Door => ({ ...door('d1', 2, 2, 'W', 'metal'), ...patch });
const lock = (locked: boolean) => ({ locked, note: '', quality: null });

describe('lockStage', () => {
  it('an unchecked lockable door: check', () => expect(lockStage(d(), t)).toBe('check'));
  it('a locked door: choices, with or without tables', () => {
    expect(lockStage(d({ checked: true, lock: lock(true) }), t)).toBe('choices');
    expect(lockStage(d({ lock: lock(true) }), null)).toBe('choices');
  });
  it('checked and unlocked, or opened: open', () => {
    expect(lockStage(d({ checked: true }), t)).toBe('open');
    expect(lockStage(d({ checked: true, lock: lock(false) }), t)).toBe('open');
  });
  it('tables removed while an unchecked door waits: gone', () => expect(lockStage(d(), null)).toBe('gone'));
});

describe('lockViewKey (the panel goes back to its three choices when this changes)', () => {
  const locked = d({ checked: true, lock: lock(true) });
  it('changes when Undo takes the lock check back', () => expect(lockViewKey(d(), t)).not.toBe(lockViewKey(locked, t)));
  it('stays the same when the lock quality is rolled, so the pick carries on', () => {
    expect(lockViewKey({ ...locked, lock: { ...locked.lock!, quality: 8 } }, t)).toBe(lockViewKey(locked, t));
  });
  it('changes when a failed pick damages the lock', () => {
    expect(lockViewKey({ ...locked, lock: { ...locked.lock!, damaged: true } }, t)).not.toBe(lockViewKey(locked, t));
  });
});
