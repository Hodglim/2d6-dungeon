import type { Command } from './commands';
import { checkInvariants } from './rules';
import type { DungeonMap } from './types';

export type ExecResult = { ok: true } | { ok: false; reason: string };
export type Listener = (map: DungeonMap) => void;

/** Holds the current map, validates every command, and provides undo/redo. */
export class History {
  private past: Command[] = [];
  private future: Command[] = [];
  private listeners = new Set<Listener>();

  constructor(
    private current: DungeonMap,
    private readonly cap = 200,
  ) {}

  get map(): DungeonMap {
    return this.current;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  execute(cmd: Command): ExecResult {
    const next = cmd.apply(this.current);
    const problem = checkInvariants(next);
    if (problem) {
      console.warn(`Rejected "${cmd.label}": ${problem}`);
      return { ok: false, reason: problem };
    }
    this.current = next;
    this.past.push(cmd);
    if (this.past.length > this.cap) this.past.shift();
    this.future = [];
    this.emit();
    return { ok: true };
  }

  undo(): boolean {
    const cmd = this.past.pop();
    if (!cmd) return false;
    this.current = cmd.undo(this.current);
    this.future.push(cmd);
    this.emit();
    return true;
  }

  redo(): boolean {
    const cmd = this.future.pop();
    if (!cmd) return false;
    this.current = cmd.apply(this.current);
    this.past.push(cmd);
    this.emit();
    return true;
  }

  /** Replace the map entirely (e.g. on load) and clear history. */
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
    for (const fn of this.listeners) fn(this.current);
  }
}
