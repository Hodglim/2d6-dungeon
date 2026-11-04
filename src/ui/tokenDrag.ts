// Dragging the token in Play: which square a drop walks to, whether a press grabs the token,
// and the square highlight while dragging. Pure; MapView tracks the pointer, AppShell walks.

import { findPath } from '../core/pathfinding';
import { roomAt } from '../core/query';
import { moveToken } from '../core/token';
import type { Cell, DungeonMap } from '../core/types';
import type { Point } from '../render/camera';
import type { OverlayShape } from './overlay';

/** CSS px: a press this close to the token's centre grabs it, however far out the map is zoomed (a 44 px target). */
export const TOKEN_GRAB_RADIUS = 22;

/**
 * The square a drop on `cell` walks the token to, or null when the drop does nothing:
 * no token, the token's own square, or a square the walk can't reach (not floor, walled off,
 * behind a locked door, off the map).
 */
export function dropTarget(map: DungeonMap, cell: Cell): Cell | null {
  const token = map.token;
  if (!token || (token.x === cell.x && token.y === cell.y)) return null;
  const path = findPath(map, token, cell);
  if (!path || !moveToken(map, path)) return null;
  return { x: cell.x, y: cell.y };
}

/** Does a press at `world` (squares) grab the token? Its square, or within TOKEN_GRAB_RADIUS px of its centre. `scale` is px per square. */
export function onToken(token: Cell | null, world: Point, scale: number): boolean {
  if (!token) return false;
  if (Math.floor(world.x) === token.x && Math.floor(world.y) === token.y) return true;
  const d = Math.hypot(world.x - (token.x + 0.5), world.y - (token.y + 0.5));
  return d * scale <= TOKEN_GRAB_RADIUS;
}

/** The square under a dragged token: ok where a drop walks, bad elsewhere on the map; nothing on its own square or off the map (bar the entrance square just outside it). */
export function dragOverlay(map: DungeonMap, cell: Cell): OverlayShape[] {
  const t = map.token;
  if (t && t.x === cell.x && t.y === cell.y) return [];
  // The entrance square sits just outside the map, so floor anywhere counts; bare squares only inside it.
  const inside = cell.x >= 0 && cell.y >= 0 && cell.x < map.width && cell.y < map.height;
  if (!inside && !roomAt(map, cell)) return [];
  return [{ kind: 'cell', at: { x: cell.x, y: cell.y }, tone: dropTarget(map, cell) ? 'ok' : 'bad' }];
}
