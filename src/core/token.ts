import { setToken, type Command } from './commands';
import { canStep } from './pathfinding';
import type { Cell, Direction, DungeonMap } from './types';

export const TRAIL_CAP = 200;

/**
 * Move the token along a path (as returned by findPath, starting at the token).
 * Every square it leaves is added to the footprint trail; the destination is not, since
 * the token itself is drawn there. Returns null for a path that doesn't start at the token
 * or that isn't a sequence of legal single steps (e.g. a stale path through a wall).
 */
export function moveToken(map: DungeonMap, path: Cell[]): Command | null {
  const before = map.token;
  const last = path[path.length - 1];
  const first = path[0];
  if (!before || !first || !last || path.length < 2) return null;
  if (first.x !== before.x || first.y !== before.y) return null;
  for (let i = 1; i < path.length; i++) {
    const dir = stepDirection(path[i - 1]!, path[i]!);
    if (!dir || !canStep(map, path[i - 1]!, dir)) return null;
  }
  const walked = path.slice(0, -1).map(({ x, y }) => ({ x, y }));
  const trail = [...before.trail, ...walked].slice(-TRAIL_CAP);
  return setToken(before, { x: last.x, y: last.y, trail });
}

function stepDirection(from: Cell, to: Cell): Direction | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === -1) return 'N';
  if (dx === 0 && dy === 1) return 'S';
  if (dx === 1 && dy === 0) return 'E';
  if (dx === -1 && dy === 0) return 'W';
  return null;
}
