import { setToken, type Command } from './commands';
import type { Cell, DungeonMap } from './types';

export const TRAIL_CAP = 200;

/**
 * Move the token along a path (as returned by findPath, starting at the token).
 * Every square it leaves is added to the footprint trail.
 */
export function moveToken(map: DungeonMap, path: Cell[]): Command | null {
  const before = map.token;
  const last = path[path.length - 1];
  if (!before || !last || path.length < 2) return null;
  const walked = path.slice(0, -1).map(({ x, y }) => ({ x, y }));
  const trail = [...before.trail, ...walked].slice(-TRAIL_CAP);
  return setToken(before, { x: last.x, y: last.y, trail });
}
