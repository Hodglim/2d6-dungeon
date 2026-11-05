import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/render/rng';
import {
  clampEntranceArea,
  d3FromD6,
  classify,
  exitCountFor,
  firstWallIndex,
  needsSecondRoll,
  parseDie,
  resolveRoomSize,
  rollD6,
  rollD66,
  type RoomSize,
} from '../../src/systems/dungeon/rules';

const d = (primary: number, secondary: number) => ({ primary, secondary });
const size = (o: Partial<RoomSize>): RoomSize => ({ w: 0, h: 0, corridor: false, doubled: false, fromDouble: false, ...o });

describe('d3FromD6', () => {
  it('reads a D6 in halves: 1-2 = 1, 3-4 = 2, 5-6 = 3', () => {
    expect([1, 2, 3, 4, 5, 6].map(d3FromD6)).toEqual([1, 1, 2, 2, 3, 3]);
  });
});

describe('parseDie', () => {
  it('accepts 1..6 only', () => {
    expect(parseDie('1')).toBe(1);
    expect(parseDie(' 6 ')).toBe(6);
    for (const t of ['', '0', '7', 'a', '2.5']) expect(parseDie(t)).toBeNull();
  });
});

describe('rolls', () => {
  it('rollD6 yields every face as an integer 1..6', () => {
    const rng = mulberry32(42);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const n = rollD6(rng);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6);
      seen.add(n);
    }
    expect(seen.size).toBe(6);
  });
  it('rollD66 rolls two dice', () => {
    const r = rollD66(mulberry32(7));
    expect(r.primary).toBeGreaterThanOrEqual(1);
    expect(r.secondary).toBeLessThanOrEqual(6);
  });
});

describe('needsSecondRoll', () => {
  it('is true for non-six doubles outside the entrance', () => {
    expect(needsSecondRoll(d(4, 4), false)).toBe(true);
    expect(needsSecondRoll(d(1, 1), false)).toBe(true);
    expect(needsSecondRoll(d(6, 6), false)).toBe(false);
    expect(needsSecondRoll(d(4, 4), true)).toBe(false);
    expect(needsSecondRoll(d(3, 5), false)).toBe(false);
  });
});

describe('resolveRoomSize', () => {
  it('adds the second roll on doubles', () => {
    expect(resolveRoomSize(d(4, 4), d(3, 2), false)).toMatchObject({ w: 7, h: 6, corridor: false, doubled: true, fromDouble: true });
    expect(resolveRoomSize(d(1, 1), d(2, 5), false)).toMatchObject({ w: 3, h: 6, corridor: false, doubled: true, fromDouble: true });
  });
  it('flags corridors from the first roll', () => {
    expect(resolveRoomSize(d(1, 4), null, false)).toMatchObject({ w: 1, h: 4, corridor: true, doubled: false, fromDouble: false });
  });
  it('leaves 6-6 alone', () => {
    expect(resolveRoomSize(d(6, 6), null, false)).toMatchObject({ w: 6, h: 6, corridor: false, doubled: false, fromDouble: true });
  });
  it('clamps the entrance area to 6..12', () => {
    const a = resolveRoomSize(d(5, 3), null, true);
    expect(a.w * a.h).toBeGreaterThanOrEqual(6);
    expect(a.w * a.h).toBeLessThanOrEqual(12);
    expect(a.doubled).toBe(false);
    expect(a.fromDouble).toBe(false);
    expect(a.corridor).toBe(false);
    const b = resolveRoomSize(d(1, 2), null, true);
    expect(b.w * b.h).toBeGreaterThanOrEqual(6);
    const c = resolveRoomSize(d(6, 5), null, true);
    expect(c.w * c.h).toBeLessThanOrEqual(12);
    expect(resolveRoomSize(d(4, 4), null, true)).toMatchObject({ w: 3, h: 4, corridor: false, doubled: false, fromDouble: false });
  });
});

describe('clampEntranceArea', () => {
  it('shrinks the longer side or grows the shorter', () => {
    expect(clampEntranceArea(5, 3)).toEqual({ w: 4, h: 3 });
    expect(clampEntranceArea(1, 2)).toEqual({ w: 2, h: 3 });
  });
});

describe('classify', () => {
  it('orders corridor, small, large, normal', () => {
    expect(classify({ w: 1, h: 5 }, size({}))).toBe('corridor');
    expect(classify({ w: 3, h: 2 }, size({}))).toBe('small');
    expect(classify({ w: 8, h: 4 }, size({ doubled: true, fromDouble: true }))).toBe('large');
    expect(classify({ w: 8, h: 4 }, size({ doubled: false }))).toBe('normal');
    // A 6-6 is a double roll (not re-rolled): 36 squares is large.
    expect(classify({ w: 6, h: 6 }, size({ doubled: false, fromDouble: true }))).toBe('large');
    expect(classify({ w: 3, h: 4 }, size({ corridor: true }))).toBe('corridor');
  });
});

describe('exit tables', () => {
  it('exitCountFor', () => {
    expect([1, 2, 3, 4, 5, 6].map(exitCountFor)).toEqual([0, 1, 1, 2, 2, 3]);
  });
  it('firstWallIndex', () => {
    expect([1, 2, 3, 4, 5, 6].map(firstWallIndex)).toEqual([0, 0, 1, 1, 2, 2]);
  });
});
