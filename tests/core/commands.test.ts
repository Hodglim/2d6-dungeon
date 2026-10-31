import { checkInvariants } from '../../src/core/rules';
import {
  addDoor,
  addFeature,
  addRoom,
  compound,
  deleteRoom,
  removeDoor,
  removeRoom,
  setToken,
  updateDoor,
  updateRoom,
} from '../../src/core/commands';
import type { Command } from '../../src/core/commands';
import type { DungeonMap } from '../../src/core/types';
import { door, emptyMap, room, withContent } from './fixtures';

function roundTrip(map: DungeonMap, cmd: Command) {
  const after = cmd.apply(map);
  expect(cmd.undo(after)).toEqual(map);
  return after;
}

describe('item commands round-trip', () => {
  const base = withContent(emptyMap(), [room('a', 1, 1, 2, 2), room('b', 4, 1, 2, 2)], [door('d', 3, 1, 'W')]);

  it('addRoom', () => {
    const after = roundTrip(base, addRoom(room('c', 7, 7, 1, 1)));
    expect(after.rooms.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('removeRoom restores the original position', () => {
    const after = roundTrip(base, removeRoom(base.rooms[0]!));
    expect(after.rooms.map((r) => r.id)).toEqual(['b']);
  });
  it('updateRoom', () => {
    const after = roundTrip(base, updateRoom(base.rooms[0]!, { ...base.rooms[0]!, w: 1 }));
    expect(after.rooms[0]!.w).toBe(1);
  });
  it('addDoor / removeDoor / updateDoor', () => {
    roundTrip(base, addDoor(door('e', 1, 1, 'N')));
    roundTrip(base, removeDoor(base.doors[0]!));
    const after = roundTrip(base, updateDoor(base.doors[0]!, { ...base.doors[0]!, type: 'wooden' }));
    expect(after.doors[0]!.type).toBe('wooden');
  });
  it('setToken', () => {
    const after = roundTrip(base, setToken(null, { x: 1, y: 1, trail: [] }));
    expect(after.token).toEqual({ x: 1, y: 1, trail: [] });
  });
});

describe('removeItem undo guard and redo', () => {
  it('does not duplicate when undo runs on a map that already has the item', () => {
    const cmd = removeRoom(room('zz', 1, 1, 1, 1));
    cmd.apply(emptyMap());
    const withZz = withContent(emptyMap(), [room('zz', 1, 1, 1, 1)]);
    expect(cmd.undo(withZz).rooms.filter((r) => r.id === 'zz')).toHaveLength(1);
  });
  it('removeRoom survives apply, undo, apply', () => {
    const base = withContent(emptyMap(), [room('a', 1, 1, 2, 2), room('b', 4, 1, 2, 2)]);
    const cmd = removeRoom(base.rooms[0]!);
    const first = cmd.apply(base);
    cmd.undo(first);
    expect(cmd.apply(base)).toEqual(first);
    expect(cmd.undo(first)).toEqual(base);
  });
  it('deleteRoom survives apply, undo, apply', () => {
    const base = withContent(
      emptyMap(),
      [room('a', 1, 1, 2, 2), room('b', 3, 1, 2, 2)],
      [door('d1', 3, 1, 'W'), door('d2', 1, 1, 'N')],
    );
    const cmd = deleteRoom(base, 'a')!;
    const first = cmd.apply(base);
    cmd.undo(first);
    expect(cmd.apply(base)).toEqual(first);
    expect(cmd.undo(first)).toEqual(base);
  });
});

describe('compound', () => {
  it('applies in order and undoes in reverse', () => {
    const base = emptyMap();
    const cmd = compound('two rooms', [addRoom(room('a', 1, 1, 1, 1)), addRoom(room('b', 3, 3, 1, 1))]);
    const after = roundTrip(base, cmd);
    expect(after.rooms.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('deleteRoom', () => {
  it('removes orphaned doors, features inside, and the token', () => {
    const base: DungeonMap = {
      ...withContent(
        emptyMap(),
        [room('a', 1, 1, 2, 2), room('b', 3, 1, 2, 2)],
        // d1 joins a and b (survives); d2 is an open exit on a (orphaned when a goes).
        [door('d1', 3, 1, 'W'), door('d2', 1, 1, 'N')],
      ),
      features: [{ id: 'n', kind: 'note', x: 1, y: 1, text: 'hi' }],
      token: { x: 2, y: 2, trail: [] },
    };
    const cmd = deleteRoom(base, 'a')!;
    const after = roundTrip(base, cmd);
    expect(after.rooms.map((r) => r.id)).toEqual(['b']);
    expect(after.doors.map((d) => d.id)).toEqual(['d1']);
    expect(after.features).toEqual([]);
    expect(after.token).toBeNull();
  });
  it('returns null for an unknown room', () => {
    expect(deleteRoom(emptyMap(), 'nope')).toBeNull();
  });
});

describe('addFeature', () => {
  it('labels by kind', () => {
    expect(addFeature({ id: 's', kind: 'stairs', x: 1, y: 1, dir: 'down' }).label).toBe('Add stairs');
  });
});

describe('deleteRoom on the entrance', () => {
  it('removes the entrance and its boundary door even when a room is attached', () => {
    const base = withContent(
      emptyMap(10, 10),
      [room('e', 4, 10, 1, 1, 'entrance'), room('a', 3, 8, 3, 2, 'room', 1)],
      [door('d', 4, 10, 'N')],
    );
    const after = roundTrip(base, deleteRoom(base, 'e')!);
    expect(after.rooms.map((r) => r.id)).toEqual(['a']);
    expect(after.doors).toEqual([]);
    expect(checkInvariants(after)).toBeNull();
  });
});
