import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { setHero, setPlay } from '../../src/core/commands';
import { History } from '../../src/core/history';
import type { Door } from '../../src/core/types';
import { newEncounter, type Encounter } from '../../src/systems/dungeon/combat';
import { createHero, type Hero } from '../../src/systems/dungeon/hero';
import type { DungeonTables } from '../../src/systems/dungeon/tables';
import { checkLock, pickLock, rollLockQuality, waitForPatrol } from '../../src/ui/lockActions';
import { door, emptyMap, room, withContent } from '../core/fixtures';

const t = JSON.parse(readFileSync('tests/fixtures/dungeon-tables.fixture.json', 'utf8')) as DungeonTables;
const baseHero = (): Hero =>
  createHero(t, { name: 'Pip', weapon: 'Practice Sword', manoeuvres: ['Wobbly Poke', 'Gentle Swipe'], armour: 'Sackcloth Vest', scroll: 'Scroll of Mild Glow' });

function setup(d: Partial<Door> = {}, hero: Partial<Hero> | null = {}, level = 1) {
  const exit = { ...door('d1', 4, 2, 'W', 'metal'), ...d };
  const h = new History({ ...withContent(emptyMap(), [room('ra', 1, 1, 3, 3)], [exit]), level });
  if (hero) h.execute(setHero({ ...baseHero(), ...hero }, 'hero'));
  return h;
}
const dr = (h: History) => h.map.doors[0]!;
const enc = (h: History) => h.encounter as Encounter | null;
const lockedQ = (quality: number | null) => ({ checked: true as const, lock: { locked: true, note: '', quality } });

describe('checkLock', () => {
  it('a low roll leaves it unlocked and checked', () => {
    const h = setup();
    expect(checkLock(h, t, 'd1', 3)).toEqual({ ok: true });
    expect(dr(h)).toMatchObject({ checked: true, lock: null });
    expect(h.undoLabel).toBe('Lock check: unlocked');
  });
  it('a roll at the threshold locks it', () => {
    const h = setup();
    checkLock(h, t, 'd1', 4);
    expect(dr(h).lock).toEqual({ locked: true, note: '', quality: null });
    expect(h.undoLabel).toBe('Lock check: locked');
  });
  it('is not made twice, and undo makes the door fresh again', () => {
    const h = setup();
    checkLock(h, t, 'd1', 3);
    expect(checkLock(h, t, 'd1', 3).ok).toBe(false);
    h.undo();
    expect(dr(h).checked).toBeUndefined();
  });
});

describe('rollLockQuality', () => {
  it('writes the quality once', () => {
    const h = setup(lockedQ(null));
    expect(rollLockQuality(h, 'd1', 8)).toEqual({ ok: true });
    expect(dr(h).lock?.quality).toBe(8);
    expect(h.undoLabel).toBe('Lock quality 8');
    expect(rollLockQuality(h, 'd1', 9).ok).toBe(false);
  });
  it('refuses a total outside 2-12 and an unlocked door', () => {
    expect(rollLockQuality(setup(lockedQ(null)), 'd1', 13).ok).toBe(false);
    expect(rollLockQuality(setup(), 'd1', 8).ok).toBe(false);
  });
});

describe('pickLock', () => {
  const items = ['Rope', 'Lock Pick +2 (1)', 'Chalk'];
  it('a total at the quality opens it and uses the pick, in one undo step', () => {
    const h = setup(lockedQ(8), { smallItems: items });
    expect(pickLock(h, 'd1', 1, 8)).toEqual({ ok: true });
    expect(dr(h).lock?.locked).toBe(false);
    expect((h.hero as Hero).smallItems).toEqual(['Rope', 'Chalk']);
    expect(h.undoLabel).toBe('Pick the lock: opened');
    h.undo();
    expect(dr(h).lock?.locked).toBe(true);
    expect((h.hero as Hero).smallItems).toEqual(items);
  });
  it('a total below damages the lock and still uses the pick', () => {
    const h = setup(lockedQ(8), { smallItems: items });
    pickLock(h, 'd1', 1, 7);
    expect(dr(h).lock).toMatchObject({ locked: true, damaged: true });
    expect((h.hero as Hero).smallItems).toEqual(['Rope', 'Chalk']);
    expect(h.undoLabel).toBe('Pick the lock: failed');
  });
  it('refuses a damaged lock, a lock with no quality, and an item that is not a pick', () => {
    expect(pickLock(setup({ checked: true, lock: { locked: true, note: '', quality: 8, damaged: true } }, { smallItems: items }), 'd1', 1, 12).ok).toBe(false);
    expect(pickLock(setup(lockedQ(null), { smallItems: items }), 'd1', 1, 12).ok).toBe(false);
    expect(pickLock(setup(lockedQ(8), { smallItems: items }), 'd1', 0, 12).ok).toBe(false);
  });
});

describe('waitForPatrol', () => {
  it('eats, then queues the level patrol roll on a fight waiting at the door, in one undo step', () => {
    const h = setup(lockedQ(null), { rations: 2 });
    expect(waitForPatrol(h, t, 'd1', true)).toEqual({ ok: true });
    expect((h.hero as Hero).rations).toBe(1);
    expect(enc(h)?.waitingDoorId).toBe('d1');
    expect(enc(h)?.pending).toEqual([{ code: 'PRAC1', modifier: 0 }]);
    expect(h.undoLabel).toBe('Wait for a patrol');
    h.undo();
    expect((h.hero as Hero).rations).toBe(2);
    expect(enc(h)).toBeNull();
  });
  it('going hungry to 0 HP brings no patrol', () => {
    const h = setup(lockedQ(null), { hp: 1, level: 1 });
    expect(waitForPatrol(h, t, 'd1', false)).toEqual({ ok: true });
    expect((h.hero as Hero).hp).toBe(0);
    expect(enc(h)).toBeNull();
    expect(h.undoLabel).toBe('Wait at the door: went hungry');
  });
  it('refuses while another fight is open', () => {
    const h = setup(lockedQ(null));
    h.execute(setPlay({ hero: h.hero, encounter: newEncounter() }, 'fight'));
    expect(waitForPatrol(h, t, 'd1', true)).toEqual({ ok: false, reason: 'Finish the fight first' });
  });
  it('a level with no patrol table: the fight waits with nothing queued', () => {
    const h = setup(lockedQ(null), {}, 2);
    waitForPatrol(h, t, 'd1', true);
    expect(enc(h)).toMatchObject({ waitingDoorId: 'd1', pending: [] });
  });
  it('without a hero: no food, still a patrol', () => {
    const h = setup(lockedQ(null), null);
    waitForPatrol(h, t, 'd1', true);
    expect(h.hero).toBeNull();
    expect(enc(h)?.pending).toHaveLength(1);
  });
});
