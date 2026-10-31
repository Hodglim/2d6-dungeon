import { deriveWalls, isOpenExit, nextRoomNumber, openExits, roomAt, roomCentre, coverage } from '../../src/core/query';
import { sameEdge } from '../../src/core/geometry';
import { door, emptyMap, room, withContent } from './fixtures';

describe('roomAt', () => {
  it('finds the room covering a square', () => {
    const m = withContent(emptyMap(), [room('a', 2, 2, 3, 2)]);
    expect(roomAt(m, { x: 4, y: 3 })?.id).toBe('a');
    expect(roomAt(m, { x: 5, y: 3 })).toBeUndefined();
  });
});

describe('open exits', () => {
  it('a door with a room on one side is open', () => {
    const m = withContent(emptyMap(), [room('a', 2, 2, 3, 2)], [door('d', 3, 2, 'N')]);
    expect(isOpenExit(m, m.doors[0]!)).toBe(true);
    expect(openExits(m).map((d) => d.id)).toEqual(['d']);
  });
  it('a door between two rooms is not open', () => {
    const m = withContent(
      emptyMap(),
      [room('a', 2, 2, 3, 2), room('b', 2, 0, 3, 2)],
      [door('d', 3, 2, 'N')],
    );
    expect(openExits(m)).toEqual([]);
  });
});

describe('deriveWalls', () => {
  it('a lone 2x1 room has 6 wall edges', () => {
    const m = withContent(emptyMap(), [room('a', 1, 1, 2, 1)]);
    expect(deriveWalls(m)).toHaveLength(6);
  });
  it('a door removes its edge from the walls', () => {
    const m = withContent(emptyMap(), [room('a', 1, 1, 2, 1)], [door('d', 1, 1, 'N')]);
    expect(deriveWalls(m)).toHaveLength(5);
  });
  it('a wall shared by two butting rooms appears once', () => {
    // a: 1x1 at (1,1); b: 1x1 at (2,1). 4 + 4 - 1 shared = 7.
    const m = withContent(emptyMap(), [room('a', 1, 1, 1, 1), room('b', 2, 1, 1, 1)]);
    expect(deriveWalls(m)).toHaveLength(7);
  });
});

describe('nextRoomNumber', () => {
  it('ignores passages and the entrance', () => {
    const m = withContent(emptyMap(), [
      room('e', 4, 10, 1, 1, 'entrance'),
      room('a', 2, 2, 2, 2, 'room', 1),
      room('p', 4, 4, 1, 1, 'passage'),
      room('b', 6, 2, 2, 2, 'room', 2),
    ]);
    expect(nextRoomNumber(m)).toBe(3);
  });
  it('ignores corridors', () => {
    const m = withContent(emptyMap(), [
      room('a', 2, 2, 2, 2, 'room', 1),
      room('c', 4, 4, 1, 4, 'corridor'),
      room('b', 6, 2, 2, 2, 'room', 2),
    ]);
    expect(nextRoomNumber(m)).toBe(3);
  });
  it('is 1 on an empty map', () => {
    expect(nextRoomNumber(emptyMap())).toBe(1);
  });
});

describe('deriveWalls detail', () => {
  it('removes exactly the door edge', () => {
    const m = withContent(emptyMap(), [room('a', 1, 1, 2, 1)], [door('d', 1, 1, 'N')]);
    expect(deriveWalls(m).some((e) => sameEdge(e, m.doors[0]!))).toBe(false);
  });
  it('lists a shared wall once, and not at all when a door is on it', () => {
    const rooms = [room('a', 1, 1, 1, 1), room('b', 2, 1, 1, 1)];
    const shared = { x: 2, y: 1, side: 'W' as const };
    expect(deriveWalls(withContent(emptyMap(), rooms)).filter((e) => sameEdge(e, shared))).toHaveLength(1);
    const withDoor = withContent(emptyMap(), rooms, [door('d', 2, 1, 'W')]);
    expect(deriveWalls(withDoor).some((e) => sameEdge(e, shared))).toBe(false);
  });
});

describe('nextRoomNumber after a deletion', () => {
  it('does not refill gaps', () => {
    const m = withContent(emptyMap(), [room('a', 1, 1, 1, 1, 'room', 1), room('c', 3, 3, 1, 1, 'room', 3)]);
    expect(nextRoomNumber(m)).toBe(4);
  });
});

describe('roomCentre', () => {
  it('is the middle square, rounding toward the top-left', () => {
    expect(roomCentre(room('a', 2, 2, 4, 3))).toEqual({ x: 3, y: 3 });
  });
});

describe('coverage', () => {
  it('is 0 for an empty map', () => {
    expect(coverage(emptyMap())).toBe(0);
  });
  it('counts a 5x4 room on 10x10 as 0.2', () => {
    expect(coverage(withContent(emptyMap(), [room('a', 1, 1, 5, 4)]))).toBe(0.2);
  });
  it('does not count the entrance', () => {
    expect(coverage(withContent(emptyMap(), [room('a', 1, 1, 5, 4), room('e', 7, 7, 1, 1, 'entrance')]))).toBe(0.2);
  });
});
