import { clipRect, inBounds, isBoundaryEdge, perimeterEdges, rectContains, rectsOverlap, step } from './geometry';
import { describeRoom } from './invariants';
import { doorAt, exitDirection, exitTarget, roomAt } from './query';
import type { Cell, Direction, Door, DungeonMap, Edge, Rect, Room } from './types';

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
 * Largest-area w'×h' (w'≤w, h'≤h) and slide offset that fits in front of the exit.
 * Ties go to the larger width, then the offset closest to the requested one.
 */
export function shrinkToFit(
  map: DungeonMap,
  door: Door,
  w: number,
  h: number,
  offset: number,
): { w: number; h: number; offset: number } | null {
  let best: { w: number; h: number; offset: number } | null = null;
  for (let cw = w; cw >= 1; cw--) {
    for (let ch = h; ch >= 1; ch--) {
      const n = slideRange(map, door, cw, ch);
      for (let o = 0; o < n; o++) {
        if (!evaluatePlacement(map, door, cw, ch, o).ok) continue;
        const better =
          !best ||
          cw * ch > best.w * best.h ||
          (cw * ch === best.w * best.h &&
            (cw > best.w || (cw === best.w && Math.abs(o - offset) < Math.abs(best.offset - offset))));
        if (better) best = { w: cw, h: ch, offset: o };
      }
    }
  }
  return best;
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
