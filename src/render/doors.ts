import { exitDirection, roomsAcross } from '../core/query';
import type { DungeonMap } from '../core/types';

/** Where and how to draw a door, in grid units. */
export interface DoorGlyph {
  id: string;
  type: string;
  /** Centre of the door's edge. */
  cx: number;
  cy: number;
  /** Rotation in radians so the symbol's x axis runs along the edge and +y points into its room. */
  rotation: number;
  secret: boolean;
  /** null = no lock; otherwise whether it is currently locked. */
  locked: boolean | null;
  /** An unexplored exit (room on one side only). */
  open: boolean;
}

export function doorGlyphs(map: DungeonMap): DoorGlyph[] {
  return map.doors.map((d) => {
    const [a, b] = roomsAcross(map, d);
    // Symbol +y should point into a room: towards b (south/east) unless only a exists.
    // Rotation θ maps symbol +y to (-sin θ, cos θ): 0 → south, π → north, -π/2 → east, π/2 → west.
    const towardsB = b !== undefined || a === undefined;
    const rotation = d.side === 'N' ? (towardsB ? 0 : Math.PI) : towardsB ? -Math.PI / 2 : Math.PI / 2;
    return {
      id: d.id,
      type: d.type,
      cx: d.side === 'N' ? d.x + 0.5 : d.x,
      cy: d.side === 'N' ? d.y : d.y + 0.5,
      rotation,
      secret: d.secret,
      locked: d.lock ? d.lock.locked : null,
      open: (a === undefined) !== (b === undefined),
    };
  });
}

/** The marker drawn on an open exit: from the edge centre, pointing outward. */
export interface ExitStub {
  doorId: string;
  cx: number;
  cy: number;
  dx: number;
  dy: number;
}

export function exitStubs(map: DungeonMap): ExitStub[] {
  const out: ExitStub[] = [];
  for (const d of map.doors) {
    const dir = exitDirection(map, d);
    if (!dir) continue;
    const v = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[dir] as [number, number];
    out.push({
      doorId: d.id,
      cx: d.side === 'N' ? d.x + 0.5 : d.x,
      cy: d.side === 'N' ? d.y : d.y + 0.5,
      dx: v[0],
      dy: v[1],
    });
  }
  return out;
}
