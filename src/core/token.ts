import { setToken, type Command } from './commands';
import type { Cell, DungeonMap } from './types';

export const TRAIL_CAP = 200;

/**
 * Move the token along a path (as returned by findPath, starting at the token).
 * Every square it leaves is added to the footprint trail; the destination is not, since
 * the token itself is drawn there. Returns null for a path that doesn't start at the token.
 */
export function moveToken(map: DungeonMap, path: Cell[]): Command | null {
  const before = map.token;
  const last = path[path.length - 1];
  const first = path[0];
  if (!before || !first || !last || path.length < 2) return null;
  if (first.x !== before.x || first.y !== before.y) return null;
  const walked = path.slice(0, -1).map(({ x, y }) => ({ x, y }));
  const trail = [...before.trail, ...walked].slice(-TRAIL_CAP);
  return setToken(before, { x: last.x, y: last.y, trail });
}
