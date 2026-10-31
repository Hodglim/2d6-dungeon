// A sample dungeon built with the real play-flow commands, so the viewer has something to
// draw before the interactive UI exists (Plan 3). Exercises every door type, a secret
// door, a lock, stairs, a note, a clipped room, passages and a long label.
import { createMap } from '../core/campaign';
import { addFeature, updateDoor } from '../core/commands';
import { History } from '../core/history';
import { randomId } from '../core/ids';
import { evaluatePlacement } from '../core/placement';
import { createRoomFromExit, newRoom, placeEntrance } from '../core/playflow';
import { doorAt } from '../core/query';
import type { DungeonMap, Edge } from '../core/types';
import { dungeonSystem } from '../systems/dungeon';

function must<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`Demo map: ${what}`);
  return v;
}

/** Add a room beyond the open exit at `exit`, with the given exits. */
function room(
  h: History,
  exit: Edge,
  w: number,
  hgt: number,
  offset: number,
  type: string,
  exits: Edge[],
  opts: { exitType?: string } = {},
): void {
  const door = must(doorAt(h.map, exit), `no door at ${JSON.stringify(exit)}`);
  const placement = evaluatePlacement(h.map, door, w, hgt, offset);
  if (!placement.ok || !placement.rect) throw new Error(`Demo map: ${placement.reason}`);
  const r = newRoom(h.map, placement.rect, door, randomId);
  const result = h.execute(
    createRoomFromExit(
      h.map,
      {
        room: { ...r, label: { type, unique: false, narrative: '' } },
        exits,
        exitType: opts.exitType ?? 'archway',
      },
      randomId,
    ),
  );
  if (!result.ok) throw new Error(`Demo map: ${result.reason}`);
}

function retype(h: History, edge: Edge, patch: Partial<{ type: string; secret: boolean; lock: { locked: boolean; note: string; quality: number | null } }>): void {
  const d = must(doorAt(h.map, edge), `no door at ${JSON.stringify(edge)}`);
  h.execute(updateDoor(d, { ...d, ...patch }));
}

export function demoMap(): DungeonMap {
  const h = new History(createMap(dungeonSystem, { width: 20, height: 16, seed: 42, title: 'Demo' }));
  h.execute(placeEntrance(h.map, dungeonSystem, { x: 9, y: 16 }, randomId));
  // Room 1: Guard Room above the entrance, with three exits (each gets an exit square).
  // Later rooms attach beyond an exit square, at its far door.
  room(h, { x: 9, y: 16, side: 'N' }, 6, 3, 2, 'Guard Room', [
    { x: 8, y: 13, side: 'N' },
    { x: 7, y: 14, side: 'W' },
    { x: 13, y: 15, side: 'W' },
  ]);
  // Room 2: Shrine north of the first exit square.
  room(h, { x: 8, y: 12, side: 'N' }, 5, 4, 1, 'Shrine', [{ x: 7, y: 9, side: 'W' }, { x: 9, y: 8, side: 'N' }]);
  // Room 3: a narrow room whose label must move outside.
  room(h, { x: 6, y: 14, side: 'W' }, 2, 2, 1, 'Collapsed Armoury', []);
  // Room 4: west of the Shrine.
  room(h, { x: 6, y: 9, side: 'W' }, 3, 3, 1, 'Crypt', []);
  // Room 5: a tall hall behind a secret door.
  room(h, { x: 9, y: 7, side: 'N' }, 4, 6, 1, 'Great Hall', [{ x: 12, y: 3, side: 'W' }]);
  // Room 7: beyond the Great Hall's east exit.
  room(h, { x: 13, y: 3, side: 'W' }, 3, 3, 1, 'Vault', []);
  // Room 6: rolled 3×2 but clipped to 3×1 by the Outer Boundary.
  room(h, { x: 14, y: 15, side: 'W' }, 3, 2, 0, 'Store', []);

  retype(h, { x: 9, y: 16, side: 'N' }, { type: 'portcullis' });
  retype(h, { x: 8, y: 13, side: 'N' }, { type: 'wooden' });
  retype(h, { x: 8, y: 12, side: 'N' }, { type: 'metal' });
  retype(h, { x: 7, y: 14, side: 'W' }, { type: 'curtain' });
  retype(h, { x: 6, y: 14, side: 'W' }, { type: 'reinforced', lock: { locked: true, note: 'Rusted shut', quality: null } });
  retype(h, { x: 7, y: 9, side: 'W' }, { type: 'stoneSlab' });
  retype(h, { x: 9, y: 8, side: 'N' }, { secret: true });
  retype(h, { x: 14, y: 15, side: 'W' }, { type: 'wooden', lock: { locked: false, note: '', quality: null } });

  h.execute(addFeature({ id: randomId(), kind: 'stairs', x: 10, y: 3, dir: 'down' }));
  h.execute(addFeature({ id: randomId(), kind: 'note', x: 4, y: 9, text: 'Bones' }));
  return h.map;
}
