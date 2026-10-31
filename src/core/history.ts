import type { Command } from './commands';
import { checkInvariants } from './invariants';
import type { DungeonMap } from './types';

export type ExecResult = { ok: true } | { ok: false; reason: string };
export type Listener = (map: DungeonMap) => void;

/** A map state on the timeline, with the label of the action that separates it from the current state. */
export interface HistoryEntry {
  label: string;
  map: DungeonMap;
}

/** Plain-data snapshot of a History, for saving alongside the campaign. */
export interface HistoryState {
  current: DungeonMap;
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export const HISTORY_CAP = 200;

/**
 * The single undo/redo timeline for every action. Stores map snapshots (unchanged parts
 * are shared between snapshots), validates every command, and can be exported/restored
 * so undo survives closing the app.
 */
export class History {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private listeners = new Set<Listener>();

  constructor(
    private current: DungeonMap,
    private readonly cap = HISTORY_CAP,
  ) {}

  static fromState(state: HistoryState, cap = HISTORY_CAP): History {
    const h = new History(state.current, cap);
    h.past = state.past.slice(-cap);
    h.future = state.future.slice(-cap);
    return h;
  }

  exportState(): HistoryState {
    return { current: this.current, past: [...this.past], future: [...this.future] };
  }

  get map(): DungeonMap {
    return this.current;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Label of the action Undo would reverse, e.g. "Add Room 3". */
  get undoLabel(): string | null {
    return this.past[this.past.length - 1]?.label ?? null;
  }

  /** Label of the action Redo would repeat. */
  get redoLabel(): string | null {
    return this.future[this.future.length - 1]?.label ?? null;
  }

  execute(cmd: Command): ExecResult {
    const next = cmd.apply(this.current);
    if (next === this.current) return { ok: true };
    const problem = checkInvariants(next);
    if (problem) {
      console.warn(`Rejected "${cmd.label}": ${problem}`);
      return { ok: false, reason: problem };
    }
    this.past.push({ label: cmd.label, map: this.current });
    if (this.past.length > this.cap) this.past.shift();
    this.future = [];
    this.current = next;
    this.emit();
    return { ok: true };
  }

  undo(): boolean {
    const entry = this.past.pop();
    if (!entry) return false;
    this.future.push({ label: entry.label, map: this.current });
    this.current = entry.map;
    this.emit();
    return true;
  }

  redo(): boolean {
    const entry = this.future.pop();
    if (!entry) return false;
    this.past.push({ label: entry.label, map: this.current });
    this.current = entry.map;
    this.emit();
    return true;
  }

  /** Replace the map entirely (e.g. on import) and clear history. */
  reset(map: DungeonMap): void {
    this.current = map;
    this.past = [];
    this.future = [];
    this.emit();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of [...this.listeners]) {
      try {
        fn(this.current);
      } catch (err) {
        console.error('History listener failed', err);
      }
    }
  }
}
