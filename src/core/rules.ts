import {
  clipRect,
  edgeCells,
  edgeKey,
  inBounds,
  isBoundaryEdge,
  perimeterEdges,
  rectContains,
  rectsOverlap,
  step,
} from './geometry';
import { doorAt, roomAt, roomsAcross } from './query';
import type { Cell, Direction, Door, DungeonMap, Edge, Rect, Room } from './types';

export function describeRoom(r: Room): string {
  if (r.kind === 'room') return `Room ${r.number}`;
  return r.kind === 'passage' ? 'a passage' : 'the entrance';
}

/** Direction pointing out of an open exit, away from the room it belongs to. */
export function exitDirection(map: DungeonMap, door: Door): Direction | null {
  const [a, b] = roomsAcross(map, door);
  if (a && !b) return door.side === 'N' ? 'S' : 'E';
  if (!a && b) return door.side === 'N' ? 'N' : 'W';
  return null;
}

/** The empty square just beyond an open exit. */
export function exitTarget(map: DungeonMap, door: Door): Cell | null {
  const dir = exitDirection(map, door);
  if (!dir) return null;
  const [a, b] = edgeCells(door);
  return dir === 'S' || dir === 'E' ? b : a;
}

/** Number of slide positions for a w×h room against an exit. */
export function slideRange(map: DungeonMap, door: Door, w: number, h: number): number {
  const dir = exitDirection(map, door);
  if (!dir) return 0;
  return dir === 'N' || dir === 'S' ? w : h;
}

/**
 * Unclipped rect for a w×h room beyond an open exit. `offset` slides the room along the
 * exit's wall: 0 puts the exit at the room's left (or top) end.
 */
export function ghostRect(map: DungeonMap, door: Door, w: number, h: number, offset: number): Rect | null {
  const dir = exitDirection(map, door);
  const t = exitTarget(map, door);
  if (!dir || !t) return null;
  const max = (dir === 'N' || dir === 'S' ? w : h) - 1;
  const o = Math.max(0, Math.min(offset, max));
  switch (dir) {
    case 'N':
      return { x: t.x - o, y: t.y - h + 1, w, h };
    case 'S':
      return { x: t.x - o, y: t.y, w, h };
    case 'W':
      return { x: t.x - w + 1, y: t.y - o, w, h };
    case 'E':
      return { x: t.x, y: t.y - o, w, h };
  }
}

export interface PlacementResult {
  ok: boolean;
  /** The rect after clipping at the Outer Boundary (null if nothing remains). */
  rect: Rect | null;
  rolled: { w: number; h: number };
  clipped: boolean;
  reason?: string;
}

export function firstOverlap(map: DungeonMap, rect: Rect, ignoreId?: string): Room | undefined {
  return map.rooms.find((r) => r.id !== ignoreId && rectsOverlap(r, rect));
}

export function evaluatePlacement(
  map: DungeonMap,
  door: Door,
  w: number,
  h: number,
  offset: number,
): PlacementResult {
  const rolled = { w, h };
  const raw = ghostRect(map, door, w, h, offset);
  const target = exitTarget(map, door);
  if (!raw || !target) {
    return { ok: false, rect: null, rolled, clipped: false, reason: 'That door is not an open exit' };
  }
  const rect = clipRect(raw, map.width, map.height);
  if (!rect || !rectContains(rect, target)) {
    return {
      ok: false,
      rect,
      rolled,
      clipped: rect !== null && (rect.w !== w || rect.h !== h),
      reason: 'The room must connect to the exit',
    };
  }
  const clipped = rect.w !== w || rect.h !== h;
  const hit = firstOverlap(map, rect);
  if (hit) {
    return { ok: false, rect, rolled, clipped, reason: `Overlaps ${describeRoom(hit)}` };
  }
  return { ok: true, rect, rolled, clipped };
}

/**
 * Wall edges of a room where an exit may be placed: not on the Outer Boundary and not
 * already a door. With passages on, the square beyond must also be empty.
 */
export function validExitEdges(map: DungeonMap, roomId: string, passages: boolean): Edge[] {
  const room = map.rooms.find((r) => r.id === roomId);
  if (!room) return [];
  return perimeterEdges(room)
    .filter(({ edge, inside, dir }) => {
      if (isBoundaryEdge(edge, map.width, map.height)) return false;
      if (doorAt(map, edge)) return false;
      const beyond = step(inside, dir);
      if (!inBounds(beyond, map.width, map.height)) return false;
      if (passages && roomAt(map, beyond)) return false;
      return true;
    })
    .map(({ edge }) => edge);
}

export function entranceInwardDirection(edge: Direction): Direction {
  return ({ N: 'S', S: 'N', E: 'W', W: 'E' } as const)[edge];
}

/** Squares just outside the Outer Boundary on the given edge where the entrance may go. */
export function entranceCells(map: DungeonMap, edge: Direction): Cell[] {
  const cells: Cell[] = [];
  if (edge === 'N' || edge === 'S') {
    const y = edge === 'N' ? -1 : map.height;
    for (let x = 0; x < map.width; x++) cells.push({ x, y });
  } else {
    const x = edge === 'W' ? -1 : map.width;
    for (let y = 0; y < map.height; y++) cells.push({ x, y });
  }
  return cells;
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
  for (const f of map.features) {
    if (!roomAt(map, f)) return 'A feature is not on a floor square';
  }
  if (map.token && !roomAt(map, map.token)) return 'The token is not on a floor square';
  return null;
}
