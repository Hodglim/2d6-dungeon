import { edgeCells, edgeKey, perimeterEdges, rectContains, sameEdge } from './geometry';
import type { Cell, Door, DungeonMap, Edge, Room } from './types';

export function roomAt(map: DungeonMap, c: Cell): Room | undefined {
  return map.rooms.find((r) => rectContains(r, c));
}

export function doorAt(map: DungeonMap, e: Edge): Door | undefined {
  return map.doors.find((d) => sameEdge(d, e));
}

/** Rooms on either side of an edge: [north-or-west, south-or-east]. */
export function roomsAcross(map: DungeonMap, e: Edge): [Room | undefined, Room | undefined] {
  const [a, b] = edgeCells(e);
  return [roomAt(map, a), roomAt(map, b)];
}

/** A door with a room on exactly one side: an unexplored exit. */
export function isOpenExit(map: DungeonMap, d: Door): boolean {
  const [a, b] = roomsAcross(map, d);
  return (a === undefined) !== (b === undefined);
}

export function openExits(map: DungeonMap): Door[] {
  return map.doors.filter((d) => isOpenExit(map, d));
}

/** Wall edges, derived from rooms and doors. Each edge appears once. */
export function deriveWalls(map: DungeonMap): Edge[] {
  const seen = new Set<string>();
  const walls: Edge[] = [];
  for (const room of map.rooms) {
    for (const { edge } of perimeterEdges(room)) {
      const key = edgeKey(edge);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!doorAt(map, edge)) walls.push(edge);
    }
  }
  return walls;
}

export function nextRoomNumber(map: DungeonMap): number {
  return map.rooms.reduce((max, r) => (r.kind === 'room' ? Math.max(max, r.number) : max), 0) + 1;
}
