import { canStep, findPath } from '../../src/core/pathfinding';
import { moveToken, TRAIL_CAP } from '../../src/core/token';
import { door, emptyMap, room, withContent } from './fixtures';

// Two 2x2 rooms side by side: a at (1,1), b at (3,1). Door between them at (3,2,W).
function twoRooms(secret = false) {
  const d = { ...door('d', 3, 2, 'W'), secret };
  return withContent(emptyMap(), [room('a', 1, 1, 2, 2), room('b', 3, 1, 2, 2)], [d]);
}

describe('canStep', () => {
  it('moves freely inside a room', () => {
    expect(canStep(twoRooms(), { x: 1, y: 1 }, 'E')).toBe(true);
  });
  it('is blocked by a wall between rooms', () => {
    expect(canStep(twoRooms(), { x: 2, y: 1 }, 'E')).toBe(false);
  });
  it('passes through a door', () => {
    expect(canStep(twoRooms(), { x: 2, y: 2 }, 'E')).toBe(true);
  });
  it('is blocked by a secret door', () => {
    expect(canStep(twoRooms(true), { x: 2, y: 2 }, 'E')).toBe(false);
  });
  it('cannot leave the floor', () => {
    expect(canStep(twoRooms(), { x: 1, y: 1 }, 'N')).toBe(false);
  });
});

describe('findPath', () => {
  it('routes through the door', () => {
    const path = findPath(twoRooms(), { x: 1, y: 1 }, { x: 4, y: 1 });
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ x: 1, y: 1 });
    expect(path![path!.length - 1]).toEqual({ x: 4, y: 1 });
    expect(path).toContainEqual({ x: 2, y: 2 });
    expect(path).toContainEqual({ x: 3, y: 2 });
    expect(path).toHaveLength(6);
  });
  it('returns null when only a secret door connects', () => {
    expect(findPath(twoRooms(true), { x: 1, y: 1 }, { x: 4, y: 1 })).toBeNull();
  });
  it('returns null for a target off the floor', () => {
    expect(findPath(twoRooms(), { x: 1, y: 1 }, { x: 8, y: 8 })).toBeNull();
  });
  it('returns a single square when already there', () => {
    expect(findPath(twoRooms(), { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([{ x: 1, y: 1 }]);
  });
});

describe('moveToken', () => {
  it('moves to the end and records the squares it left', () => {
    const m = { ...twoRooms(), token: { x: 1, y: 1, trail: [] } };
    const cmd = moveToken(m, [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ])!;
    expect(cmd.apply(m).token).toEqual({
      x: 2,
      y: 2,
      trail: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
      ],
    });
  });
  it('caps the trail', () => {
    const long = Array.from({ length: TRAIL_CAP }, () => ({ x: 1, y: 1 }));
    const m = { ...twoRooms(), token: { x: 1, y: 1, trail: long } };
    const after = moveToken(m, [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ])!.apply(m);
    expect(after.token!.trail).toHaveLength(TRAIL_CAP);
  });
  it('returns null for a path that goes nowhere', () => {
    const m = { ...twoRooms(), token: { x: 1, y: 1, trail: [] } };
    expect(moveToken(m, [{ x: 1, y: 1 }])).toBeNull();
  });
});

describe('moveToken edge cases', () => {
  it('rejects a stale path that does not start at the token', () => {
    const m = { ...twoRooms(), token: { x: 2, y: 2, trail: [] } };
    expect(
      moveToken(m, [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
      ]),
    ).toBeNull();
  });
  it('returns null when there is no token', () => {
    expect(
      moveToken(twoRooms(), [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
      ]),
    ).toBeNull();
  });
  it('keeps the most recent squares when the trail is capped', () => {
    const old = Array.from({ length: TRAIL_CAP }, (_, i) => ({ x: 1, y: i }));
    const m = { ...twoRooms(), token: { x: 1, y: 1, trail: old } };
    const trail = moveToken(m, [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ])!.apply(m).token!.trail;
    expect(trail[trail.length - 1]).toEqual({ x: 1, y: 1 });
    expect(trail[0]).toEqual({ x: 1, y: 1 }); // old[0] (y:0) dropped; old[1] is now first
  });
});

describe('findPath through passages and the entrance', () => {
  it('walks from the entrance through a passage into a room', () => {
    // 10x10 map: entrance at (4,10), room at (3,7) 3x3, passage at (4,6), room above at (4,4) 1x2.
    const m = withContent(
      emptyMap(10, 10),
      [
        room('e', 4, 10, 1, 1, 'entrance'),
        room('a', 3, 7, 3, 3, 'room', 1),
        room('p', 4, 6, 1, 1, 'passage'),
        room('b', 4, 4, 1, 2, 'room', 2),
      ],
      [door('d1', 4, 10, 'N'), door('d2', 4, 7, 'N'), door('d3', 4, 6, 'N')],
    );
    const path = findPath(m, { x: 4, y: 10 }, { x: 4, y: 4 });
    expect(path).toEqual([
      { x: 4, y: 10 },
      { x: 4, y: 9 },
      { x: 4, y: 8 },
      { x: 4, y: 7 },
      { x: 4, y: 6 },
      { x: 4, y: 5 },
      { x: 4, y: 4 },
    ]);
  });
});
