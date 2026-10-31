import { rectsOverlap } from '../core/geometry';
import type { DungeonMap, Rect, Room } from '../core/types';

export interface LabelBox extends Rect {
  roomId: string;
  text: string;
}

/** Text size in grid units. */
export type MeasureText = (text: string) => { w: number; h: number };

const STEP = 0.25;
const INSET = 0.12;
const GAP = 0.06;
/** Outside searches widen through these margins (squares around the room), then the whole world. */
const OUTSIDE_MARGINS = [1.5, 3, 6, Infinity];

export function labelText(room: Room): string {
  const type = room.label.type.trim();
  return type ? `${room.number} - ${type}` : `${room.number}`;
}

/**
 * Place a boxed label for every numbered room. Preferred spot: inside the room, as close
 * as possible to its entry door. If the text doesn't fit inside the room, the box moves to
 * the nearest spot on the rock outside where it overlaps no room and no other label.
 * Labels are placed in room-number order, so earlier rooms keep their spots.
 */
export function placeLabels(map: DungeonMap, measure: MeasureText): LabelBox[] {
  const placed: LabelBox[] = [];
  const rooms = map.rooms.filter((r) => r.kind === 'room').sort((a, b) => a.number - b.number);
  const doorZones = map.doors.map(doorZone);
  const roomsGrown = map.rooms.map((o) => grow(o, GAP));
  const placedGrown: Rect[] = [];
  for (const room of rooms) {
    const text = labelText(room);
    const { w, h } = measure(text);
    const anchor = anchorPoint(map, room);
    const free = (r: Rect) => !placedGrown.some((p) => rectsOverlap(p, r)) && !doorZones.some((z) => rectsOverlap(z, r));
    const onRock = (r: Rect) => !roomsGrown.some((o) => rectsOverlap(o, r));
    let rect = bestSpot(insideCandidates(room, w, h), anchor, free);
    for (let i = 0; !rect && i < OUTSIDE_MARGINS.length; i++) {
      rect = bestSpot(outsideCandidates(map, room, w, h, OUTSIDE_MARGINS[i]!), anchor, (r) => free(r) && onRock(r));
    }
    // Nothing is free anywhere: at least keep clear of rooms, else sit on the anchor within the world.
    rect ??= bestSpot(outsideCandidates(map, room, w, h, Infinity), anchor, onRock);
    rect ??= clampToWorld(map, { x: anchor.x - w / 2, y: anchor.y - h / 2, w, h });
    placed.push({ ...rect, roomId: room.id, text });
    placedGrown.push(grow(rect, GAP));
  }
  return placed;
}

function clampToWorld(map: DungeonMap, r: Rect): Rect {
  const x = Math.max(-1, Math.min(map.width + 1 - r.w, r.x));
  const y = Math.max(-1, Math.min(map.height + 1 - r.h, r.y));
  return { ...r, x, y };
}

/** The middle of the room's entry door, or the room's top-left corner area if it has none. */
export function anchorPoint(map: DungeonMap, room: Room): { x: number; y: number } {
  const door = map.doors.find((d) => d.id === room.entryDoorId);
  if (!door) return { x: room.x + 0.5, y: room.y + 0.5 };
  return door.side === 'N' ? { x: door.x + 0.5, y: door.y } : { x: door.x, y: door.y + 0.5 };
}

function insideCandidates(room: Room, w: number, h: number): Rect[] {
  return grid(room.x + INSET, room.y + INSET, room.x + room.w - INSET - w, room.y + room.h - INSET - h, w, h);
}

function outsideCandidates(map: DungeonMap, room: Room, w: number, h: number, margin: number): Rect[] {
  const minX = Math.max(-1, room.x - w - margin);
  const minY = Math.max(-1, room.y - h - margin);
  const maxX = Math.min(map.width + 1 - w, room.x + room.w + margin);
  const maxY = Math.min(map.height + 1 - h, room.y + room.h + margin);
  return grid(minX, minY, maxX, maxY, w, h);
}

function grid(x0: number, y0: number, x1: number, y1: number, w: number, h: number): Rect[] {
  const out: Rect[] = [];
  for (let y = y0; y <= y1 + 1e-9; y += STEP) {
    for (let x = x0; x <= x1 + 1e-9; x += STEP) out.push({ x, y, w, h });
  }
  return out;
}

function bestSpot(cands: Rect[], anchor: { x: number; y: number }, ok: (r: Rect) => boolean): Rect | null {
  let best: Rect | null = null;
  let bestScore = Infinity;
  for (const r of cands) {
    if (!ok(r)) continue;
    const nx = Math.max(r.x, Math.min(anchor.x, r.x + r.w));
    const ny = Math.max(r.y, Math.min(anchor.y, r.y + r.h));
    const edgeDist = Math.hypot(anchor.x - nx, anchor.y - ny);
    const centreDist = Math.hypot(anchor.x - (r.x + r.w / 2), anchor.y - (r.y + r.h / 2));
    const score = edgeDist * 10 + centreDist;
    if (score < bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

/** The area a door symbol (and its lock) occupies, which labels must keep clear of. */
export function doorZone(d: { x: number; y: number; side: 'N' | 'W' }): Rect {
  return d.side === 'N' ? { x: d.x, y: d.y - 0.36, w: 1, h: 0.72 } : { x: d.x - 0.36, y: d.y, w: 0.72, h: 1 };
}

function grow(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 };
}
