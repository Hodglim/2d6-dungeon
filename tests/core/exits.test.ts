import { describe, expect, it } from 'vitest';
import { allowedExitEdges, entryWall, placeExitsClockwise } from '../../src/core/exits';
import { door, emptyMap, room, withContent } from './fixtures';

const entry = door('e', 4, 6, 'N');
const a = { ...room('a', 3, 3, 4, 3, 'room', 1), entryDoorId: 'e' };
const base = () => withContent(emptyMap(10, 10), [a], [entry]);

describe('entryWall', () => {
  it('is S for a door on the south wall', () => {
    const m = base();
    expect(entryWall(m, m.rooms[0]!)).toBe('S');
  });
});

describe('allowedExitEdges', () => {
  it('allows nothing on the entry wall', () => {
    const edges = allowedExitEdges(base(), 'a', []);
    expect(edges.length).toBeGreaterThan(0);
    expect(edges.some((e) => e.side === 'N' && e.y === 6)).toBe(false);
  });
  it('allows one exit per wall among chosen', () => {
    const edges = allowedExitEdges(base(), 'a', [{ x: 4, y: 3, side: 'N' }]);
    expect(edges.some((e) => e.side === 'N' && e.y === 3)).toBe(false);
    expect(edges.some((e) => e.side === 'W')).toBe(true);
  });
  it('disallows boundary walls', () => {
    const m = withContent(emptyMap(10, 10), [{ ...room('a', 3, 0, 4, 3, 'room', 1), entryDoorId: 'e' }], [door('e', 4, 3, 'N')]);
    expect(allowedExitEdges(m, 'a', []).some((e) => e.side === 'N' && e.y === 0)).toBe(false);
  });
  it('enforces the 1-square-deep rule', () => {
    const blocked = withContent(emptyMap(10, 10), [a, room('b', 3, 1, 4, 1, 'room', 2)], [entry]);
    expect(allowedExitEdges(blocked, 'a', []).some((e) => e.side === 'N' && e.y === 3)).toBe(false);
    const ok = withContent(emptyMap(10, 10), [a, room('b', 3, 0, 4, 1, 'room', 2)], [entry]);
    expect(allowedExitEdges(ok, 'a', []).some((e) => e.side === 'N' && e.y === 3)).toBe(true);
  });
  it('disallows an exit whose square beyond sits beside another room', () => {
    // b's west wall runs along x=7, so the square north of a's (6,3) N edge, (6,2), touches it.
    const m = withContent(emptyMap(10, 10), [a, room('b', 7, 0, 2, 3, 'room', 2)], [entry]);
    const north = allowedExitEdges(m, 'a', []).filter((e) => e.side === 'N' && e.y === 3);
    expect(north.map((e) => e.x).sort()).toEqual([3, 4, 5]);
  });
  it('disallows an exit whose square beyond sits beside the Outer Boundary', () => {
    const m = withContent(emptyMap(10, 10), [{ ...room('a', 0, 3, 4, 3, 'room', 1), entryDoorId: 'e' }], [door('e', 1, 6, 'N')]);
    const north = allowedExitEdges(m, 'a', []).filter((e) => e.side === 'N' && e.y === 3);
    expect(north.map((e) => e.x).sort()).toEqual([1, 2, 3]);
  });
  it('an existing door on the E wall disables E', () => {
    const m = withContent(emptyMap(10, 10), [a, room('c', 7, 3, 2, 3, 'room', 2)], [entry, door('x', 7, 4, 'W')]);
    expect(allowedExitEdges(m, 'a', []).some((e) => e.side === 'W' && e.x === 7)).toBe(false);
  });
});

describe('placeExitsClockwise', () => {
  it('places W, N, E from firstWall 0', () => {
    const r = placeExitsClockwise(base(), 'a', 3, 0);
    expect(r.dropped).toBe(0);
    expect(r.exits).toEqual([
      { x: 3, y: 4, side: 'W' },
      { x: 4, y: 3, side: 'N' },
      { x: 7, y: 4, side: 'W' },
    ]);
  });
  it('starts at N from firstWall 1, wrapping to W', () => {
    const r = placeExitsClockwise(base(), 'a', 3, 1);
    expect(r.exits.map((e) => e.side + e.x + ',' + e.y)).toEqual(['N4,3', 'W7,4', 'W3,4']);
  });
  it('drops exits when walls are unavailable', () => {
    const corner = withContent(emptyMap(10, 10), [{ ...room('a', 0, 0, 3, 3, 'room', 1), entryDoorId: 'e' }], [door('e', 1, 3, 'N')]);
    const r = placeExitsClockwise(corner, 'a', 3, 0);
    expect(r.exits).toHaveLength(1);
    expect(r.dropped).toBe(2);
  });
  it('skips an invalid wall and continues to the next valid one', () => {
    const m = withContent(emptyMap(10, 10), [a, room('c', 1, 3, 2, 3, 'room', 2)], [entry]);
    const r = placeExitsClockwise(m, 'a', 2, 0);
    expect(r.exits.map((e) => e.side + e.x + ',' + e.y)).toEqual(['N4,3', 'W7,4']);
    expect(r.dropped).toBe(0);
  });
});
