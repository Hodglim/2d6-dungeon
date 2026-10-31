import { clipRect, rectContains, rectsOverlap } from './geometry';
import { describeRoom } from './invariants';
import { exitDirection, exitTarget } from './query';
import type { Cell, Direction, Door, DungeonMap, Rect, Room } from './types';

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
 * The w'×h' (w'≤w, h'≤h) and slide offset that fits in front of the exit with the largest
 * placed (boundary-clipped) area. Ties go to the larger placed width, then the offset
 * closest to the requested one.
 */
export function shrinkToFit(
  map: DungeonMap,
  door: Door,
  w: number,
  h: number,
  offset: number,
): { w: number; h: number; offset: number } | null {
  let best: { w: number; h: number; offset: number; rect: Rect } | null = null;
  for (let cw = w; cw >= 1; cw--) {
    for (let ch = h; ch >= 1; ch--) {
      const n = slideRange(map, door, cw, ch);
      for (let o = 0; o < n; o++) {
        const p = evaluatePlacement(map, door, cw, ch, o);
        if (!p.ok || !p.rect) continue;
        const area = p.rect.w * p.rect.h;
        const bestArea = best ? best.rect.w * best.rect.h : -1;
        const better =
          !best ||
          area > bestArea ||
          (area === bestArea &&
            (p.rect.w > best.rect.w ||
              (p.rect.w === best.rect.w && Math.abs(o - offset) < Math.abs(best.offset - offset))));
        if (better) best = { w: cw, h: ch, offset: o, rect: p.rect };
      }
    }
  }
  return best && { w: best.w, h: best.h, offset: best.offset };
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
