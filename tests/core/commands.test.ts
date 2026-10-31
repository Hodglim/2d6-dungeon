import {
  addDoor,
  addFeature,
  addRoom,
  compound,
  removeDoor,
  removeRoom,
  setToken,
  updateDoor,
  updateRoom,
} from '../../src/core/commands';
import { door, emptyMap, room, withContent } from './fixtures';

describe('item commands', () => {
  const base = withContent(emptyMap(), [room('a', 1, 1, 2, 2), room('b', 4, 1, 2, 2)], [door('d', 3, 1, 'W')]);

  it('addRoom appends', () => {
    const after = addRoom(room('c', 7, 7, 1, 1)).apply(base);
    expect(after.rooms.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('removeRoom removes and keeps the order of the rest', () => {
    const three = withContent(emptyMap(), [room('a', 1, 1, 1, 1), room('b', 3, 1, 1, 1), room('c', 5, 1, 1, 1)]);
    const after = removeRoom(three.rooms[1]!).apply(three);
    expect(after.rooms.map((r) => r.id)).toEqual(['a', 'c']);
  });
  it('updateRoom replaces by id', () => {
    const after = updateRoom(base.rooms[0]!, { ...base.rooms[0]!, w: 1 }).apply(base);
    expect(after.rooms[0]!.w).toBe(1);
    expect(after.rooms[1]).toBe(base.rooms[1]);
  });
  it('addDoor / removeDoor / updateDoor', () => {
    expect(addDoor(door('e', 1, 1, 'N')).apply(base).doors.map((d) => d.id)).toEqual(['d', 'e']);
    expect(removeDoor(base.doors[0]!).apply(base).doors).toEqual([]);
    const after = updateDoor(base.doors[0]!, { ...base.doors[0]!, type: 'wooden' }).apply(base);
    expect(after.doors[0]!.type).toBe('wooden');
  });
  it('setToken', () => {
    const after = setToken(null, { x: 1, y: 1, trail: [] }).apply(base);
    expect(after.token).toEqual({ x: 1, y: 1, trail: [] });
  });
  it('does not mutate its input and shares untouched collections', () => {
    const snapshot = structuredClone(base);
    const after = addRoom(room('c', 7, 7, 1, 1)).apply(base);
    expect(base).toEqual(snapshot);
    expect(after.doors).toBe(base.doors);
    expect(after.features).toBe(base.features);
  });
});

describe('compound', () => {
  it('applies in order', () => {
    const cmd = compound('two rooms', [addRoom(room('a', 1, 1, 1, 1)), addRoom(room('b', 3, 3, 1, 1))]);
    expect(cmd.apply(emptyMap()).rooms.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('addFeature', () => {
  it('labels by kind', () => {
    expect(addFeature({ id: 's', kind: 'stairs', x: 1, y: 1, dir: 'down' }).label).toBe('Add stairs');
  });
});
