import { cellEdge } from '../core/geometry';
import { doorAt, isOpenExit, roomAt } from '../core/query';
import type { Cell, Direction, Door, DungeonMap, Edge, Room } from '../core/types';
import type { Point } from './camera';

export interface Pick {
  cell: Cell;
  edge: Edge | null;
  door: Door | null;
  room: Room | null;
  exit: Door | null;
}

/** Squares; a point snaps to the nearest square edge within this distance of it. */
export const EDGE_TOLERANCE = 0.3;

export function pick(map: DungeonMap, world: Point): Pick {
  const cell = { x: Math.floor(world.x), y: Math.floor(world.y) };
  const fx = world.x - cell.x;
  const fy = world.y - cell.y;
  const candidates: [Direction, number][] = [['N', fy], ['S', 1 - fy], ['W', fx], ['E', 1 - fx]];
  let best: [Direction, number] | null = null;
  for (const c of candidates) if (c[1] <= EDGE_TOLERANCE && (!best || c[1] < best[1])) best = c;
  const edge = best ? cellEdge(cell, best[0]) : null;
  const door = edge ? (doorAt(map, edge) ?? null) : null;
  return {
    cell,
    edge,
    door,
    room: roomAt(map, cell) ?? null,
    exit: door && isOpenExit(map, door) ? door : null,
  };
}
