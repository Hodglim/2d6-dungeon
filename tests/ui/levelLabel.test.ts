import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { levelLabel } from '../../src/ui/levelLabel';
import type { DungeonTables } from '../../src/systems/dungeon/tables';

const t = JSON.parse(readFileSync('tests/fixtures/dungeon-tables.fixture.json', 'utf8')) as DungeonTables;

describe('levelLabel', () => {
  it('names the level from the table file', () => {
    expect(levelLabel(t, 1)).toBe('Level 1 · Test Halls');
  });
  it('leaves the name out with no tables, or no tables for that level', () => {
    expect(levelLabel(null, 1)).toBe('Level 1');
    expect(levelLabel(t, 9)).toBe('Level 9');
  });
});
