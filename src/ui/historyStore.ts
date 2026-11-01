import type { History } from '../core/history';
import type { DungeonMap } from '../core/types';

export type Tool = 'play' | 'door' | 'stairs' | 'note' | 'select';

/** What the UI needs from a History, as one immutable snapshot. */
export interface HistoryView {
  map: DungeonMap;
  hero: unknown | null;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
}

function viewOf(h: History): HistoryView {
  return { map: h.map, hero: h.hero, canUndo: h.canUndo, canRedo: h.canRedo, undoLabel: h.undoLabel, redoLabel: h.redoLabel };
}

/** A Svelte store (subscribe contract) over a History: emits now, then on every change. */
export function historyStore(h: History): { subscribe(run: (s: HistoryView) => void): () => void } {
  return {
    subscribe(run) {
      run(viewOf(h));
      return h.subscribe(() => run(viewOf(h)));
    },
  };
}
