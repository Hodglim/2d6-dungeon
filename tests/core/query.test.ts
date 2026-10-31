import { deriveWalls, isOpenExit, nextRoomNumber, openExits, roomAt } from '../../src/core/query';
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
  it('is 1 on an empty map', () => {
    expect(nextRoomNumber(emptyMap())).toBe(1);
  });
});
