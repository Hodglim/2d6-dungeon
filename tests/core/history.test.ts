import { addRoom } from '../../src/core/commands';
import { History } from '../../src/core/history';
import { emptyMap, room } from './fixtures';

describe('History', () => {
  it('executes, undoes and redoes', () => {
    const h = new History(emptyMap());
    expect(h.execute(addRoom(room('a', 1, 1, 2, 2)))).toEqual({ ok: true });
    expect(h.map.rooms).toHaveLength(1);
    expect(h.undo()).toBe(true);
    expect(h.map.rooms).toHaveLength(0);
    expect(h.redo()).toBe(true);
    expect(h.map.rooms).toHaveLength(1);
  });

  it('rejects a command that breaks an invariant and leaves the map untouched', () => {
    const h = new History(emptyMap());
    h.execute(addRoom(room('a', 1, 1, 3, 3)));
    const before = h.map;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = h.execute(addRoom(room('b', 2, 2, 3, 3)));
    warn.mockRestore();
    expect(result.ok).toBe(false);
    expect(h.map).toBe(before);
    expect(h.canRedo).toBe(false);
  });

  it('clears redo after a new command', () => {
    const h = new History(emptyMap());
    h.execute(addRoom(room('a', 1, 1, 1, 1)));
    h.undo();
    h.execute(addRoom(room('b', 3, 3, 1, 1)));
    expect(h.canRedo).toBe(false);
  });

  it('caps the undo stack', () => {
    const h = new History(emptyMap(), 2);
    h.execute(addRoom(room('a', 0, 0, 1, 1)));
    h.execute(addRoom(room('b', 2, 0, 1, 1)));
    h.execute(addRoom(room('c', 4, 0, 1, 1)));
    expect(h.undo()).toBe(true);
    expect(h.undo()).toBe(true);
    expect(h.undo()).toBe(false);
    expect(h.map.rooms.map((r) => r.id)).toEqual(['a']);
  });

  it('notifies subscribers and supports unsubscribe', () => {
    const h = new History(emptyMap());
    const seen: number[] = [];
    const off = h.subscribe((m) => seen.push(m.rooms.length));
    h.execute(addRoom(room('a', 1, 1, 1, 1)));
    off();
    h.undo();
    expect(seen).toEqual([1]);
  });

  it('reset replaces the map and clears history', () => {
    const h = new History(emptyMap());
    h.execute(addRoom(room('a', 1, 1, 1, 1)));
    h.reset(emptyMap(5, 5));
    expect(h.map.width).toBe(5);
    expect(h.canUndo).toBe(false);
  });
});
