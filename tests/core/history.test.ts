import { addRoom, setHero } from '../../src/core/commands';
import { HISTORY_CAP, History, MERGE_WINDOW_MS, type HistoryState } from '../../src/core/history';
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

describe('History.dropLast', () => {
  it('undoes the newest step without leaving a redo, and emits', () => {
    const h = new History(emptyMap());
    h.execute(addRoom(room('a', 1, 1, 2, 2)));
    h.execute(addRoom(room('b', 6, 6, 2, 2)));
    const fn = vi.fn();
    h.subscribe(fn);
    expect(h.dropLast()).toBe(true);
    expect(h.map.rooms).toHaveLength(1);
    expect(h.canRedo).toBe(false);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(h.canMerge('x')).toBe(false);
    h.dropLast();
    expect(h.dropLast()).toBe(false);
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
    state.past.push({ label: 'x', map: emptyMap(), hero: null });
    state.future.push({ label: 'y', map: emptyMap(), hero: null });
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.exportState().past).toHaveLength(0);
  });

  describe('restore', () => {
    function three() {
      const a = new History(emptyMap());
      a.execute(addRoom(room('a', 0, 0, 1, 1)));
      a.execute(addRoom(room('b', 2, 0, 1, 1)));
      a.execute(addRoom(room('c', 4, 0, 1, 1)));
      return a;
    }

    it('replaces the timeline in place and emits once', () => {
      const a = three();
      const b = new History(emptyMap());
      const listener = vi.fn();
      b.subscribe(listener);
      b.restore(a.exportState());
      expect(listener).toHaveBeenCalledTimes(1);
      expect(b.map).toEqual(a.map);
      expect(b.undoLabel).toBe(a.undoLabel);
      expect(b.undo()).toBe(true);
      expect(b.undo()).toBe(true);
      expect(b.map.rooms.map((r) => r.id)).toEqual(['a']);
      expect(b.redo()).toBe(true);
      expect(b.map.rooms.map((r) => r.id)).toEqual(['a', 'b']);
    });

    it('keeps the newest 20 past entries; the cap is 20', () => {
      expect(HISTORY_CAP).toBe(20);
      const m = emptyMap();
      const past = Array.from({ length: 30 }, (_, i) => ({ label: `L${i}`, map: m, hero: null }));
      const b = new History(emptyMap());
      b.restore({ current: m, hero: null, past, future: [] });
      expect(b.exportState().past).toHaveLength(20);
      expect(b.undoLabel).toBe('L29');
      expect(b.exportState().past[0]!.label).toBe('L10');
    });
  });
});

describe('History carries the hero', () => {
  const h1 = { name: 'Tess', hp: 10 };

  it('hero commands undo and redo with the map unchanged', () => {
    const h = new History(emptyMap());
    const map = h.map;
    h.execute(setHero(h1, 'Create hero'));
    expect(h.hero).toBe(h1);
    expect(h.undoLabel).toBe('Create hero');
    expect(h.map).toBe(map);
    h.undo();
    expect(h.hero).toBeNull();
    expect(h.map).toBe(map);
    h.redo();
    expect(h.hero).toBe(h1);
  });

  it('map commands keep the hero, and undoing them keeps it too', () => {
    const h = new History(emptyMap());
    h.execute(setHero(h1, 'Create hero'));
    h.execute(addRoom(room('a', 1, 1, 2, 2)));
    expect(h.hero).toBe(h1);
    h.undo();
    expect(h.map.rooms).toHaveLength(0);
    expect(h.hero).toBe(h1);
  });

  describe('merging', () => {
    function timed() {
      let t = 0;
      const h = new History(emptyMap(), HISTORY_CAP, null, () => t);
      const at = (ms: number) => {
        t = ms;
      };
      return { h, at };
    }
    const hp = (h: History, n: number) => h.execute(setHero({ hp: n }, `HP ${n}`), { mergeKey: 'hp' });

    it('merges quick repeats with the same key into one step', () => {
      const { h, at } = timed();
      h.execute(setHero({ hp: 10 }, 'Create hero'));
      const base = h.exportState().past.length;
      for (const [ms, n] of [[0, 9], [500, 8], [1000, 7]] as const) {
        at(ms);
        hp(h, n);
      }
      expect(h.exportState().past).toHaveLength(base + 1);
      expect(h.undoLabel).toBe('HP 7');
      expect(h.heroBeforeLast).toEqual({ hp: 10 });
      at(3000);
      hp(h, 6);
      expect(h.exportState().past).toHaveLength(base + 2);
      expect(MERGE_WINDOW_MS).toBe(1500);
    });

    it('does not merge across an undo or a different key', () => {
      const { h, at } = timed();
      hp(h, 9);
      at(100);
      hp(h, 8);
      expect(h.exportState().past).toHaveLength(1);
      h.undo();
      h.redo();
      at(200);
      hp(h, 7);
      expect(h.exportState().past).toHaveLength(2);
      at(300);
      h.execute(setHero({ hp: 1 }, 'Other'), { mergeKey: 'xp' });
      expect(h.exportState().past).toHaveLength(3);
      at(400);
      h.execute(addRoom(room('a', 1, 1, 2, 2)));
      at(500);
      hp(h, 5);
      expect(h.exportState().past).toHaveLength(5);
    });
  });

  it('counts hero and map steps together against the cap', () => {
    const h = new History(emptyMap());
    for (let i = 0; i < 15; i++) h.execute(setHero({ i }, `H${i}`));
    for (let i = 0; i < 10; i++) h.execute(addRoom(room(`r${i}`, 1 + (i % 5) * 3, 1 + Math.floor(i / 5) * 3, 2, 2)));
    expect(h.exportState().past).toHaveLength(HISTORY_CAP);
  });

  it('exports and restores the hero in current and every entry', () => {
    const h = new History(emptyMap());
    h.execute(setHero(h1, 'Create hero'));
    h.execute(addRoom(room('a', 1, 1, 2, 2)));
    const state = JSON.parse(JSON.stringify(h.exportState())) as HistoryState;
    expect(state.hero).toEqual(h1);
    expect(state.past.map((e) => e.hero)).toEqual([null, h1]);
    const b = new History(emptyMap());
    b.restore(state);
    expect(b.hero).toEqual(h1);
    b.undo();
    b.undo();
    expect(b.hero).toBeNull();
    expect(History.fromState(state).hero).toEqual(h1);
  });
});
