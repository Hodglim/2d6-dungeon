import { addDoor, addRoom, compound, setToken, type Command } from './commands';
import { cellEdge, isBoundaryEdge, perimeterEdges, sameEdge, step } from './geometry';
import type { IdFn } from './ids';
import { doorAt, nextRoomNumber } from './query';
import { entranceInwardDirection } from './placement';
import type { GameSystem } from './system';
import type { Cell, Door, DungeonMap, Edge, Rect, Room, RoomLabel } from './types';

const EMPTY_LABEL: RoomLabel = { type: '', unique: false, narrative: '' };

function makeDoor(newId: IdFn, edge: Edge, type: string): Door {
  return { id: newId(), x: edge.x, y: edge.y, side: edge.side, type, secret: false, lock: null };
}

/**
 * Entrance room outside the boundary, its inward open exit, and the token on it.
 * `cell` must come from `entranceCells(map, system.entranceEdge)`; the door direction is
 * derived from `system.entranceEdge`.
 */
export function placeEntrance(map: DungeonMap, system: GameSystem, cell: Cell, newId: IdFn): Command {
  const entrance: Room = {
    id: newId(),
    number: 0,
    kind: 'entrance',
    sizeClass: null,
    x: cell.x,
    y: cell.y,
    w: 1,
    h: 1,
    label: { ...EMPTY_LABEL },
    entryDoorId: null,
  };
  const inward = cellEdge(cell, entranceInwardDirection(system.entranceEdge));
  return compound('Place entrance', [
    addRoom(entrance),
    addDoor(makeDoor(newId, inward, map.defaultDoorType)),
    setToken(map.token, { x: cell.x, y: cell.y, trail: [] }),
  ]);
}

/**
 * A new numbered room for the given (already clipped) rect, entered through `entryDoor`
 * (the open exit it was placed against). Not yet added to the map.
 */
export function newRoom(map: DungeonMap, rect: Rect, entryDoor: Door, newId: IdFn): Room {
  return {
    id: newId(),
    number: nextRoomNumber(map),
    kind: 'room',
    sizeClass: 'normal',
    ...rect,
    label: { ...EMPTY_LABEL },
    entryDoorId: entryDoor.id,
  };
}

export interface RoomPlan {
  room: Room;
  exits: Edge[];
  exitType: string;
  passages: boolean;
}

/**
 * The single undoable command for steps 3–6 of the play flow: the room, its exits, and
 * (optionally) a 1-square passage beyond each exit with an open exit at its far end,
 * unless that far end is the Outer Boundary (corridors may end there; exits may not) or
 * already has a door (the existing door connects the spaces).
 * Each exit must be a perimeter edge of `plan.room` (as returned by validExitEdges).
 */
export function createRoomFromExit(map: DungeonMap, plan: RoomPlan, newId: IdFn): Command {
  const cmds: Command[] = [addRoom(plan.room)];
  const perimeter = perimeterEdges(plan.room);
  for (const exit of plan.exits) {
    const exitDoor = makeDoor(newId, exit, plan.exitType);
    cmds.push(addDoor(exitDoor));
    if (!plan.passages) continue;
    const side = perimeter.find((p) => sameEdge(p.edge, exit));
    if (!side) continue;
    const cell = step(side.inside, side.dir);
    const passage: Room = {
      id: newId(),
      number: 0,
      kind: 'passage',
      sizeClass: null,
      x: cell.x,
      y: cell.y,
      w: 1,
      h: 1,
      label: { ...EMPTY_LABEL },
      entryDoorId: exitDoor.id,
    };
    cmds.push(addRoom(passage));
    const far = cellEdge(cell, side.dir);
    if (!isBoundaryEdge(far, map.width, map.height) && !doorAt(map, far)) {
      cmds.push(addDoor(makeDoor(newId, far, plan.exitType)));
    }
  }
  return compound(`Add Room ${plan.room.number}`, cmds);
}
