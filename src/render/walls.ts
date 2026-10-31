import { edgeCells } from '../core/geometry';
import { deriveWalls, roomAt } from '../core/query';
import type { Direction, DungeonMap, Edge } from '../core/types';

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function edgeSegment(e: Edge): Segment {
  return e.side === 'N' ? { x1: e.x, y1: e.y, x2: e.x + 1, y2: e.y } : { x1: e.x, y1: e.y, x2: e.x, y2: e.y + 1 };
}

/** Wall lines, with collinear touching edges merged so corners and long walls draw cleanly. */
export function wallSegments(map: DungeonMap): Segment[] {
  const rows = new Map<number, number[]>();
  const cols = new Map<number, number[]>();
  for (const e of deriveWalls(map)) {
    const bucket = e.side === 'N' ? rows : cols;
    const key = e.side === 'N' ? e.y : e.x;
    const list = bucket.get(key) ?? [];
    list.push(e.side === 'N' ? e.x : e.y);
    bucket.set(key, list);
  }
  const out: Segment[] = [];
  const merge = (bucket: Map<number, number[]>, horizontal: boolean) => {
    for (const [line, starts] of bucket) {
      starts.sort((a, b) => a - b);
      let runStart = starts[0]!;
      let prev = runStart;
      for (const s of [...starts.slice(1), Infinity]) {
        if (s === prev + 1) {
          prev = s;
          continue;
        }
        out.push(horizontal ? { x1: runStart, y1: line, x2: prev + 1, y2: line } : { x1: line, y1: runStart, x2: line, y2: prev + 1 });
        runStart = s;
        prev = s;
      }
    }
  };
  merge(rows, true);
  merge(cols, false);
  return out;
}

export interface ShadowEdge {
  seg: Segment;
  /** Direction from the wall into the floor the shadow falls on. */
  inward: Direction;
}

/** One shadow strip per floor side of every wall edge. */
export function wallShadows(map: DungeonMap): ShadowEdge[] {
  const out: ShadowEdge[] = [];
  for (const e of deriveWalls(map)) {
    const [a, b] = edgeCells(e);
    const seg = edgeSegment(e);
    if (roomAt(map, a)) out.push({ seg, inward: e.side === 'N' ? 'N' : 'W' });
    if (roomAt(map, b)) out.push({ seg, inward: e.side === 'N' ? 'S' : 'E' });
  }
  return out;
}
