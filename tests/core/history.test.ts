import { addRoom } from '../../src/core/commands';
import { History, type HistoryState } from '../../src/core/history';
import type { DungeonMap } from '../../src/core/types';
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
    const canUndoBefore = h.canUndo;
    const listener = vi.fn();
    h.subscribe(listener);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = h.execute(addRoom(room('b', 2, 2, 3, 3)));
    warn.mockRestore();
    expect(result.ok).toBe(false);
    expect(h.map).toBe(before);
    expect(h.canRedo).toBe(false);
    expect(h.canUndo).toBe(canUndoBefore);
    expect(listener).not.toHaveBeenCalled();
  });

  it('isolates throwing listeners', () => {
    const h = new History(emptyMap());
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const second = vi.fn();
    h.subscribe(() => {
      throw new Error('boom');
    });
    h.subscribe(second);
    const result = h.execute(addRoom(room('a', 1, 1, 1, 1)));
    expect(err).toHaveBeenCalled();
    err.mockRestore();
    expect(result).toEqual({ ok: true });
    expect(second).toHaveBeenCalledTimes(1);
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

describe('History snapshots', () => {
  it('labels undo and redo with the action', () => {
    const h = new History(emptyMap());
    expect(h.undoLabel).toBeNull();
    h.execute(addRoom(room('a', 1, 1, 1, 1)));
    expect(h.undoLabel).toBe('Add room');
    h.undo();
    expect(h.undoLabel).toBeNull();
    expect(h.redoLabel).toBe('Add room');
  });

  it('does not record a command that changes nothing', () => {
    const h = new History(emptyMap());
    const noop = { label: 'Nothing', apply: (m: DungeonMap) => m };
    expect(h.execute(noop)).toEqual({ ok: true });
    expect(h.canUndo).toBe(false);
  });

  it('exports and restores the whole timeline', () => {
    const h = new History(emptyMap());
    h.execute(addRoom(room('a', 1, 1, 1, 1)));
    h.execute(addRoom(room('b', 3, 3, 1, 1)));
    h.undo();
    const state = JSON.parse(JSON.stringify(h.exportState())) as HistoryState;
    const restored = History.fromState(state);
    expect(restored.map.rooms.map((r) => r.id)).toEqual(['a']);
    expect(restored.redo()).toBe(true);
    expect(restored.map.rooms.map((r) => r.id)).toEqual(['a', 'b']);
    expect(restored.undo()).toBe(true);
    expect(restored.undo()).toBe(true);
    expect(restored.map.rooms).toEqual([]);
  });

  it('shares unchanged parts between snapshots', () => {
    const h = new History(emptyMap());
    h.execute(addRoom(room('a', 1, 1, 1, 1)));
    const first = h.map.rooms[0];
    h.execute(addRoom(room('b', 3, 3, 1, 1)));
    expect(h.map.rooms[0]).toBe(first);
  });

  it('fromState with a smaller cap keeps only the newest entries', () => {
    const h = new History(emptyMap());
    h.execute(addRoom(room('a', 0, 0, 1, 1)));
    h.execute(addRoom(room('b', 2, 0, 1, 1)));
    h.execute(addRoom(room('c', 4, 0, 1, 1)));
    const restored = History.fromState(h.exportState(), 2);
    expect(restored.undo()).toBe(true);
    expect(restored.undo()).toBe(true);
    expect(restored.canUndo).toBe(false);
    expect(restored.map.rooms.map((r) => r.id)).toEqual(['a']);
  });

  it('keeps the newest label and drops the oldest when execute passes the cap', () => {
    const h = new History(emptyMap(), 2);
    h.execute(addRoom(room('a', 0, 0, 1, 1)));
    h.execute(addRoom(room('b', 2, 0, 1, 1)));
    h.execute({ ...addRoom(room('c', 4, 0, 1, 1)), label: 'Newest' });
    expect(h.undoLabel).toBe('Newest');
    expect(h.exportState().past).toHaveLength(2);
    expect(h.exportState().past[0]!.map.rooms.map((r) => r.id)).toEqual(['a']);
  });

  it('a no-op neither notifies nor clears redo', () => {
    const h = new History(emptyMap());
    h.execute(addRoom(room('a', 1, 1, 1, 1)));
    h.undo();
    expect(h.canRedo).toBe(true);
    const listener = vi.fn();
    h.subscribe(listener);
    h.execute({ label: 'Nothing', apply: (m: DungeonMap) => m });
    expect(h.canRedo).toBe(true);
    expect(listener).not.toHaveBeenCalled();
  });

  it('exportState returns copies of the arrays', () => {
    const h = new History(emptyMap());
    const state = h.exportState();
    state.past.push({ label: 'x', map: emptyMap() });
    state.future.push({ label: 'y', map: emptyMap() });
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.exportState().past).toHaveLength(0);
  });
});
