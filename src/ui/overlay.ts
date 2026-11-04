// Map overlays: what to highlight or ghost for the current play-flow step (overlayFor) or an
// editor tool's selection (selectionOverlay). Both are pure; drawOverlay paints them in world units.

import { checkDoorTool } from '../core/doortool';
import { allowedExitEdges } from '../core/exits';
import { edgeCells, rectContains } from '../core/geometry';
import { entranceCells } from '../core/placement';
import { openExits } from '../core/query';
import type { Cell, DungeonMap, Edge, Rect, Room } from '../core/types';
import type { Step } from '../interaction/playflow';
import type { Theme } from '../render/theme';
import { dungeonSystem } from '../systems/dungeon';
import type { Selection } from './tapRouting';

export type OverlayTone = 'highlight' | 'ok' | 'bad';

export type OverlayShape =
  | { kind: 'cell'; at: Cell; tone: OverlayTone }
  | { kind: 'edge'; at: Edge; tone: OverlayTone }
  | { kind: 'rect'; at: Rect; tone: OverlayTone };

/**
 * Shapes for a play-flow step. `map` is the map the step is drafted on (PlayFlow.draftMap),
 * which contains the draft room but not the chosen exits or their exit squares.
 */
export function overlayFor(step: Step, map: DungeonMap): OverlayShape[] {
  switch (step.kind) {
    case 'idle':
      if (map.rooms.length === 0) {
        return entranceCells(map, dungeonSystem.entranceEdge).map((at) => ({ kind: 'cell', at, tone: 'highlight' }));
      }
      return openExits(map).map((d) => ({ kind: 'edge', at: plainEdge(d), tone: 'highlight' }));
    case 'size':
      // Keep the exit the room will grow from in view while the dice are entered.
      if (step.source.kind === 'entrance') return [{ kind: 'cell', at: step.source.cell, tone: 'highlight' }];
      return exitEdge(map, step.source.doorId);
    case 'position':
      return step.placement.rect ? [{ kind: 'rect', at: step.placement.rect, tone: step.placement.ok ? 'ok' : 'bad' }] : [];
    case 'exits': {
      const allowed = step.chosen.length < step.count ? allowedExitEdges(map, step.draft.room.id, step.chosen) : [];
      return [
        ...allowed.map((at): OverlayShape => ({ kind: 'edge', at, tone: 'highlight' })),
        ...chosenShapes(step.draft.room, step.chosen),
      ];
    }
    case 'label':
      return chosenShapes(step.draft.room, step.chosen);
    case 'gap':
      if (step.rect) return [{ kind: 'rect', at: step.rect, tone: 'ok' }];
      // Show the collision: the attempted corridor in red.
      return step.attempt ? [{ kind: 'rect', at: step.attempt, tone: 'bad' }] : [];
    case 'exitCount':
    case 'exitType':
      return [];
  }
}

/** Shapes marking what an editor tool (Door, Stairs, Note) or a Play tap has selected. */
export function selectionOverlay(map: DungeonMap, sel: Selection | null): OverlayShape[] {
  if (!sel) return [];
  switch (sel.kind) {
    case 'door':
      return exitEdge(map, sel.doorId);
    case 'wall':
      return [{ kind: 'edge', at: plainEdge(sel.edge), tone: checkDoorTool(map, sel.edge).ok ? 'ok' : 'bad' }];
    case 'feature': {
      const f = map.features.find((x) => x.id === sel.featureId);
      return f ? [{ kind: 'cell', at: { x: f.x, y: f.y }, tone: 'highlight' }] : [];
    }
    case 'newNote':
      return [{ kind: 'cell', at: { x: sel.cell.x, y: sel.cell.y }, tone: 'highlight' }];
    case 'room': {
      const r = map.rooms.find((x) => x.id === sel.roomId);
      return r ? [{ kind: 'rect', at: { x: r.x, y: r.y, w: r.w, h: r.h }, tone: 'highlight' }] : [];
    }
  }
}

function plainEdge(e: Edge): Edge {
  return { x: e.x, y: e.y, side: e.side };
}

function exitEdge(map: DungeonMap, doorId: string): OverlayShape[] {
  const d = map.doors.find((x) => x.id === doorId);
  return d ? [{ kind: 'edge', at: plainEdge(d), tone: 'highlight' }] : [];
}

/** Each chosen exit as an `ok` edge plus its 1×1 exit square just outside the room. */
function chosenShapes(room: Room, chosen: Edge[]): OverlayShape[] {
  const out: OverlayShape[] = [];
  for (const e of chosen) {
    out.push({ kind: 'edge', at: plainEdge(e), tone: 'ok' });
    const square = edgeCells(e).find((c) => !rectContains(room, c));
    if (square) out.push({ kind: 'cell', at: square, tone: 'ok' });
  }
  return out;
}

/** Edge stroke width, in squares. Thick enough to read at arm's length on a tablet. */
const EDGE_WIDTH = 0.24;

function toneColour(tone: OverlayTone, theme: Theme): string {
  return tone === 'highlight' ? theme.highlight : tone === 'ok' ? theme.ghostOk : theme.ghostBad;
}

/** Paint overlay shapes. The context must map 1 unit = 1 square (MapRenderer.setOverlay does). */
export function drawOverlay(ctx: CanvasRenderingContext2D, shapes: OverlayShape[], theme: Theme): void {
  // Areas first, so edges stay visible on top of a ghost.
  for (const s of shapes) {
    if (s.kind === 'edge') continue;
    const r = s.kind === 'cell' ? { x: s.at.x, y: s.at.y, w: 1, h: 1 } : s.at;
    const colour = toneColour(s.tone, theme);
    ctx.save();
    ctx.fillStyle = colour;
    ctx.globalAlpha = s.tone === 'highlight' ? 0.28 : 1;
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colour;
    ctx.lineWidth = 0.08;
    ctx.setLineDash(s.kind === 'rect' ? [0.25, 0.15] : []);
    ctx.strokeRect(r.x + 0.04, r.y + 0.04, r.w - 0.08, r.h - 0.08);
    ctx.restore();
  }
  ctx.save();
  ctx.lineCap = 'round';
  for (const s of shapes) {
    if (s.kind !== 'edge') continue;
    const { x, y, side } = s.at;
    const [x2, y2] = side === 'N' ? [x + 1, y] : [x, y + 1];
    ctx.beginPath();
    ctx.moveTo(x + (side === 'N' ? 0.12 : 0), y + (side === 'W' ? 0.12 : 0));
    ctx.lineTo(x2 - (side === 'N' ? 0.12 : 0), y2 - (side === 'W' ? 0.12 : 0));
    // Highlights are translucent so the green exit stub underneath stays visible; chosen
    // (ok/bad) edges get a light halo to read over walls and hatching.
    if (s.tone === 'highlight') {
      ctx.globalAlpha = 0.5;
    } else {
      ctx.strokeStyle = theme.paper;
      ctx.lineWidth = EDGE_WIDTH + 0.08;
      ctx.stroke();
    }
    ctx.strokeStyle = toneColour(s.tone, theme);
    ctx.lineWidth = EDGE_WIDTH;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
