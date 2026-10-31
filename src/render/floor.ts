import type { DungeonMap } from '../core/types';
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
