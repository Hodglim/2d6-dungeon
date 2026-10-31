import { addDoor, addRoom, compound, setToken, type Command } from './commands';
import { cellEdge, edgeCells, isBoundaryEdge, perimeterEdges, sameEdge, step } from './geometry';
import type { IdFn } from './ids';
import { doorAt, exitDirection, nextRoomNumber, roomAt, roomCentre, roomsAcross } from './query';
import { entranceInwardDirection, evaluatePlacement } from './placement';
import { findPath } from './pathfinding';
import { moveToken } from './token';
import type { GameSystem } from './system';
import type { Cell, Direction, Door, DungeonMap, Edge, Rect, Room, RoomLabel } from './types';

const EMPTY_LABEL: RoomLabel = { type: '', unique: false, narrative: '' };

export function makeDoor(newId: IdFn, edge: Edge, type: string): Door {
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

/** A 1×1 passage (exit square) on `cell`, entered through `entry`. */
export function passageRoom(newId: IdFn, cell: Cell, entry: Door): Room {
  return {
    id: newId(),
    number: 0,
    kind: 'passage',
    sizeClass: null,
    x: cell.x,
    y: cell.y,
    w: 1,
    h: 1,
    label: { ...EMPTY_LABEL },
    entryDoorId: entry.id,
  };
}

/**
 * A new room for the given (already clipped) rect, entered through `entryDoor`
 * (the open exit it was placed against). Not yet added to the map.
 */
export function newRoom(
  map: DungeonMap,
  rect: Rect,
  entryDoor: Door,
  newId: IdFn,
  kind: 'room' | 'corridor' = 'room',
  sizeClass: 'normal' | 'small' | 'large' | null = kind === 'room' ? 'normal' : null,
): Room {
  return {
    id: newId(),
    number: kind === 'room' ? nextRoomNumber(map) : 0,
    kind,
    sizeClass: kind === 'room' ? (sizeClass ?? 'normal') : null,
    ...rect,
    label: { ...EMPTY_LABEL },
    entryDoorId: entryDoor.id,
  };
}

export interface RoomPlan {
  room: Room;
  exits: Edge[];
  exitType: string;
}

/**
 * The single undoable command for the room step of the play flow: the room, its exits, and
 * a 1-square exit square beyond each exit with a door at its far end, unless that far end is
 * the Outer Boundary (exits may not be placed there) or already has a door.
 * Each exit must be a perimeter edge of `plan.room`.
 */
export function createRoomFromExit(map: DungeonMap, plan: RoomPlan, newId: IdFn): Command {
  const cmds: Command[] = [addRoom(plan.room)];
  const perimeter = perimeterEdges(plan.room);
  for (const exit of plan.exits) {
    const exitDoor = makeDoor(newId, exit, plan.exitType);
    cmds.push(addDoor(exitDoor));
    const side = perimeter.find((p) => sameEdge(p.edge, exit));
    if (!side) continue;
    const cell = step(side.inside, side.dir);
    cmds.push(addRoom(passageRoom(newId, cell, exitDoor)));
    const far = cellEdge(cell, side.dir);
    if (!isBoundaryEdge(far, map.width, map.height) && !doorAt(map, far)) {
      cmds.push(addDoor(makeDoor(newId, far, plan.exitType)));
    }
  }
  return compound(`Add Room ${plan.room.number}`, cmds);
}

/** Commands moving the token from where it is to the centre of `room` (already in `map`). */
function walkToCentre(map: DungeonMap, room: Room): { command: Command | null; path: Cell[] | null } {
  if (!map.token) return { command: null, path: null };
  const path = findPath(map, map.token, roomCentre(room));
  if (!path) return { command: null, path: null };
  const command = moveToken(map, path);
  return command ? { command, path } : { command: null, path };
}

/** Room command plus the token walking from its current square to the room centre, as ONE command labelled like the room. */
export function createRoomAndWalk(
  map: DungeonMap,
  plan: RoomPlan,
  newId: IdFn,
): { command: Command; path: Cell[] | null } {
  const roomCmd = createRoomFromExit(map, plan, newId);
  const walk = walkToCentre(roomCmd.apply(map), plan.room);
  if (!walk.command) return { command: roomCmd, path: walk.path };
  return { command: compound(roomCmd.label, [roomCmd, walk.command]), path: walk.path };
}

/** Entrance square + entrance room (+ its exits and the token's walk) as ONE command labelled "Add entrance". */
export function createEntranceAndRoom(
  map: DungeonMap,
  system: GameSystem,
  cell: Cell,
  rect: Rect,
  exits: Edge[],
  newId: IdFn,
): { command: Command; path: Cell[] | null } {
  const entranceCmd = placeEntrance(map, system, cell, newId);
  const m1 = entranceCmd.apply(map);
  const inward = cellEdge(cell, entranceInwardDirection(system.entranceEdge));
  const entryDoor = doorAt(m1, inward);
  if (!entryDoor) throw new Error('Entrance door missing');
  const room = newRoom(m1, rect, entryDoor, newId);
  room.label = { ...EMPTY_LABEL, type: 'Entrance Room' };
  const roomCmd = createRoomFromExit(m1, { room, exits, exitType: 'archway' }, newId);
  const walk = walkToCentre(roomCmd.apply(m1), room);
  const cmds = [entranceCmd, roomCmd, ...(walk.command ? [walk.command] : [])];
  return { command: compound('Add entrance', cmds), path: walk.path };
}

/** Rect for a corridor running straight out of an open exit: 1 wide, `length` long, clipped at the boundary; null on overlap. */
export function gapCorridorRect(map: DungeonMap, door: Door, length: number): Rect | null {
  const dir = exitDirection(map, door);
  if (!dir) return null;
  const vertical = dir === 'N' || dir === 'S';
  const placement = evaluatePlacement(map, door, vertical ? 1 : length, vertical ? length : 1, 0);
  return placement.ok ? placement.rect : null;
}

/** A corridor out of an exit. Archway at its far end if that faces floor and has no door. No exit square. */
export function createGapCorridor(map: DungeonMap, door: Door, length: number, newId: IdFn): Command | null {
  const rect = gapCorridorRect(map, door, length);
  const dir: Direction | null = exitDirection(map, door);
  if (!rect || !dir) return null;
  const corridor = newRoom(map, rect, door, newId, 'corridor');
  const cmds: Command[] = [addRoom(corridor)];
  const far = perimeterEdges(corridor).find((p) => p.dir === dir);
  if (far && !isBoundaryEdge(far.edge, map.width, map.height) && !doorAt(map, far.edge) && roomAt(map, step(far.inside, dir))) {
    cmds.push(addDoor(makeDoor(newId, far.edge, 'archway')));
  }
  return compound('Add corridor', cmds);
}
