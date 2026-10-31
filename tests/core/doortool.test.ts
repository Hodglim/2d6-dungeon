import { removeDoor } from '../../src/core/commands';
import { addDoorWithTool, checkDoorTool } from '../../src/core/doortool';
import { History } from '../../src/core/history';
import { sequentialIds } from '../../src/core/ids';
import { door, emptyMap, room, withContent } from './fixtures';

const base = () =>
  withContent(emptyMap(10, 10), [room('A', 2, 4, 3, 2, 'room', 1), room('B', 5, 4, 2, 2, 'room', 2)], [door('d', 5, 4, 'W')]);

describe('checkDoorTool', () => {
  it('refuses with a reason', () => {
    const m = base();
    expect(checkDoorTool(m, { x: 0, y: 3, side: 'W' })).toEqual({ ok: false, reason: 'Not on the Outer Boundary' });
    expect(checkDoorTool(m, { x: 5, y: 4, side: 'W' })).toEqual({ ok: false, reason: 'There is already a door here' });
    expect(checkDoorTool(m, { x: 3, y: 4, side: 'W' })).toEqual({ ok: false, reason: 'That is inside a room' });
    expect(checkDoorTool(m, { x: 8, y: 8, side: 'N' })).toEqual({ ok: false, reason: 'A door needs a room on at least one side' });
  });
  it('reports whether it faces open space', () => {
    const m = base();
    expect(checkDoorTool(m, { x: 3, y: 4, side: 'N' })).toEqual({ ok: true, facesOpenSpace: true });
    expect(checkDoorTool(m, { x: 5, y: 5, side: 'W' })).toEqual({ ok: true, facesOpenSpace: false });
  });
});

describe('addDoorWithTool', () => {
  it('adds a door and a passage when facing open space', () => {
    const h = new History(base());
    const cmd = addDoorWithTool(h.map, { x: 3, y: 4, side: 'N' }, 'wooden', true, sequentialIds('t'))!;
    expect(h.execute(cmd).ok).toBe(true);
    expect(h.map.rooms.find((r) => r.kind === 'passage')).toMatchObject({ x: 3, y: 3, w: 1, h: 1 });
    expect(h.map.doors).toContainEqual(expect.objectContaining({ x: 3, y: 4, side: 'N', type: 'wooden', secret: true }));
    expect(h.map.doors).toContainEqual(expect.objectContaining({ x: 3, y: 3, side: 'N', type: 'wooden', secret: false }));
  });
  it('adds only the door between two rooms', () => {
    const h = new History(base());
    expect(h.execute(addDoorWithTool(h.map, { x: 5, y: 5, side: 'W' }, 'wooden', false, sequentialIds('t'))!).ok).toBe(true);
    expect(h.map.rooms).toHaveLength(2);
    expect(h.map.doors).toHaveLength(2);
  });
  it('is null when refused', () => {
    expect(addDoorWithTool(base(), { x: 5, y: 4, side: 'W' }, 'wooden', false, sequentialIds('t'))).toBeNull();
  });
  it('the entry door cannot be removed', () => {
    const h = new History(base());
    const withEntry = { ...h.map, rooms: h.map.rooms.map((r) => (r.id === 'B' ? { ...r, entryDoorId: 'd' } : r)) };
    const h2 = new History(withEntry);
    expect(h2.execute(removeDoor(withEntry.doors[0]!)).ok).toBe(false);
  });
});
