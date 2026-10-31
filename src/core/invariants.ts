import { clipRect, edgeKey, isBoundaryEdge, perimeterEdges, rectsOverlap, sameEdge } from './geometry';
import { roomAt, roomsAcross } from './query';
import type { DungeonMap, Room } from './types';

export function describeRoom(r: Room): string {
  if (r.kind === 'room') return `Room ${r.number}`;
  return r.kind === 'passage' ? 'a passage' : 'the entrance';
}

/** Returns a description of the first broken invariant, or null if the map is valid. */
export function checkInvariants(map: DungeonMap): string | null {
  const ids = new Set<string>();
  for (const item of [...map.rooms, ...map.doors, ...map.features]) {
    if (ids.has(item.id)) return `Duplicate id ${item.id}`;
    ids.add(item.id);
  }
  for (const r of map.rooms) {
    if (r.w < 1 || r.h < 1) return `${describeRoom(r)} has no area`;
    if (r.kind === 'entrance') {
      const xIn = r.x >= 0 && r.x < map.width;
      const yIn = r.y >= 0 && r.y < map.height;
      const xOut = r.x === -1 || r.x === map.width;
      const yOut = r.y === -1 || r.y === map.height;
      const besideBoundary = (xOut && yIn) || (yOut && xIn);
      if (r.w !== 1 || r.h !== 1 || !besideBoundary) {
        return 'The entrance must be one square outside the boundary';
      }
    } else {
      const c = clipRect(r, map.width, map.height);
      if (!c || c.w !== r.w || c.h !== r.h) return `${describeRoom(r)} crosses the Outer Boundary`;
    }
  }
  for (let i = 0; i < map.rooms.length; i++) {
    for (let j = i + 1; j < map.rooms.length; j++) {
      const a = map.rooms[i]!;
      const b = map.rooms[j]!;
      if (rectsOverlap(a, b)) return `${describeRoom(a)} overlaps ${describeRoom(b)}`;
    }
  }
  if (map.rooms.filter((r) => r.kind === 'entrance').length > 1) return 'A map can have only one entrance';
  const edgeKeys = new Set<string>();
  for (const d of map.doors) {
    const key = edgeKey(d);
    if (edgeKeys.has(key)) return 'Two doors share one edge';
    edgeKeys.add(key);
    const [a, b] = roomsAcross(map, d);
    if (!a && !b) return 'A door is not attached to any room';
    if (a && b && a.id === b.id) return 'A door is inside a room';
    if ((a?.kind === 'entrance' || b?.kind === 'entrance') && !isBoundaryEdge(d, map.width, map.height)) {
      return 'Doors on the entrance must lead into the map';
    }
    if (isBoundaryEdge(d, map.width, map.height) && a?.kind !== 'entrance' && b?.kind !== 'entrance') {
      return 'Exits cannot be placed on the Outer Boundary';
    }
  }
  for (const r of map.rooms) {
    if (r.entryDoorId === null) continue;
    const entry = map.doors.find((d) => d.id === r.entryDoorId);
    if (!entry || !perimeterEdges(r).some((p) => sameEdge(p.edge, entry))) {
      return `${describeRoom(r)} has lost the door it was entered through`;
    }
  }
  for (const f of map.features) {
    if (!roomAt(map, f)) return 'A feature is not on a floor square';
  }
  if (map.token && !roomAt(map, map.token)) return 'The token is not on a floor square';
  return null;
}
