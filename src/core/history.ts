import type { Command, HeroCommand, PlayCommand } from './commands';
import { checkInvariants } from './invariants';
import type { DungeonMap } from './types';

export type ExecResult = { ok: true } | { ok: false; reason: string };
export type Listener = (map: DungeonMap) => void;

/** Everything one undo step covers: the map and an opaque hero (the system gives it a type). */
export interface GameState {
  map: DungeonMap;
  hero: unknown | null;
  encounter: unknown | null;
}

/** Quick repeated edits with the same merge key inside this window share one undo step. */
export const MERGE_WINDOW_MS = 1500;

/** A map state on the timeline, with the label of the action that separates it from the current state. */
export interface HistoryEntry {
  label: string;
  map: DungeonMap;
  hero: unknown | null;
  encounter: unknown | null;
}

/** Plain-data snapshot of a History, for saving alongside the campaign. */
export interface HistoryState {
  current: DungeonMap;
  hero: unknown | null;
  encounter: unknown | null;
  past: HistoryEntry[];
  future: HistoryEntry[];
}

export const HISTORY_CAP = 20;

/**
 * The single undo/redo timeline for every action. Stores map snapshots (unchanged parts
 * are shared between snapshots), validates every command, and can be exported/restored
 * so undo survives closing the app.
 */
export class History {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  private listeners = new Set<Listener>();
  private currentHero: unknown | null;
  private currentEncounter: unknown | null;
  /** Key and time of the previous execute, while nothing else has happened since. */
  private lastMerge: { key: string; at: number } | null = null;

  constructor(
    private current: DungeonMap,
    private readonly cap = HISTORY_CAP,
    hero: unknown | null = null,
    private readonly now: () => number = Date.now,
    encounter: unknown | null = null,
  ) {
    this.currentHero = hero;
    this.currentEncounter = encounter;
  }

  /** Restores an exported timeline, keeping only the newest `cap` past entries.
   * Trusts its input: callers must validate a loaded state (structure and checkInvariants
   * for every snapshot) before calling this. */
  static fromState(state: HistoryState, cap = HISTORY_CAP): History {
    const h = new History(state.current, cap, state.hero ?? null, Date.now, state.encounter ?? null);
    h.past = state.past.slice(-cap).map(norm);
    h.future = state.future.slice(-cap).map(norm);
    return h;
  }

  exportState(): HistoryState {
    return { current: this.current, hero: this.currentHero, encounter: this.currentEncounter, past: [...this.past], future: [...this.future] };
  }

  /** Replaces current/past/future in place (past/future trimmed to the cap) and emits once,
   * so existing subscribers keep working. Trusts its input like fromState. */
  restore(state: HistoryState): void {
    this.current = state.current;
    this.currentHero = state.hero ?? null;
    this.currentEncounter = state.encounter ?? null;
    this.past = state.past.slice(-this.cap).map(norm);
    this.future = state.future.slice(-this.cap).map(norm);
    this.lastMerge = null;
    this.emit();
  }

  get map(): DungeonMap {
    return this.current;
  }

  get hero(): unknown | null {
    return this.currentHero;
  }

  get encounter(): unknown | null {
    return this.currentEncounter;
  }

  /** The hero as it was before the newest undo step (for building merged labels like "HP -3"). */
  get heroBeforeLast(): unknown | null {
    return this.past[this.past.length - 1]?.hero ?? null;
  }

  /** The encounter as it was before the newest undo step (for merged labels like "Guard HP −3"). */
  get encounterBeforeLast(): unknown | null {
    return this.past[this.past.length - 1]?.encounter ?? null;
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

  /** True when an execute with this key right now would fold into the newest step. */
  canMerge(key: string): boolean {
    return this.past.length > 0 && this.lastMerge?.key === key && this.now() - this.lastMerge.at < MERGE_WINDOW_MS;
  }

  execute(cmd: Command | HeroCommand | PlayCommand, opts: { mergeKey?: string } = {}): ExecResult {
    let map = this.current;
    let hero = this.currentHero;
    let encounter = this.currentEncounter;
    if ('applyPlay' in cmd) {
      const next = cmd.applyPlay({ hero, encounter });
      hero = next.hero;
      encounter = next.encounter;
    } else if ('applyHero' in cmd) {
      hero = cmd.applyHero(hero);
    } else {
      map = cmd.apply(map);
    }
    if (map === this.current && hero === this.currentHero && encounter === this.currentEncounter) return { ok: true };
    if (map !== this.current) {
      const problem = checkInvariants(map);
      if (problem) {
        console.warn(`Rejected "${cmd.label}": ${problem}`);
        return { ok: false, reason: problem };
      }
    }
    const at = this.now();
    const key = opts.mergeKey;
    const top = this.past[this.past.length - 1];
    const merge = key !== undefined && top !== undefined && this.canMerge(key);
    if (merge) {
      top.label = cmd.label;
    } else {
      this.past.push({ label: cmd.label, map: this.current, hero: this.currentHero, encounter: this.currentEncounter });
      if (this.past.length > this.cap) this.past.shift();
    }
    this.lastMerge = key === undefined ? null : { key, at };
    this.future = [];
    this.current = map;
    this.currentHero = hero;
    this.currentEncounter = encounter;
    this.emit();
    return { ok: true };
  }

  undo(): boolean {
    const entry = this.past.pop();
    if (!entry) return false;
    this.future.push({ label: entry.label, map: this.current, hero: this.currentHero, encounter: this.currentEncounter });
    this.current = entry.map;
    this.currentHero = entry.hero;
    this.currentEncounter = entry.encounter;
    this.lastMerge = null;
    this.emit();
    return true;
  }

  /** Undo the newest step and forget it: it is not put on the redo list. For taps that cancel each other out. */
  dropLast(): boolean {
    const entry = this.past.pop();
    if (!entry) return false;
    this.current = entry.map;
    this.currentHero = entry.hero;
    this.currentEncounter = entry.encounter;
    this.lastMerge = null;
    this.emit();
    return true;
  }

  redo(): boolean {
    const entry = this.future.pop();
    if (!entry) return false;
    this.past.push({ label: entry.label, map: this.current, hero: this.currentHero, encounter: this.currentEncounter });
    this.current = entry.map;
    this.currentHero = entry.hero;
    this.currentEncounter = entry.encounter;
    this.lastMerge = null;
    this.emit();
    return true;
  }

  /** Replace the map, hero and encounter entirely (e.g. on import) and clear history. */
  reset(map: DungeonMap, hero: unknown | null = null, encounter: unknown | null = null): void {
    this.current = map;
    this.currentHero = hero;
    this.currentEncounter = encounter;
    this.past = [];
    this.future = [];
    this.lastMerge = null;
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

/** A saved entry without a hero or encounter reads as none. */
function norm(e: HistoryEntry): HistoryEntry {
  return e.hero === undefined || e.encounter === undefined
    ? { ...e, hero: e.hero ?? null, encounter: e.encounter ?? null }
    : e;
}
