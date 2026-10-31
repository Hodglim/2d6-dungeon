import type { DungeonMap, Feature } from '../../src/core/types';
import type { Step } from '../../src/interaction/playflow';
import { pick } from '../../src/render/hit';
import { entryNote, nearestEdge, resolveSelection, roomExitCount, routeEditorTap, routePlayTap } from '../../src/ui/tapRouting';
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

describe('routeEditorTap: select', () => {
  it('a tap on a room or passage selects it; empty space gives a hint', () => {
    const m = sample();
    expect(routeEditorTap('select', m, tap(m, 3.5, 3.5), { x: 3.5, y: 3.5 })).toEqual({ kind: 'select', selection: { kind: 'room', roomId: 'r1' } });
    expect(routeEditorTap('select', m, tap(m, 3.5, 5.5), { x: 3.5, y: 5.5 })).toEqual({ kind: 'select', selection: { kind: 'room', roomId: 'p1' } });
    expect(routeEditorTap('select', m, tap(m, 8.5, 8.5), { x: 8.5, y: 8.5 })).toEqual({ kind: 'hint', text: 'Tap a room to see its details' });
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

  it('idle: a floor square walks there, anything else is a hint', () => {
    const m = sample();
    expect(routePlayTap(IDLE, m, tap(m, 2.5, 3.5), { x: 2.5, y: 3.5 }, opts)).toEqual({ kind: 'walk', cell: { x: 2, y: 3 } });
    expect(routePlayTap(IDLE, m, tap(m, 8.5, 8.5), { x: 8.5, y: 8.5 }, opts)).toEqual({ kind: 'hint', text: 'Tap an open exit, or a floor square to walk there' });
    expect(routePlayTap(IDLE, m, tap(m, 8.5, 8.5), { x: 8.5, y: 8.5 }, { ...opts, gapMode: true })).toEqual({ kind: 'hint', text: 'Tap an open exit (highlighted)' });
  });

  it('idle in gap mode: a floor square does not walk the token', () => {
    const m = sample();
    expect(routePlayTap(IDLE, m, tap(m, 2.5, 3.5), { x: 2.5, y: 3.5 }, { ...opts, gapMode: true })).toEqual({ kind: 'hint', text: 'Tap an open exit (highlighted)' });
  });

  it('position slides the ghost; exits toggles the nearest allowed or chosen edge; other steps ignore taps', () => {
    const m = sample();
    const position = { kind: 'position' } as Step;
    expect(routePlayTap(position, m, tap(m, 6.5, 6.5), { x: 6.5, y: 6.5 }, opts)).toEqual({ kind: 'slide', cell: { x: 6, y: 6 } });
    const allowed = { x: 5, y: 3, side: 'W' as const };
    const chosen = { x: 2, y: 3, side: 'W' as const };
    const exits = { kind: 'exits', chosen: [chosen] } as unknown as Step;
    expect(routePlayTap(exits, m, tap(m, 5, 3.5), { x: 5, y: 3.5 }, { ...opts, allowedExits: [allowed] })).toEqual({ kind: 'toggleExit', edge: allowed });
    expect(routePlayTap(exits, m, tap(m, 2, 3.5), { x: 2, y: 3.5 }, { ...opts, allowedExits: [allowed] })).toEqual({ kind: 'toggleExit', edge: chosen });
    expect(routePlayTap(exits, m, tap(m, 8, 8), { x: 8, y: 8 }, { ...opts, allowedExits: [allowed] })).toEqual({ kind: 'ignore' });
    expect(routePlayTap({ kind: 'size' } as Step, m, tap(m, 3.5, 3.5), { x: 3.5, y: 3.5 }, opts)).toEqual({ kind: 'ignore' });
  });
});
