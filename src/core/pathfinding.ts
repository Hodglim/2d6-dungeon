import { cellEdge, step } from './geometry';
import { doorAt, roomAt } from './query';
import type { Cell, Direction, DungeonMap } from './types';

const DIRS: Direction[] = ['N', 'E', 'S', 'W'];

/** Can the token move one square from `from` in `dir`? Needs floor on both sides, and a non-secret door between different rooms. */
export function canStep(map: DungeonMap, from: Cell, dir: Direction): boolean {
  const to = step(from, dir);
  const a = roomAt(map, from);
  const b = roomAt(map, to);
  if (!a || !b) return false;
  if (a.id === b.id) return true;
  const door = doorAt(map, cellEdge(from, dir));
  return door !== undefined && !door.secret;
}

const key = (c: Cell) => `${c.x},${c.y}`;
const manhattan = (a: Cell, b: Cell) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** A* shortest path from `from` to `to` (inclusive of both), or null if unreachable. */
export function findPath(map: DungeonMap, from: Cell, to: Cell): Cell[] | null {
  if (!roomAt(map, from) || !roomAt(map, to)) return null;
  const open: Cell[] = [from];
  const came = new Map<string, Cell>();
  const g = new Map<string, number>([[key(from), 0]]);
  const f = new Map<string, number>([[key(from), manhattan(from, to)]]);

  while (open.length > 0) {
    open.sort((a, b) => f.get(key(a))! - f.get(key(b))!);
    const current = open.shift()!;
    if (current.x === to.x && current.y === to.y) {
      const path = [current];
      let k = key(current);
      while (came.has(k)) {
        const prev = came.get(k)!;
        path.unshift(prev);
        k = key(prev);
      }
      return path;
    }
    for (const dir of DIRS) {
      if (!canStep(map, current, dir)) continue;
      const next = step(current, dir);
      const nk = key(next);
      const tentative = g.get(key(current))! + 1;
      if (tentative < (g.get(nk) ?? Infinity)) {
        came.set(nk, current);
        g.set(nk, tentative);
        f.set(nk, tentative + manhattan(next, to));
        if (!open.some((c) => c.x === next.x && c.y === next.y)) open.push(next);
      }
    }
  }
  return null;
}
