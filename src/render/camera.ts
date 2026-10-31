import type { DungeonMap, Rect } from '../core/types';

/** World units are grid squares. screen = (world - origin) * scale. */
export interface Camera {
  x: number;
  y: number;
  /** Screen pixels per grid square. */
  scale: number;
}

export interface Point {
  x: number;
  y: number;
}

export const MIN_SCALE = 6;
export const MAX_SCALE = 160;

export function worldToScreen(c: Camera, p: Point): Point {
  return { x: (p.x - c.x) * c.scale, y: (p.y - c.y) * c.scale };
}

export function screenToWorld(c: Camera, p: Point): Point {
  return { x: p.x / c.scale + c.x, y: p.y / c.scale + c.y };
}

/** The drawable world area: the map plus a one-square ring for the entrance and hatching. */
export function worldBounds(map: DungeonMap): Rect {
  return { x: -1, y: -1, w: map.width + 2, h: map.height + 2 };
}

/** A camera that fits `bounds` inside a view of the given pixel size, centred, with padding. */
export function fitCamera(bounds: Rect, viewW: number, viewH: number, padding = 16): Camera {
  const availW = Math.max(1, viewW - padding * 2);
  const availH = Math.max(1, viewH - padding * 2);
  const scale = clampScale(Math.min(availW / bounds.w, availH / bounds.h));
  return {
    scale,
    x: bounds.x + bounds.w / 2 - viewW / 2 / scale,
    y: bounds.y + bounds.h / 2 - viewH / 2 / scale,
  };
}

/** Zoom by `factor`, keeping the world point under `screen` fixed. */
export function zoomAt(c: Camera, factor: number, screen: Point): Camera {
  const scale = clampScale(c.scale * factor);
  const anchor = screenToWorld(c, screen);
  return { scale, x: anchor.x - screen.x / scale, y: anchor.y - screen.y / scale };
}

/** Pan by a screen-pixel delta (content follows the pointer). */
export function panBy(c: Camera, dx: number, dy: number): Camera {
  return { ...c, x: c.x - dx / c.scale, y: c.y - dy / c.scale };
}

export function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}
