import { addRoom } from '../../src/core/commands';
import { History } from '../../src/core/history';
import { historyStore, toolAfterClick, type HistoryView } from '../../src/ui/historyStore';
import { emptyMap, room } from '../core/fixtures';

describe('historyStore', () => {
  it('emits the current view immediately on subscribe', () => {
    const h = new History(emptyMap());
    const seen: HistoryView[] = [];
    historyStore(h).subscribe((v) => seen.push(v));
    expect(seen).toEqual([{ map: h.map, hero: null, encounter: null, canUndo: false, canRedo: false, undoLabel: null, redoLabel: null }]);
  });

  it('emits a new view on execute, undo and redo with the right labels', () => {
    const h = new History(emptyMap());
    const seen: HistoryView[] = [];
    historyStore(h).subscribe((v) => seen.push(v));
    h.execute(addRoom(room('a', 1, 1, 2, 2)));
    expect(seen).toHaveLength(2);
    expect(seen[1]).toMatchObject({ canUndo: true, canRedo: false, undoLabel: 'Add room', redoLabel: null });
    expect(seen[1]!.map.rooms).toHaveLength(1);
    h.undo();
    expect(seen).toHaveLength(3);
    expect(seen[2]).toMatchObject({ canUndo: false, canRedo: true, undoLabel: null, redoLabel: 'Add room' });
    expect(seen[2]!.map.rooms).toHaveLength(0);
    h.redo();
    expect(seen).toHaveLength(4);
    expect(seen[3]).toMatchObject({ canUndo: true, canRedo: false, undoLabel: 'Add room', redoLabel: null });
  });

  it('stops emitting after unsubscribe', () => {
    const h = new History(emptyMap());
    const run = vi.fn();
    const unsubscribe = historyStore(h).subscribe(run);
    expect(run).toHaveBeenCalledTimes(1);
    unsubscribe();
    h.execute(addRoom(room('a', 1, 1, 2, 2)));
    h.undo();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('emits on reset', () => {
    const h = new History(emptyMap());
    h.execute(addRoom(room('a', 1, 1, 2, 2)));
    const seen: HistoryView[] = [];
    historyStore(h).subscribe((v) => seen.push(v));
    const fresh = emptyMap(20, 20);
    h.reset(fresh);
    expect(seen[1]).toEqual({ map: fresh, hero: null, encounter: null, canUndo: false, canRedo: false, undoLabel: null, redoLabel: null });
  });
});

describe('toolAfterClick', () => {
  it('a second click on the active editor tool goes back to Play; Play stays Play', () => {
    expect(toolAfterClick('door', 'door')).toBe('play');
    expect(toolAfterClick('stairs', 'stairs')).toBe('play');
    expect(toolAfterClick('note', 'note')).toBe('play');
    expect(toolAfterClick('play', 'play')).toBe('play');
  });

  it('a click on another tool picks it', () => {
    expect(toolAfterClick('play', 'door')).toBe('door');
    expect(toolAfterClick('door', 'note')).toBe('note');
    expect(toolAfterClick('stairs', 'play')).toBe('play');
  });
});
