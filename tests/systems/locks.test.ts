import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Door } from '../../src/core/types';
import { createHero, type Hero } from '../../src/systems/dungeon/hero';
import {
  findLockPicks, lockGate, lockTableLines, parseLockPick, patrolTableFor, rollLocks, useLockPick, waitFood,
} from '../../src/systems/dungeon/locks';
import type { DungeonTables } from '../../src/systems/dungeon/tables';
import { door } from '../core/fixtures';

const t = JSON.parse(readFileSync('tests/fixtures/dungeon-tables.fixture.json', 'utf8')) as DungeonTables;
const hero = (patch: Partial<Hero> = {}): Hero => ({
  ...createHero(t, { name: 'Pip', weapon: 'Practice Sword', manoeuvres: ['Wobbly Poke', 'Gentle Swipe'], armour: 'Sackcloth Vest', scroll: 'Scroll of Mild Glow' }),
  ...patch,
});
const d = (type: string, patch: Partial<Door> = {}): Door => ({ ...door('d1', 2, 2, 'W', type), ...patch });

describe('lockGate', () => {
  it('an unchecked metal exit needs a check', () => expect(lockGate(d('metal'), t)).toBe('check'));
  it('a secret door is never checked', () => expect(lockGate(d('metal', { secret: true }), t)).toBeNull());
  it.each(['archway', 'curtain', 'portcullis', 'stoneSlab'])('a %s is never checked', (type) => expect(lockGate(d(type), t)).toBeNull());
  it('a checked door is not checked again', () => expect(lockGate(d('metal', { checked: true }), t)).toBeNull());
  it('an opened lock lets it through', () => expect(lockGate(d('metal', { lock: { locked: false, note: '', quality: null } }), t)).toBeNull());
  it('a locked door is locked, with or without tables', () => {
    const locked = d('metal', { lock: { locked: true, note: '', quality: null } });
    expect(lockGate(locked, t)).toBe('locked');
    expect(lockGate(locked, null)).toBe('locked');
  });
  it('without tables an unchecked door goes through as today', () => expect(lockGate(d('metal'), null)).toBeNull());
});

describe('lock rolls', () => {
  it('rollLocks: at or above the threshold locks', () => {
    expect(rollLocks(4, 3)).toBe(false);
    expect(rollLocks(4, 4)).toBe(true);
  });
  it('lockTableLines: highest threshold first', () => {
    expect(lockTableLines(t)).toEqual(['Wooden: locked on 6', 'Reinforced: locked on 5–6', 'Metal: locked on 4–6']);
  });
});

describe('lock picks', () => {
  it.each([
    ['Lock Pick +2 (3)', 2, 3],
    ['lock pick +1(4)', 1, 4],
    ['LOCKPICK +0 (1)', 0, 1],
    ['Lock Pick −1 (2)', -1, 2],
    ['Rusty Lock Pick +2 (3)', 2, 3],
  ])('parses %s', (text, bonus, uses) => expect(parseLockPick(text)).toEqual({ bonus, uses }));
  it.each(['Lock Pick', 'Lock Pick +2', 'Lock Box +2 (3)', 'Lock Pick +1 (0)'])('is not a lock pick: %s', (text) => expect(parseLockPick(text)).toBeNull());
  it('findLockPicks lists them with their item index', () => {
    expect(findLockPicks(hero({ smallItems: ['Rope', 'Lock Pick +2 (3)'] }))).toEqual([{ index: 1, text: 'Lock Pick +2 (3)', bonus: 2, uses: 3 }]);
  });
  it('useLockPick counts a use down', () => {
    expect(useLockPick(hero({ smallItems: ['Lock Pick +2 (3)'] }), 0).smallItems).toEqual(['Lock Pick +2 (2)']);
  });
  it("useLockPick counts down the pick's own number, not another in the item", () => {
    expect(useLockPick(hero({ smallItems: ['Pouch (2): Lock Pick +1 (3)'] }), 0).smallItems).toEqual(['Pouch (2): Lock Pick +1 (2)']);
  });
  it('useLockPick removes the last use and keeps the others in order', () => {
    expect(useLockPick(hero({ smallItems: ['Rope', 'Lock Pick +2 (1)', 'Chalk'] }), 1).smallItems).toEqual(['Rope', 'Chalk']);
  });
});

describe('waitFood', () => {
  const h = (hp: number, rations: number) => hero({ level: 2, hp, hpBaseline: 12, rations });
  it('eating uses a ration and heals 2 per level', () => expect(waitFood(h(5, 1), true)).toMatchObject({ hp: 9, rations: 0 }));
  it('eating heals no further than the baseline', () => expect(waitFood(h(11, 1), true).hp).toBe(12));
  it('eating never lowers HP above the baseline', () => expect(waitFood(h(15, 1), true).hp).toBe(15));
  it('going hungry costs 2 per level, not below 0', () => expect(waitFood(h(3, 1), false)).toMatchObject({ hp: 0, rations: 1 }));
  it('eating with no rations is going hungry', () => expect(waitFood(h(5, 0), true)).toMatchObject({ hp: 1, rations: 0 }));
});

describe('patrolTableFor', () => {
  it('names the level patrol table', () => expect(patrolTableFor(t, 1)).toBe('PRAC1'));
  it('null for a level with none', () => expect(patrolTableFor(t, 2)).toBeNull());
  it('null without tables', () => expect(patrolTableFor(null, 1)).toBeNull());
});
