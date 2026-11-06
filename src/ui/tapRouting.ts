// Tap routing: what a map tap means for the current tool and play-flow step. Pure functions
// (map + pick + world point → an action); AppShell carries the action out.

import { perimeterEdges } from '../core/geometry';
import { describeRoom } from '../core/invariants';
import { doorAt, openExits, roomAt } from '../core/query';
import type { Cell, DungeonMap, Edge, Room } from '../core/types';
import type { Step } from '../interaction/playflow';
import type { Point } from '../render/camera';
import type { Pick } from '../render/hit';
import type { Tool } from './historyStore';

/** What an editor tool (Door, Stairs, Note) or a Play tap has picked for the panel to edit. */
export type Selection =
  | { kind: 'door'; doorId: string }
  /** A bare edge for the Door tool; the editor checks it with checkDoorTool. */
  | { kind: 'wall'; edge: Edge }
  /** Stairs or a note. */
  | { kind: 'feature'; featureId: string }
  /** A floor square a new note is being written for (not on the map yet). */
  | { kind: 'newNote'; cell: Cell }
  | { kind: 'room'; roomId: string };

export type EditorTap =
  | { kind: 'select'; selection: Selection }
  /** Stairs are added straight away (down), then edited. */
  | { kind: 'addStairs'; cell: Cell }
  | { kind: 'hint'; text: string };

export type PlayTap =
  | { kind: 'startEntrance'; cell: Cell }
  | { kind: 'startExit'; doorId: string }
  | { kind: 'startGap'; doorId: string }
  /** A note, stairs or room tapped while idle: show it in the panel (the token moves by dragging). */
  | { kind: 'select'; selection: Selection }
  | { kind: 'slideAndPlace'; cell: Cell }
  | { kind: 'toggleExit'; edge: Edge }
  | { kind: 'hint'; text: string }
  /** A tap that doesn't belong to the current step. */
  | { kind: 'ignore' };

/** Squares: a tap snaps to the nearest candidate edge whose midpoint is within this distance. */
export const EDGE_SNAP = 0.7;

export function nearestEdge<E extends Edge>(edges: E[], w: Point): E | null {
  let best: E | null = null;
  let bestDist = EDGE_SNAP;
  for (const e of edges) {
    const mx = e.side === 'N' ? e.x + 0.5 : e.x;
    const my = e.side === 'N' ? e.y : e.y + 0.5;
    const d = Math.hypot(w.x - mx, w.y - my);
    if (d < bestDist) {
      bestDist = d;
      best = e;
    }
  }
  return best;
}

const sameCell = (a: Cell, b: Cell) => a.x === b.x && a.y === b.y;

export function routePlayTap(
  step: Step,
  map: DungeonMap,
  p: Pick,
  world: Point,
  opts: { gapMode: boolean; allowedExits: Edge[] },
): PlayTap {
  switch (step.kind) {
    case 'idle': {
      if (map.rooms.length === 0) return { kind: 'startEntrance', cell: p.cell }; // the flow explains a bad square
      const exit = nearestEdge(openExits(map), world);
      if (exit) return { kind: opts.gapMode ? 'startGap' : 'startExit', doorId: exit.id };
      if (opts.gapMode) return { kind: 'hint', text: 'Tap an open exit (highlighted)' };
      const f = map.features.find((x) => sameCell(x, p.cell));
      if (f) return { kind: 'select', selection: { kind: 'feature', featureId: f.id } };
      if (p.room) return { kind: 'select', selection: { kind: 'room', roomId: p.room.id } };
      return { kind: 'hint', text: 'Tap an open exit to start a room, or drag the token to move it' };
    }
    case 'position':
      return { kind: 'slideAndPlace', cell: p.cell };
    case 'exits': {
      const e = nearestEdge([...opts.allowedExits, ...step.chosen], world);
      return e ? { kind: 'toggleExit', edge: e } : { kind: 'ignore' };
    }
    default:
      return { kind: 'ignore' };
  }
}

export function routeEditorTap(tool: Exclude<Tool, 'play'>, map: DungeonMap, p: Pick, world: Point): EditorTap {
  switch (tool) {
    case 'door': {
      // A tap right on an edge means that edge (door or bare wall); otherwise snap to a nearby door.
      if (p.edge) {
        const d = doorAt(map, p.edge);
        return { kind: 'select', selection: d ? { kind: 'door', doorId: d.id } : { kind: 'wall', edge: p.edge } };
      }
      const d = nearestEdge(map.doors, world);
      if (d) return { kind: 'select', selection: { kind: 'door', doorId: d.id } };
      return { kind: 'hint', text: 'Tap a door, or a wall where you want one' };
    }
    case 'stairs': {
      const f = map.features.find((x) => x.kind === 'stairs' && sameCell(x, p.cell));
      if (f) return { kind: 'select', selection: { kind: 'feature', featureId: f.id } };
      if (p.room) return { kind: 'addStairs', cell: p.cell };
      return { kind: 'hint', text: 'Stairs go on a floor square' };
    }
    case 'note': {
      const f = map.features.find((x) => x.kind === 'note' && sameCell(x, p.cell));
      if (f) return { kind: 'select', selection: { kind: 'feature', featureId: f.id } };
      if (p.room) return { kind: 'select', selection: { kind: 'newNote', cell: p.cell } };
      return { kind: 'hint', text: 'Notes go on a floor square' };
    }
  }
}

/**
 * The selection as it applies to `map` now (after an Undo or Redo, say): null when its target
 * is gone; a wall that has since got a door becomes that door.
 */
export function resolveSelection(map: DungeonMap, sel: Selection | null): Selection | null {
  if (!sel) return null;
  switch (sel.kind) {
    case 'door':
      return map.doors.some((d) => d.id === sel.doorId) ? sel : null;
    case 'wall': {
      const d = doorAt(map, sel.edge);
      return d ? { kind: 'door', doorId: d.id } : sel;
    }
    case 'feature':
      return map.features.some((f) => f.id === sel.featureId) ? sel : null;
    case 'newNote':
      return roomAt(map, sel.cell) ? sel : null;
    case 'room':
      return map.rooms.some((r) => r.id === sel.roomId) ? sel : null;
  }
}

/** "This is how Room N was entered" when the door is some room's (or passage's) entry door, else null. */
export function entryNote(map: DungeonMap, doorId: string): string | null {
  const r = map.rooms.find((x) => x.entryDoorId === doorId);
  return r ? `This is how ${describeRoom(r)} was entered` : null;
}

/** Doors on a room's walls, not counting the one it was entered through. */
export function roomExitCount(map: DungeonMap, room: Room): number {
  return perimeterEdges(room).filter((p) => {
    const d = doorAt(map, p.edge);
    return d !== undefined && d.id !== room.entryDoorId;
  }).length;
}

/**
 * The sidebar's Room tab, beside the open side panes (Encounter, Hero, Tables): the step panel
 * while a room is being placed, or the room selected in Play, so its text stays one tap from the fight.
 */
export function roomTabShown(o: { sideShown: boolean; stepIdle: boolean; tool: Tool; selection: Selection | null }): boolean {
  if (!o.sideShown) return false;
  return !o.stepIdle || (o.tool === 'play' && o.selection?.kind === 'room');
}

/**
 * The room to show once a fight is won: the one the hero token stands in (where the win is noted
 * and any loot roll waits), else a room already selected, else null.
 */
export function roomAfterWin(map: DungeonMap, selection: Selection | null): Selection | null {
  const r = map.token ? roomAt(map, map.token) : undefined;
  if (r) return { kind: 'room', roomId: r.id };
  if (selection?.kind === 'room' && map.rooms.some((x) => x.id === selection.roomId)) return selection;
  return null;
}
