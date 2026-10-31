import { roomAt } from '../core/query';
import type { DungeonMap } from '../core/types';
import { cellRng } from './rng';

/** One short pen stroke, in grid units. */
export interface Stroke {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  alpha: number;
}

/**
 * Hatching for the rock around the floor: every rock square within `reach` squares
 * (Chebyshev distance) of floor gets a few clusters of short parallel strokes at a random
 * angle, fading with distance. Seeded per square, so it is identical on every redraw.
 */
export function hatchStrokes(map: DungeonMap, reach: number): Stroke[] {
  const r = Math.ceil(reach);
  const isFloor = floorLookup(map, r);
  const strokes: Stroke[] = [];
  for (let y = -1 - r; y <= map.height + r; y++) {
    for (let x = -1 - r; x <= map.width + r; x++) {
      if (isFloor(x, y)) continue;
      const d = distanceToFloor(isFloor, x, y, r);
      if (d > reach) continue;
      const rng = cellRng(map.seed, x, y, 1);
      const alpha = d <= 1 ? 0.7 : 0.7 * (1 - (d - 1) / reach);
      const clusters = d <= 1 ? 8 + Math.floor(rng() * 4) : 2 + Math.floor(rng() * 3);
      for (let c = 0; c < clusters; c++) strokes.push(...cluster(rng, x, y, alpha));
    }
  }
  return strokes;
}

function cluster(rng: () => number, x: number, y: number, alpha: number): Stroke[] {
  const cx = x + 0.1 + rng() * 0.8;
  const cy = y + 0.1 + rng() * 0.8;
  const angle = rng() * Math.PI;
  const n = 3 + Math.floor(rng() * 3);
  const len = 0.16 + rng() * 0.1;
  const spacing = 0.05;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const out: Stroke[] = [];
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * spacing;
    const px = cx - dy * off;
    const py = cy + dx * off;
    out.push({ x1: px - (dx * len) / 2, y1: py - (dy * len) / 2, x2: px + (dx * len) / 2, y2: py + (dy * len) / 2, alpha });
  }
  return out;
}

/** Fast floor test over the drawable area (map plus margin), precomputed into a grid. */
export function floorLookup(map: DungeonMap, margin: number): (x: number, y: number) => boolean {
  const x0 = -1 - margin;
  const y0 = -1 - margin;
  const w = map.width + 2 + margin * 2;
  const h = map.height + 2 + margin * 2;
  const grid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (roomAt(map, { x: x + x0, y: y + y0 })) grid[y * w + x] = 1;
  }
  return (x, y) => {
    const gx = x - x0;
    const gy = y - y0;
    return gx >= 0 && gy >= 0 && gx < w && gy < h && grid[gy * w + gx] === 1;
  };
}

function distanceToFloor(isFloor: (x: number, y: number) => boolean, x: number, y: number, r: number): number {
  for (let d = 1; d <= r; d++) {
    for (let dy = -d; dy <= d; dy++) {
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === d && isFloor(x + dx, y + dy)) return d;
      }
    }
  }
  return Infinity;
}
