import type { DungeonMap, Feature } from '../../src/core/types';
import type { Step } from '../../src/interaction/playflow';
import { pick } from '../../src/render/hit';
import { entryNote, nearestEdge, resolveSelection, roomAfterWin, roomExitCount, roomTabShown, routeEditorTap, routePlayTap } from '../../src/ui/tapRouting';
import { door, emptyMap, room, withContent } from '../core/fixtures';

/**
 * Room 1 at (2,2) 3×3 entered through d-in on its south wall (from a passage below it),
 * with an open exit d-out on its north wall (no exit square), plus stairs and a note on floor.
 */
function sample(): DungeonMap {
  const r1 = { ...room('r1', 2, 2, 3, 3, 'room', 1), entryDoorId: 'd-in' };
  const p = { ...room('p1', 3, 5, 1, 1, 'passage'), entryDoorId: 'd-far' };
  const features: Feature[] = [
    { id: 's1', kind: 'stairs', x: 2, y: 2, dir: 'down' },
    { id: 'n1', kind: 'note', x: 4, y: 4, text: 'Rats' },
  ];
  const m = withContent(emptyMap(10, 10), [r1, p], [door('d-in', 3, 5, 'N', 'wooden'), door('d-out', 3, 2, 'N'), door('d-far', 3, 6, 'N')]);
  return { ...m, features };
}

const tap = (map: DungeonMap, x: number, y: number) => pick(map, { x, y });
const IDLE = { kind: 'idle', error: null } as Step;

describe('nearestEdge', () => {
  it('snaps to the closest edge midpoint within 0.7 squares', () => {
    const edges = [
      { x: 3, y: 2, side: 'N' as const },
      { x: 5, y: 3, side: 'W' as const },
    ];
    expect(nearestEdge(edges, { x: 3.6, y: 2.2 })).toEqual(edges[0]);
    expect(nearestEdge(edges, { x: 5.1, y: 3.4 })).toEqual(edges[1]);
    expect(nearestEdge(edges, { x: 8, y: 8 })).toBeNull();
  });
});

describe('routeEditorTap: door', () => {
  it('a tap on a door edits it', () => {
    const m = sample();
    expect(routeEditorTap('door', m, tap(m, 3.5, 2.1), { x: 3.5, y: 2.1 })).toEqual({ kind: 'select', selection: { kind: 'door', doorId: 'd-out' } });
  });

  it('a tap near (not on) a door still finds it', () => {
    const m = sample();
    expect(routeEditorTap('door', m, tap(m, 3.5, 2.45), { x: 3.5, y: 2.45 })).toEqual({ kind: 'select', selection: { kind: 'door', doorId: 'd-out' } });
  });

  it('a tap on a bare edge selects that wall, even inside a room (the editor shows why it is refused)', () => {
    const m = sample();
    expect(routeEditorTap('door', m, tap(m, 2.05, 3.5), { x: 2.05, y: 3.5 })).toEqual({ kind: 'select', selection: { kind: 'wall', edge: { x: 2, y: 3, side: 'W' } } });
    expect(routeEditorTap('door', m, tap(m, 3.5, 3.05), { x: 3.5, y: 3.05 })).toEqual({ kind: 'select', selection: { kind: 'wall', edge: { x: 3, y: 3, side: 'N' } } });
  });

  it('a tap in the middle of nowhere gives a hint', () => {
    const m = sample();
    const r = routeEditorTap('door', m, tap(m, 8.5, 8.5), { x: 8.5, y: 8.5 });
    expect(r.kind).toBe('hint');
  });
});

describe('routeEditorTap: stairs and notes', () => {
  it('stairs tool: tap stairs to edit, floor to add, elsewhere a hint', () => {
    const m = sample();
    expect(routeEditorTap('stairs', m, tap(m, 2.5, 2.5), { x: 2.5, y: 2.5 })).toEqual({ kind: 'select', selection: { kind: 'feature', featureId: 's1' } });
    expect(routeEditorTap('stairs', m, tap(m, 3.5, 3.5), { x: 3.5, y: 3.5 })).toEqual({ kind: 'addStairs', cell: { x: 3, y: 3 } });
    // The note square is still free for stairs.
    expect(routeEditorTap('stairs', m, tap(m, 4.5, 4.5), { x: 4.5, y: 4.5 })).toEqual({ kind: 'addStairs', cell: { x: 4, y: 4 } });
    expect(routeEditorTap('stairs', m, tap(m, 8.5, 8.5), { x: 8.5, y: 8.5 })).toEqual({ kind: 'hint', text: 'Stairs go on a floor square' });
  });

  it('note tool: tap a note to edit, floor to draft a new one, elsewhere a hint', () => {
    const m = sample();
    expect(routeEditorTap('note', m, tap(m, 4.5, 4.5), { x: 4.5, y: 4.5 })).toEqual({ kind: 'select', selection: { kind: 'feature', featureId: 'n1' } });
    expect(routeEditorTap('note', m, tap(m, 2.5, 2.5), { x: 2.5, y: 2.5 })).toEqual({ kind: 'select', selection: { kind: 'newNote', cell: { x: 2, y: 2 } } });
    expect(routeEditorTap('note', m, tap(m, 8.5, 8.5), { x: 8.5, y: 8.5 })).toEqual({ kind: 'hint', text: 'Notes go on a floor square' });
  });
});

describe('resolveSelection', () => {
  it('keeps a selection whose target still exists and drops one that is gone (e.g. after Undo)', () => {
    const m = sample();
    expect(resolveSelection(m, { kind: 'door', doorId: 'd-out' })).toEqual({ kind: 'door', doorId: 'd-out' });
    expect(resolveSelection(m, { kind: 'door', doorId: 'nope' })).toBeNull();
    expect(resolveSelection(m, { kind: 'feature', featureId: 'n1' })).not.toBeNull();
    expect(resolveSelection({ ...m, features: [] }, { kind: 'feature', featureId: 'n1' })).toBeNull();
    expect(resolveSelection(m, { kind: 'room', roomId: 'r1' })).not.toBeNull();
    expect(resolveSelection(m, { kind: 'room', roomId: 'r9' })).toBeNull();
    expect(resolveSelection(m, { kind: 'newNote', cell: { x: 2, y: 2 } })).not.toBeNull();
    expect(resolveSelection(m, { kind: 'newNote', cell: { x: 8, y: 8 } })).toBeNull();
    expect(resolveSelection(m, { kind: 'wall', edge: { x: 2, y: 3, side: 'W' } })).not.toBeNull();
  });

  it('turns a wall selection into its door once a door is added there', () => {
    const m = sample();
    expect(resolveSelection(m, { kind: 'wall', edge: { x: 3, y: 2, side: 'N' } })).toEqual({ kind: 'door', doorId: 'd-out' });
  });
});

describe('entryNote and roomExitCount', () => {
  it('names the room (or passage) a door was the way into', () => {
    const m = sample();
    expect(entryNote(m, 'd-in')).toBe('This is how Room 1 was entered');
    expect(entryNote(m, 'd-far')).toBe('This is how a passage was entered');
    expect(entryNote(m, 'd-out')).toBeNull();
  });

  it('counts doors on the room perimeter, not counting the entry door', () => {
    const m = sample();
    expect(roomExitCount(m, m.rooms[0]!)).toBe(1);
  });
});

describe('routePlayTap', () => {
  const opts = { gapMode: false, allowedExits: [] };

  it('idle on an empty map starts the entrance on the tapped square', () => {
    const m = emptyMap(10, 10);
    expect(routePlayTap(IDLE, m, tap(m, 4.5, 10.5), { x: 4.5, y: 10.5 }, opts)).toEqual({ kind: 'startEntrance', cell: { x: 4, y: 10 } });
  });

  it('idle: an open exit starts a room (or a gap corridor in gap mode)', () => {
    const m = sample();
    const w = { x: 3.5, y: 2.1 };
    expect(routePlayTap(IDLE, m, tap(m, w.x, w.y), w, opts)).toEqual({ kind: 'startExit', doorId: 'd-out' });
    expect(routePlayTap(IDLE, m, tap(m, w.x, w.y), w, { ...opts, gapMode: true })).toEqual({ kind: 'startGap', doorId: 'd-out' });
  });

  it('idle: a note or stairs on the tapped square selects that feature', () => {
    const m = sample();
    expect(routePlayTap(IDLE, m, tap(m, 4.5, 4.5), { x: 4.5, y: 4.5 }, opts)).toEqual({ kind: 'select', selection: { kind: 'feature', featureId: 'n1' } });
    expect(routePlayTap(IDLE, m, tap(m, 2.5, 2.5), { x: 2.5, y: 2.5 }, opts)).toEqual({ kind: 'select', selection: { kind: 'feature', featureId: 's1' } });
  });

  it('idle: any other floor square selects its room (or passage); it never walks', () => {
    const m = sample();
    expect(routePlayTap(IDLE, m, tap(m, 2.5, 3.5), { x: 2.5, y: 3.5 }, opts)).toEqual({ kind: 'select', selection: { kind: 'room', roomId: 'r1' } });
    expect(routePlayTap(IDLE, m, tap(m, 3.9, 3.1), { x: 3.9, y: 3.1 }, opts)).toEqual({ kind: 'select', selection: { kind: 'room', roomId: 'r1' } });
    // The 1×1 passage's square is within reach of its open exit, which still wins.
    expect(routePlayTap(IDLE, m, tap(m, 3.5, 5.5), { x: 3.5, y: 5.5 }, opts)).toEqual({ kind: 'startExit', doorId: 'd-far' });
  });

  it('idle: empty space is a gentle hint about dragging the token', () => {
    const m = sample();
    expect(routePlayTap(IDLE, m, tap(m, 8.5, 8.5), { x: 8.5, y: 8.5 }, opts)).toEqual({ kind: 'hint', text: 'Tap an open exit to start a room, or drag the token to move it' });
    expect(routePlayTap(IDLE, m, tap(m, 8.5, 8.5), { x: 8.5, y: 8.5 }, { ...opts, gapMode: true })).toEqual({ kind: 'hint', text: 'Tap an open exit (highlighted)' });
  });

  it('idle in gap mode: a floor square neither walks nor selects', () => {
    const m = sample();
    expect(routePlayTap(IDLE, m, tap(m, 2.5, 3.5), { x: 2.5, y: 3.5 }, { ...opts, gapMode: true })).toEqual({ kind: 'hint', text: 'Tap an open exit (highlighted)' });
    expect(routePlayTap(IDLE, m, tap(m, 4.5, 4.5), { x: 4.5, y: 4.5 }, { ...opts, gapMode: true })).toEqual({ kind: 'hint', text: 'Tap an open exit (highlighted)' });
  });

  it('position slides the ghost and places it (slideAndPlace); exits toggles the nearest allowed or chosen edge; other steps ignore taps', () => {
    const m = sample();
    const position = { kind: 'position' } as Step;
    expect(routePlayTap(position, m, tap(m, 6.5, 6.5), { x: 6.5, y: 6.5 }, opts)).toEqual({ kind: 'slideAndPlace', cell: { x: 6, y: 6 } });
    const allowed = { x: 5, y: 3, side: 'W' as const };
    const chosen = { x: 2, y: 3, side: 'W' as const };
    const exits = { kind: 'exits', chosen: [chosen] } as unknown as Step;
    expect(routePlayTap(exits, m, tap(m, 5, 3.5), { x: 5, y: 3.5 }, { ...opts, allowedExits: [allowed] })).toEqual({ kind: 'toggleExit', edge: allowed });
    expect(routePlayTap(exits, m, tap(m, 2, 3.5), { x: 2, y: 3.5 }, { ...opts, allowedExits: [allowed] })).toEqual({ kind: 'toggleExit', edge: chosen });
    expect(routePlayTap(exits, m, tap(m, 8, 8), { x: 8, y: 8 }, { ...opts, allowedExits: [allowed] })).toEqual({ kind: 'ignore' });
    expect(routePlayTap({ kind: 'size' } as Step, m, tap(m, 3.5, 3.5), { x: 3.5, y: 3.5 }, opts)).toEqual({ kind: 'ignore' });
  });
});

describe('roomTabShown', () => {
  const room1 = { kind: 'room', roomId: 'r1' } as const;
  const base = { sideShown: true, stepIdle: true, tool: 'play', selection: null } as const;

  it('shows while a room is being placed, beside the open side panes', () => {
    expect(roomTabShown({ ...base, stepIdle: false })).toBe(true);
  });

  it('shows a room selected in Play beside the open side panes (its text next to the fight)', () => {
    expect(roomTabShown({ ...base, selection: room1 })).toBe(true);
  });

  it('is not shown with no side panes (the step panel has the whole sidebar), nothing selected, or a note or stairs', () => {
    expect(roomTabShown({ ...base, sideShown: false, selection: room1 })).toBe(false);
    expect(roomTabShown({ ...base, sideShown: false, stepIdle: false })).toBe(false);
    expect(roomTabShown(base)).toBe(false);
    expect(roomTabShown({ ...base, selection: { kind: 'feature', featureId: 'n1' } })).toBe(false);
  });

  it('is not shown for a room selection outside Play (the editor tools show their own panel)', () => {
    expect(roomTabShown({ ...base, tool: 'door', selection: room1 })).toBe(false);
  });
});

describe('roomAfterWin', () => {
  const at = (x: number, y: number) => ({ x, y, trail: [] });

  it('is the room the hero token stands in, so its text (and any loot roll) is back on screen', () => {
    expect(roomAfterWin({ ...sample(), token: at(3, 3) }, null)).toEqual({ kind: 'room', roomId: 'r1' });
  });

  it('prefers the token\'s room over another room that was selected', () => {
    expect(roomAfterWin({ ...sample(), token: at(3, 5) }, { kind: 'room', roomId: 'r1' })).toEqual({ kind: 'room', roomId: 'p1' });
  });

  it('keeps a selected room when there is no token, or the token is outside every room', () => {
    const r1 = { kind: 'room', roomId: 'r1' } as const;
    expect(roomAfterWin({ ...sample(), token: null }, r1)).toEqual(r1);
    expect(roomAfterWin({ ...sample(), token: at(8, 8) }, r1)).toEqual(r1);
  });

  it('is null with no room to show (a note or stairs selection is not a room)', () => {
    expect(roomAfterWin({ ...sample(), token: null }, null)).toBeNull();
    expect(roomAfterWin({ ...sample(), token: null }, { kind: 'feature', featureId: 'n1' })).toBeNull();
  });

  it('ignores a selected room that is no longer on the map', () => {
    expect(roomAfterWin({ ...sample(), token: null }, { kind: 'room', roomId: 'gone' })).toBeNull();
  });
});
