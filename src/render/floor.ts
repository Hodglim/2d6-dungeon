import type { DungeonMap, Rect } from '../core/types';
import { cellRng } from './rng';

export interface FloorTile {
  x: number;
  y: number;
  /** Index into theme.floor. */
  shade: number;
}

export type DecalKind = 'crack' | 'stain' | 'pebbles';

export interface Decal {
  kind: DecalKind;
  /** Centre, in grid units. */
  x: number;
  y: number;
  size: number;
  angle: number;
  /** Per-decal seed for the drawing code's own small randomness. */
  seed: number;
}

export const DECAL_CHANCE = 0.22;

/** One tile per floor square with a seeded shade. */
export function floorTiles(map: DungeonMap, shades: number): FloorTile[] {
  const tiles: FloorTile[] = [];
  for (const room of map.rooms) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        tiles.push({ x, y, shade: Math.floor(cellRng(map.seed, x, y, 2)() * shades) });
      }
    }
  }
  return tiles;
}

/** Occasional cracks, stains and pebbles on floor squares, seeded per square. */
export function floorDecals(map: DungeonMap): Decal[] {
  const kinds: DecalKind[] = ['crack', 'stain', 'pebbles'];
  const decals: Decal[] = [];
  for (const room of map.rooms) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const rng = cellRng(map.seed, x, y, 3);
        if (rng() >= DECAL_CHANCE) continue;
        decals.push({
          kind: kinds[Math.floor(rng() * kinds.length)]!,
          x: x + 0.2 + rng() * 0.6,
          y: y + 0.2 + rng() * 0.6,
          size: 0.12 + rng() * 0.18,
          angle: rng() * Math.PI * 2,
          seed: Math.floor(rng() * 2 ** 31),
        });
      }
    }
  }
  return decals;
}

/** A splash of blood where a fight was won, in grid units. */
export interface Splat {
  x: number;
  y: number;
  /** Radius of the main splash; droplets land up to about three radii out. */
  size: number;
  /** Seed for the splash's outline and droplets. */
  seed: number;
}

const MAX_SPLATS = 4;

/**
 * Signs of battle in rooms where fights were won: two splashes for the first win, one more per win
 * after, at most four (and never more than the room has squares), each in its own square. The squares
 * under `avoid` (the room labels) and beside a doorway are passed over while others are free. Splash i
 * is picked the same way whatever the count, so a further win adds a splash and moves none.
 */
export function battleSplats(map: DungeonMap, avoid: readonly Rect[]): Splat[] {
  const doorCells = new Set<string>();
  for (const d of map.doors) {
    doorCells.add(`${d.x},${d.y}`);
    doorCells.add(d.side === 'N' ? `${d.x},${d.y - 1}` : `${d.x - 1},${d.y}`);
  }
  const covered = (x: number, y: number) => avoid.some((a) => x + 1 > a.x && x < a.x + a.w && y + 1 > a.y && y < a.y + a.h);
  const splats: Splat[] = [];
  for (const room of map.rooms) {
    if (!room.battles) continue;
    const all: { x: number; y: number }[] = [];
    for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) all.push({ x, y });
    const clear = all.filter((c) => !doorCells.has(`${c.x},${c.y}`) && !covered(c.x, c.y));
    const count = Math.min(room.battles + 1, MAX_SPLATS, all.length);
    const taken = new Set<string>();
    for (let i = 0; i < count; i++) {
      const rng = cellRng(map.seed, room.x, room.y, 100 + i);
      const free = clear.filter((c) => !taken.has(`${c.x},${c.y}`));
      const pool = free.length ? free : all.filter((c) => !taken.has(`${c.x},${c.y}`));
      const c = pool[Math.floor(rng() * pool.length)]!;
      taken.add(`${c.x},${c.y}`);
      splats.push({ x: c.x + 0.3 + rng() * 0.4, y: c.y + 0.3 + rng() * 0.4, size: 0.13 + rng() * 0.1, seed: Math.floor(rng() * 2 ** 31) });
    }
  }
  return splats;
}
