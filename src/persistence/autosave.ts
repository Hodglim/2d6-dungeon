import type { History } from '../core/history';
import { encodeSave, type CampaignMeta } from './record';
import type { SaveStore } from './store';

export interface AutosaveStatus {
  failing: boolean;
  lastError: string | null;
  lastSavedAt: string | null;
}

export interface AutosaveOptions {
  delayMs?: number;
  setTimer?: typeof setTimeout;
  clearTimer?: typeof clearTimeout;
}

/**
 * Writes the history to the store after every change, debounced. Saves never overlap:
 * a change during an in-flight save is written after it, using the latest state.
 */
export class Autosaver {
  private readonly delayMs: number;
  private readonly setTimer: typeof setTimeout;
  private readonly clearTimer: typeof clearTimeout;
  private unsubscribe: (() => void) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;
  private paused = false;
  private disposed = false;
  private persistRequested = false;
  private running: Promise<void> | null = null;
  private status: AutosaveStatus = { failing: false, lastError: null, lastSavedAt: null };
  private listeners = new Set<(s: AutosaveStatus) => void>();

  constructor(
    private readonly history: History,
    private readonly store: SaveStore,
    private readonly meta: () => CampaignMeta,
    opts: AutosaveOptions = {},
  ) {
    this.delayMs = opts.delayMs ?? 1000;
    this.setTimer = opts.setTimer ?? ((...a) => setTimeout(...a));
    this.clearTimer = opts.clearTimer ?? ((...a) => clearTimeout(...a));
  }

  start(): void {
    if (this.unsubscribe || this.disposed) return;
    this.unsubscribe = this.history.subscribe(() => this.schedule());
  }

  /** Writes immediately if a save is pending, and resolves once nothing is in flight. */
  async flush(): Promise<void> {
    this.cancelTimer();
    await this.drain();
  }

  pause(): void {
    this.paused = true;
    this.dirty = false;
    this.cancelTimer();
  }

  resume(): void {
    this.paused = false;
  }

  dispose(): void {
    this.disposed = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.dirty = false;
    this.cancelTimer();
    this.listeners.clear();
  }

  subscribe(fn: (s: AutosaveStatus) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private schedule(): void {
    if (this.paused || this.disposed) return;
    this.dirty = true;
    this.cancelTimer();
    this.timer = this.setTimer(() => {
      this.timer = null;
      void this.drain();
    }, this.delayMs);
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      this.clearTimer(this.timer);
      this.timer = null;
    }
  }

  private drain(): Promise<void> {
    this.running ??= this.loop().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async loop(): Promise<void> {
    while (this.dirty && !this.paused && !this.disposed) {
      this.dirty = false;
      try {
        await this.store.save(encodeSave(this.meta(), this.history.exportState()));
        this.set({ failing: false, lastError: null, lastSavedAt: new Date().toISOString() });
        if (!this.persistRequested) {
          this.persistRequested = true;
          void this.store.requestPersist().catch(() => false);
        }
      } catch (err) {
        this.set({ ...this.status, failing: true, lastError: err instanceof Error ? err.message : String(err) });
      }
    }
  }

  private set(s: AutosaveStatus): void {
    this.status = s;
    for (const fn of [...this.listeners]) fn(s);
  }
}
