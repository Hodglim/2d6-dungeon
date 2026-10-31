import { createMap } from '../../src/core/campaign';
import { sequentialIds } from '../../src/core/ids';
import { dungeonSystem } from '../../src/systems/dungeon';
import type { Door, DungeonMap, Room, RoomKind, Side } from '../../src/core/types';

export function emptyMap(width = 10, height = 10): DungeonMap {
  return createMap(dungeonSystem, { width, height, seed: 1, newId: sequentialIds('map') });
}

export function room(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: RoomKind = 'room',
  number = 0,
): Room {
  return { id, number, kind, x, y, w, h, label: { type: '', unique: false, narrative: '' }, entryDoorId: null };
}

export function door(id: string, x: number, y: number, side: Side, type = 'archway'): Door {
  return { id, x, y, side, type, secret: false, lock: null };
}

export function withContent(map: DungeonMap, rooms: Room[], doors: Door[] = []): DungeonMap {
  return { ...map, rooms, doors };
}
