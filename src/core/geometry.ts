import type { Cell, Direction, Edge, Rect } from './types';

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function rectContains(r: Rect, c: Cell): boolean {
  return c.x >= r.x && c.x < r.x + r.w && c.y >= r.y && c.y < r.y + r.h;
}

/** Clip a rect to the area 0..width-1 × 0..height-1. Returns null if nothing remains. */
export function clipRect(r: Rect, width: number, height: number): Rect | null {
  const x0 = Math.max(r.x, 0);
  const y0 = Math.max(r.y, 0);
  const x1 = Math.min(r.x + r.w, width);
  const y1 = Math.min(r.y + r.h, height);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function inBounds(c: Cell, width: number, height: number): boolean {
  return c.x >= 0 && c.x < width && c.y >= 0 && c.y < height;
}

/** The canonical edge on the given side of a square. */
export function cellEdge(c: Cell, dir: Direction): Edge {
  switch (dir) {
    case 'N':
      return { x: c.x, y: c.y, side: 'N' };
    case 'S':
      return { x: c.x, y: c.y + 1, side: 'N' };
    case 'W':
      return { x: c.x, y: c.y, side: 'W' };
    case 'E':
      return { x: c.x + 1, y: c.y, side: 'W' };
  }
}

/** The two squares an edge separates: [north-or-west square, south-or-east square]. */
export function edgeCells(e: Edge): [Cell, Cell] {
  return e.side === 'N'
    ? [{ x: e.x, y: e.y - 1 }, { x: e.x, y: e.y }]
    : [{ x: e.x - 1, y: e.y }, { x: e.x, y: e.y }];
}

export function edgeKey(e: Edge): string {
  return `${e.x},${e.y},${e.side}`;
}

export function sameEdge(a: Edge, b: Edge): boolean {
  return a.x === b.x && a.y === b.y && a.side === b.side;
}

/** True if the edge lies on the map's Outer Boundary. */
export function isBoundaryEdge(e: Edge, width: number, height: number): boolean {
  if (e.side === 'N') return (e.y === 0 || e.y === height) && e.x >= 0 && e.x < width;
  return (e.x === 0 || e.x === width) && e.y >= 0 && e.y < height;
}

/** Every edge around the outside of a rect, with the inside square and outward direction. */
export function perimeterEdges(r: Rect): { edge: Edge; inside: Cell; dir: Direction }[] {
  const out: { edge: Edge; inside: Cell; dir: Direction }[] = [];
  for (let x = r.x; x < r.x + r.w; x++) {
    const top = { x, y: r.y };
    const bottom = { x, y: r.y + r.h - 1 };
    out.push({ edge: cellEdge(top, 'N'), inside: top, dir: 'N' });
    out.push({ edge: cellEdge(bottom, 'S'), inside: bottom, dir: 'S' });
  }
  for (let y = r.y; y < r.y + r.h; y++) {
    const left = { x: r.x, y };
    const right = { x: r.x + r.w - 1, y };
    out.push({ edge: cellEdge(left, 'W'), inside: left, dir: 'W' });
    out.push({ edge: cellEdge(right, 'E'), inside: right, dir: 'E' });
  }
  return out;
}

export function step(c: Cell, dir: Direction): Cell {
  switch (dir) {
    case 'N':
      return { x: c.x, y: c.y - 1 };
    case 'S':
      return { x: c.x, y: c.y + 1 };
    case 'W':
      return { x: c.x - 1, y: c.y };
    case 'E':
      return { x: c.x + 1, y: c.y };
  }
}
