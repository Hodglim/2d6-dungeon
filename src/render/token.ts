import { roomAt } from '../core/query';
import type { Cell, DungeonMap } from '../core/types';

export interface Footprint {
  /** Centre, in grid units. */
  x: number;
  y: number;
  /** Heading in radians (0 = east, π/2 = south). */
  angle: number;
  left: boolean;
  /** 0 = newest, approaching 1 = oldest. */
  age: number;
}

const SIDE_OFFSET = 0.11;

/** Position along a path of squares after travelling `distance` squares, at square centres. */
export function pathPosition(path: Cell[], distance: number): { x: number; y: number; done: boolean } {
  const last = path[path.length - 1];
  if (!last) return { x: 0, y: 0, done: true };
  const max = path.length - 1;
  if (!Number.isNaN(distance) && distance >= max) return { x: last.x + 0.5, y: last.y + 0.5, done: true };
  const d = Number.isNaN(distance) ? 0 : Math.max(0, distance);
  const i = Math.floor(d);
  const t = d - i;
  const a = path[i]!;
  const b = path[i + 1]!;
  return { x: a.x + (b.x - a.x) * t + 0.5, y: a.y + (b.y - a.y) * t + 0.5, done: false };
}

/**
 * Footprints for a trail of squares walked, heading towards the token. Feet alternate left
 * and right of the square centre. Squares that are no longer floor are skipped.
 */
export function footprints(map: DungeonMap, trail: Cell[], token: Cell | null): Footprint[] {
  const steps = token ? [...trail, token] : trail;
  const out: Footprint[] = [];
  const n = trail.length;
  for (let i = 0; i < n; i++) {
    const here = steps[i]!;
    const next = steps[i + 1] ?? here;
    const prev = steps[i - 1] ?? here;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    if (!roomAt(map, here)) continue;
    const angle = dx === 0 && dy === 0 ? -Math.PI / 2 : Math.atan2(dy, dx);
    const left = i % 2 === 0;
    const side = left ? -1 : 1;
    out.push({
      x: here.x + 0.5 + -Math.sin(angle) * SIDE_OFFSET * side,
      y: here.y + 0.5 + Math.cos(angle) * SIDE_OFFSET * side,
      angle,
      left,
      age: n <= 1 ? 0 : (n - 1 - i) / n,
    });
  }
  return out;
}
