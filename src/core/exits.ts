import { inBounds, isBoundaryEdge, perimeterEdges, sameEdge, step } from './geometry';
import { doorAt, roomAt } from './query';
import type { Direction, DungeonMap, Edge, Room } from './types';

/** Walls in clockwise order N → E → S → W. */
export const CLOCKWISE: readonly Direction[] = ['N', 'E', 'S', 'W'];

export function entryWall(map: DungeonMap, room: Room): Direction | null {
  if (!room.entryDoorId) return null;
  const d = map.doors.find((x) => x.id === room.entryDoorId);
  if (!d) return null;
  return perimeterEdges(room).find((p) => sameEdge(p.edge, d))?.dir ?? null;
}

/** Edges where a new exit may go, given exits already chosen this step (`chosen` are not yet in the map). */
export function allowedExitEdges(map: DungeonMap, roomId: string, chosen: Edge[]): Edge[] {
  const room = map.rooms.find((r) => r.id === roomId);
  if (!room) return [];
  const entry = entryWall(map, room);
  const perimeter = perimeterEdges(room);
  const blocked = new Set<Direction>();
  if (entry) blocked.add(entry);
  for (const p of perimeter) {
    if (doorAt(map, p.edge) || chosen.some((c) => sameEdge(c, p.edge))) blocked.add(p.dir);
  }
  const out: Edge[] = [];
  for (const p of perimeter) {
    if (blocked.has(p.dir)) continue;
    if (isBoundaryEdge(p.edge, map.width, map.height)) continue;
    const s1 = step(p.inside, p.dir);
    const s2 = step(s1, p.dir);
    if (!inBounds(s1, map.width, map.height) || roomAt(map, s1)) continue;
    if (!inBounds(s2, map.width, map.height) || roomAt(map, s2)) continue;
    out.push(p.edge);
  }
  return out;
}

/** Auto-place up to `count` exits clockwise from the entry wall, starting at wall `firstWall` (0..2). */
export function placeExitsClockwise(
  map: DungeonMap,
  roomId: string,
  count: number,
  firstWall: 0 | 1 | 2,
): { exits: Edge[]; dropped: number } {
  const room = map.rooms.find((r) => r.id === roomId);
  const exits: Edge[] = [];
  if (!room) return { exits, dropped: count };
  const entry = entryWall(map, room);
  const ei = entry ? CLOCKWISE.indexOf(entry) : 3;
  const walls = [1, 2, 3].map((k) => CLOCKWISE[(ei + k) % 4]!);
  for (let k = 0; k < 3 && exits.length < count; k++) {
    const wall = walls[(firstWall + k) % 3]!;
    const onWall = allowedExitEdges(map, roomId, exits).filter(
      (e) => perimeterEdges(room).find((p) => sameEdge(p.edge, e))?.dir === wall,
    );
    if (onWall.length === 0) continue;
    const horizontal = wall === 'N' || wall === 'S';
    const pos = (e: Edge) => (horizontal ? e.x : e.y);
    const mid = horizontal ? room.x + (room.w - 1) / 2 : room.y + (room.h - 1) / 2;
    const best = [...onWall].sort((p, q) => Math.abs(pos(p) - mid) - Math.abs(pos(q) - mid) || pos(p) - pos(q))[0]!;
    exits.push(best);
  }
  return { exits, dropped: count - exits.length };
}
