import { addDoor, addRoom, compound, type Command } from './commands';
import { edgeCells, isBoundaryEdge } from './geometry';
import type { IdFn } from './ids';
import { makeDoor, passageRoom } from './playflow';
import { doorAt, roomsAcross } from './query';
import type { Direction, DungeonMap, Edge } from './types';

export type DoorCheck = { ok: true; facesOpenSpace: boolean } | { ok: false; reason: string };

export function checkDoorTool(map: DungeonMap, edge: Edge): DoorCheck {
  if (isBoundaryEdge(edge, map.width, map.height)) return { ok: false, reason: 'Not on the Outer Boundary' };
  if (doorAt(map, edge)) return { ok: false, reason: 'There is already a door here' };
  const [a, b] = roomsAcross(map, edge);
  if (a && b && a.id === b.id) return { ok: false, reason: 'That is inside a room' };
  if (!a && !b) return { ok: false, reason: 'A door needs a room on at least one side' };
  return { ok: true, facesOpenSpace: !a || !b };
}

/** Adds the door; when it faces open space it also adds the exit square (passage) and that square's far exit unless at the boundary. */
export function addDoorWithTool(
  map: DungeonMap,
  edge: Edge,
  type: string,
  secret: boolean,
  newId: IdFn,
): Command | null {
  const check = checkDoorTool(map, edge);
  if (!check.ok) return null;
  const door = { ...makeDoor(newId, edge, type), secret };
  const cmds: Command[] = [addDoor(door)];
  if (check.facesOpenSpace) {
    const [a, b] = roomsAcross(map, edge);
    const [ca, cb] = edgeCells(edge);
    const emptyIsFirst = !a;
    const cell = emptyIsFirst ? ca : cb;
    const dir: Direction = edge.side === 'N' ? (emptyIsFirst ? 'N' : 'S') : emptyIsFirst ? 'W' : 'E';
    cmds.push(addRoom(passageRoom(newId, cell, door)));
    const far: Edge = {
      N: { x: cell.x, y: cell.y, side: 'N' as const },
      S: { x: cell.x, y: cell.y + 1, side: 'N' as const },
      W: { x: cell.x, y: cell.y, side: 'W' as const },
      E: { x: cell.x + 1, y: cell.y, side: 'W' as const },
    }[dir];
    if (!isBoundaryEdge(far, map.width, map.height) && !doorAt(map, far)) {
      cmds.push(addDoor(makeDoor(newId, far, type)));
    }
  }
  return compound('Add door', cmds);
}
