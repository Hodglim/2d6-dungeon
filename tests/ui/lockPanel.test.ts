import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Door } from '../../src/core/types';
import type { DungeonTables } from '../../src/systems/dungeon/tables';
import { lockStage } from '../../src/ui/lockPanel';
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
