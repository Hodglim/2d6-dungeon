// The dice desk: what the one floating roller is rolling for, who asked, where a finished roll goes
// and the short labelled history. Pure and node-testable; components subscribe (Svelte store contract).
// Rolling here never touches the game: nothing goes on the History or into the save.
import type { DiceState } from '../systems/dungeon/shift';
import type { Rng } from '../systems/dungeon/rules';
import { addToHistory, rollDice, rollLabel, rollWorking, type DicePrefs, type DiceKind } from './diceRoller';

export interface ShiftControl {
  pool: number; // already clamped to >= 0
  unknownShift: boolean;
  state: DiceState | null;
  onchange: (s: DiceState | null) => void;
}

export interface DiceJob {
  id: string;
  kind: 'request' | 'watcher';
  label: string; // For-line text without dice or modifier: "Room size", "XX1 Practice Crate"
  dice: DiceKind;
  modifier: number | null; // null: no modifier row (always null for d66)
  modifierEditable?: boolean; // default true when modifier !== null
  roll?: () => number[] | null; // asker's own roll; null or [] means "refused"
  rolled: (faces: number[], modifier: number) => void;
  /** Typed dice. A non-empty string is the asker's validation error: nothing is applied or recorded. */
  enter: (values: string[], modifier: number) => string | null | void;
  error?: string | null;
  oneShot?: boolean; // removed after rolled/enter
  /** A request that stays registered for a whole turn (the attack dice): other requests take over from it, and the roller falls back to it last. */
  standing?: boolean;
  shift?: ShiftControl;
  /** Rolls only from its own Roll button: never aimed at on its own, and free rolls pass it by (a table showing a result). */
  idle?: boolean;
}

export interface DeskView {
  open: boolean;
  kind: DiceKind;
  modifier: number;
  enterMode: boolean;
  target: DiceJob | null; // null: free roll
  jobs: readonly DiceJob[]; // registration order
  history: readonly string[]; // newest first, at most HISTORY_SIZE
  rollSeq: number; // bumps when a Roll button asks the panel to roll now
  focusSeq: number; // bumps when a Roll button asks for typing (enter mode)
}

const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`);
const SHIFT_SUFFIX = / \(shifted to [^)]*\)$/;

export function forLine(target: DiceJob | null, kind: DiceKind, modifier: number): string {
  return target ? `${target.label} · ${rollLabel(target.dice, modifier)}` : 'Free roll';
}

export function historyLine(target: DiceJob | null, kind: DiceKind, faces: number[], modifier: number): string {
  const dice = target ? target.dice : kind;
  const mod = dice === 'd66' ? 0 : modifier;
  if (!target) return `Free ${rollLabel(dice, mod)}: ${rollWorking(dice, faces, mod)}`;
  return `${target.label}${mod ? ' ' + signed(mod) : ''}: ${rollWorking(dice, faces, mod)}`;
}

export class DiceDesk {
  private open: boolean;
  private kind: DiceKind;
  private modifier = 0;
  private enterMode: boolean;
  private targetId: string | null = null;
  private jobs: DiceJob[] = [];
  private history: string[] = [];
  private lastOwner: string | null = null; // the job the newest history line belongs to
  private rollSeq = 0;
  private focusSeq = 0;
  private snapshot!: DeskView;
  private readonly subs = new Set<(v: DeskView) => void>();

  constructor(prefs: DicePrefs) {
    this.open = prefs.open;
    this.kind = prefs.dice;
    this.enterMode = prefs.enter;
    this.rebuild();
  }

  subscribe(run: (v: DeskView) => void): () => void {
    this.subs.add(run);
    run(this.snapshot);
    return () => void this.subs.delete(run);
  }

  get view(): DeskView {
    return this.snapshot;
  }

  prefs(): DicePrefs {
    return { open: this.open, dice: this.kind, enter: this.enterMode };
  }

  private get target(): DiceJob | null {
    return this.targetId === null ? null : (this.jobs.find((j) => j.id === this.targetId) ?? null);
  }

  private rebuild(): void {
    this.snapshot = {
      open: this.open,
      kind: this.kind,
      modifier: this.modifier,
      enterMode: this.enterMode,
      target: this.target,
      jobs: [...this.jobs],
      history: [...this.history],
      rollSeq: this.rollSeq,
      focusSeq: this.focusSeq,
    };
    for (const run of [...this.subs]) run(this.snapshot);
  }

  /** Make `job` the target: its dice, and its modifier (0 when it has none). */
  private aim(job: DiceJob | null): void {
    this.targetId = job ? job.id : null;
    if (job) this.kind = job.dice;
    this.modifier = job?.modifier ?? 0;
  }

  put(job: DiceJob): void {
    const i = this.jobs.findIndex((j) => j.id === job.id);
    if (i >= 0) {
      const old = this.jobs[i]!;
      this.jobs[i] = job;
      if (this.targetId === job.id) {
        if (job.idle && !old.idle) this.fallBack();
        else if (old.dice !== job.dice) this.aim(job);
        else if (job.modifier === null) this.modifier = 0;
      }
    } else {
      this.jobs.push(job);
      const t = this.target;
      if (job.idle) {
        /* waits for its own Roll button */
      } else if (!t || (t.kind === 'watcher' && job.kind === 'request') || (t.standing && job.kind === 'request' && !job.standing)) this.aim(job);
    }
    this.rebuild();
  }

  /** After the target goes: the newest request, then the newest watcher, then a free roll. */
  private fallBack(): void {
    const newest = (ok: (j: DiceJob) => boolean) => [...this.jobs].reverse().find((j) => !j.idle && ok(j)) ?? null;
    this.aim(newest((j) => j.kind === 'request' && !j.standing) ?? newest((j) => j.kind === 'request') ?? newest((j) => j.kind === 'watcher'));
  }

  private drop(id: string): void {
    const i = this.jobs.findIndex((j) => j.id === id);
    if (i < 0) return;
    this.jobs.splice(i, 1);
    if (this.targetId === id) this.fallBack();
  }

  remove(id: string): void {
    if (!this.jobs.some((j) => j.id === id)) return;
    this.drop(id);
    this.rebuild();
  }

  private bump(): void {
    if (this.enterMode) this.focusSeq++;
    else this.rollSeq++;
  }

  rollNow(id: string): void {
    const job = this.jobs.find((j) => j.id === id);
    if (!job) return;
    if (this.targetId !== id) this.aim(job);
    this.open = true;
    this.bump();
    this.rebuild();
  }

  ask(job: DiceJob): void {
    this.put(job);
    this.rollNow(job.id);
  }

  rollFree(dice: DiceKind, modifier = 0): void {
    this.targetId = null;
    this.kind = dice;
    this.modifier = dice === 'd66' ? 0 : modifier;
    this.open = true;
    this.bump();
    this.rebuild();
  }

  /** Point the roller at `id` again and open it. Unlike rollNow it neither rolls nor asks for typing. */
  aimAt(id: string): void {
    const job = this.jobs.find((j) => j.id === id);
    if (!job) return;
    if (this.targetId !== id) this.aim(job);
    this.open = true;
    this.rebuild();
  }

  clearTarget(): void {
    if (this.targetId === null) return;
    this.aim(null);
    this.rebuild();
  }

  /** Pick dice. Other dice than the target's switch to a free roll; the job stays registered. */
  choose(kind: DiceKind): void {
    const t = this.target;
    if (t && t.dice === kind) return;
    this.targetId = null;
    this.kind = kind;
    this.modifier = 0;
    this.rebuild();
  }

  setModifier(n: number): void {
    const t = this.target;
    if (t ? t.modifier === null || t.modifierEditable === false : this.kind === 'd66') return;
    this.modifier = n;
    this.rebuild();
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.rebuild();
  }

  setEnterMode(on: boolean): void {
    this.enterMode = on;
    this.rebuild();
  }

  facesFor(rng: Rng): { jobId: string | null; faces: number[] } | null {
    const t = this.target;
    if (!t) return { jobId: null, faces: rollDice(this.kind, rng) };
    const faces = t.roll ? t.roll() : rollDice(t.dice, rng);
    return faces && faces.length > 0 ? { jobId: t.id, faces } : null;
  }

  private record(job: DiceJob | null, dice: DiceKind, faces: number[], modifier: number): void {
    this.history = addToHistory(this.history, historyLine(job, dice, faces, modifier));
    this.lastOwner = job ? job.id : null;
  }

  /** A roll landed. `dice` and `modifier` are what the roll started with, not what the desk shows now. */
  settle(jobId: string | null, faces: number[], dice: DiceKind, modifier: number): void {
    const job = jobId === null ? null : (this.jobs.find((j) => j.id === jobId) ?? null);
    const mod = dice === 'd66' ? 0 : modifier;
    this.record(job, dice, faces, mod);
    if (job) {
      job.rolled(faces, job.modifier === null ? 0 : mod);
      if (job.oneShot) this.drop(job.id);
      else if (job.idle && this.targetId === job.id) this.fallBack();
    } else if (jobId === null) {
      for (const w of this.jobs.filter((j) => j.kind === 'watcher' && !j.idle && j.dice === dice)) w.rolled(faces, mod);
    }
    this.rebuild();
  }

  /**
   * Typed dice. Returns the text to show when the entry is refused (nothing is recorded or applied),
   * else null. A job's `enter` is always called, so its own step can show its own message.
   */
  settleTyped(values: string[]): string | null {
    const t = this.target;
    const dice = t ? t.dice : this.kind;
    const count = rollDice(dice, () => 0).length;
    const faces = values.map((v) => (/^\s*[1-6]\s*$/.test(v) ? Number(v) : NaN));
    const valid = faces.length === count && !faces.some(Number.isNaN);
    const standard = count === 1 ? 'Type a number from 1 to 6.' : 'Type a number from 1 to 6 on each die.';
    if (t) {
      const mod = t.modifier === null ? 0 : this.modifier;
      const err = t.enter(values, mod);
      if (typeof err === 'string' && err) return err;
      if (!valid) return standard;
      this.record(t, dice, faces, mod);
      if (t.oneShot) this.drop(t.id);
      else if (t.idle) this.fallBack();
      this.rebuild();
      return null;
    }
    if (!valid) return standard;
    this.settle(null, faces, this.kind, this.modifier);
    return null;
  }

  noteShift(id: string, faces: readonly number[]): void {
    if (this.lastOwner !== id || this.history.length === 0) return;
    const base = this.history[0]!.replace(SHIFT_SUFFIX, '');
    this.history = [`${base} (shifted to ${faces.join(', ')})`, ...this.history.slice(1)];
    this.rebuild();
  }
}
