import { edgeCells, rectContains } from './geometry';
import { roomAt } from './query';
import type { Door, DungeonMap, Feature, Room, Token } from './types';

/** A reversible change to a map. apply/undo are pure: they return a new map.
 * Commands may capture state during apply; undo must only be called after the matching apply
 * (History guarantees this). */
export interface Command {
  label: string;
  apply(map: DungeonMap): DungeonMap;
  undo(map: DungeonMap): DungeonMap;
}

type Collection = 'rooms' | 'doors' | 'features';
type ItemOf<K extends Collection> = DungeonMap[K][number];

function addItem<K extends Collection>(key: K, item: ItemOf<K>, label: string): Command {
  return {
    label,
    apply: (m) => ({ ...m, [key]: [...m[key], item] }),
    undo: (m) => ({ ...m, [key]: (m[key] as ItemOf<K>[]).filter((x) => x.id !== item.id) }),
  };
}

function removeItem<K extends Collection>(key: K, item: ItemOf<K>, label: string): Command {
  let index = -1;
  return {
    label,
    apply: (m) => {
      const list = m[key] as ItemOf<K>[];
      index = list.findIndex((x) => x.id === item.id);
      return { ...m, [key]: list.filter((x) => x.id !== item.id) };
    },
    undo: (m) => {
      const list = [...(m[key] as ItemOf<K>[])];
      if (list.some((x) => x.id === item.id)) return m;
      list.splice(index < 0 ? list.length : index, 0, item);
      return { ...m, [key]: list };
    },
  };
}

function updateItem<K extends Collection>(key: K, before: ItemOf<K>, after: ItemOf<K>, label: string): Command {
  const swap = (from: ItemOf<K>, to: ItemOf<K>) => (m: DungeonMap) => ({
    ...m,
    [key]: (m[key] as ItemOf<K>[]).map((x) => (x.id === from.id ? to : x)),
  });
  return { label, apply: swap(before, after), undo: swap(after, before) };
}

export const addRoom = (room: Room) => addItem('rooms', room, 'Add room');
export const removeRoom = (room: Room) => removeItem('rooms', room, 'Remove room');
export const updateRoom = (before: Room, after: Room) => updateItem('rooms', before, after, 'Edit room');

export const addDoor = (door: Door) => addItem('doors', door, 'Add door');
export const removeDoor = (door: Door) => removeItem('doors', door, 'Remove door');
export const updateDoor = (before: Door, after: Door) => updateItem('doors', before, after, 'Edit door');

export const addFeature = (f: Feature) => addItem('features', f, `Add ${f.kind}`);
export const removeFeature = (f: Feature) => removeItem('features', f, `Remove ${f.kind}`);
export const updateFeature = (before: Feature, after: Feature) => updateItem('features', before, after, `Edit ${after.kind}`);

export function setToken(before: Token | null, after: Token | null): Command {
  return {
    label: 'Move token',
    apply: (m) => ({ ...m, token: after }),
    undo: (m) => ({ ...m, token: before }),
  };
}

export function updateMapInfo(
  before: Pick<DungeonMap, 'title' | 'hero' | 'level' | 'defaultDoorType' | 'themeId'>,
  after: Pick<DungeonMap, 'title' | 'hero' | 'level' | 'defaultDoorType' | 'themeId'>,
): Command {
  return {
    label: 'Edit map info',
    apply: (m) => ({ ...m, ...after }),
    undo: (m) => ({ ...m, ...before }),
  };
}

/** Several commands applied in order and undone in reverse, as one undo step. */
export function compound(label: string, commands: Command[]): Command {
  return {
    label,
    apply: (m) => commands.reduce((acc, c) => c.apply(acc), m),
    undo: (m) => commands.reduceRight((acc, c) => c.undo(acc), m),
  };
}

/**
 * Delete a room plus everything that would be left dangling: doors with no room on
 * either side after deletion (and, for the entrance, its boundary door), features inside
 * it, and the token if it stands there.
 */
export function deleteRoom(map: DungeonMap, roomId: string): Command | null {
  const room = map.rooms.find((r) => r.id === roomId);
  if (!room) return null;
  const without: DungeonMap = { ...map, rooms: map.rooms.filter((r) => r.id !== roomId) };
  const orphanDoors = map.doors.filter((d) => {
    const cells = edgeCells(d);
    if (room.kind === 'entrance' && cells.some((c) => rectContains(room, c))) return true;
    return cells.every((c) => !roomAt(without, c));
  });
  const features = map.features.filter((f) => rectContains(room, f));
  const cmds: Command[] = [
    ...orphanDoors.map(removeDoor),
    ...features.map(removeFeature),
  ];
  if (map.token && rectContains(room, map.token)) cmds.push(setToken(map.token, null));
  cmds.push(removeRoom(room));
  return compound('Delete room', cmds);
}
