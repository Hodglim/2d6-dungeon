// The play-flow state machine: entrance → size → position → exits → label → one commit.
// Pure TS (no Svelte, no DOM). Drafts never touch the map; only finish()/placeGap() execute.

import { addDoor, addRoom, type Command } from '../core/commands';
import { allowedExitEdges, placeExitsClockwise } from '../core/exits';
import { sameEdge } from '../core/geometry';
import type { ExecResult, History } from '../core/history';
import type { IdFn } from '../core/ids';
import { entranceCells, evaluatePlacement, ghostRect, shrinkToFit, slideRange, type PlacementResult } from '../core/placement';
import {
  createEntranceAndRoom,
  createGapCorridor,
  createRoomAndWalk,
  gapCorridorGhost,
  gapCorridorRect,
  makeDoor,
  maxGapLength,
  newRoom,
  placeEntrance,
} from '../core/playflow';
import { isOpenExit } from '../core/query';
import type { Cell, Door, DungeonMap, Edge, Rect, Room, RoomLabel } from '../core/types';
import { dungeonSystem } from '../systems/dungeon';
import {
  classify,
  exitCountFor,
  firstWallIndex,
  needsSecondRoll,
  parseDie,
  resolveRoomSize,
  rollD6,
  rollD66,
  type D66,
  type Rng,
  type RoomSize,
  type SizeClass,
} from '../systems/dungeon/rules';

export type Source = { kind: 'entrance'; cell: Cell } | { kind: 'exit'; doorId: string };

export interface Draft {
  source: Source;
  room: Room;
  kindOf: 'room' | 'corridor';
  sizeClass: SizeClass | null;
}

export type Step =
  | { kind: 'idle'; error: string | null }
  | { kind: 'size'; source: Source; first: D66 | null; needsSecond: boolean; error: string | null }
  | {
      kind: 'position';
      source: Source;
      size: RoomSize;
      w: number;
      h: number;
      offset: number;
      placement: PlacementResult;
      canShrink: boolean;
    }
  | { kind: 'exitCount'; draft: Draft; error: string | null }
  | { kind: 'exitType'; draft: Draft; count: number }
  | {
      kind: 'exits';
      draft: Draft;
      count: number;
      exitType: string;
      chosen: Edge[];
      dropped: number;
      /** Set when the user tries to finish while placeable exits remain. */
      error: string | null;
    }
  | { kind: 'label'; draft: Draft; chosen: Edge[]; exitType: string; dropped: number }
  | {
      kind: 'gap';
      door: Door;
      length: number;
      /** The corridor to place, or null when it collides. */
      rect: Rect | null;
      /** The corridor attempted at this length, drawn red when `rect` is null. */
      attempt: Rect | null;
      /** Longest length before the Outer Boundary would clip it. */
      maxLength: number;
    };

const BAD_DIE = 'Enter a whole number from 1 to 6';
const IDLE: Step = { kind: 'idle', error: null };

export class PlayFlow {
  private current: Step = IDLE;
  private listeners = new Set<(s: Step) => void>();
  /** Map the draft is built on: history.map, plus the entrance square for the entrance flow. */
  private base: DungeonMap;
  /** Base plus the draft room, from the exitCount step on. */
  private withRoom: DungeonMap | null = null;
  /** The open exit the room is placed against. */
  private door: Door | null = null;
  /** Ids handed out while drafting the entrance flow, replayed at commit so ids agree. */
  private recorded: string[] = [];
  private committing = false;
  private walk: Cell[] | null = null;
  private readonly unsubscribe: () => void;

  constructor(
    private readonly history: History,
    private readonly rng: Rng,
    private readonly newId: IdFn,
  ) {
    this.base = history.map;
    let seen = history.map;
    this.unsubscribe = history.subscribe((map) => {
      if (map === seen) return; // a hero-only change leaves the draft alone
      seen = map;
      if (this.committing) return;
      this.walk = null;
      this.reset(null);
    });
  }

  /** Stops listening to History; later History changes no longer touch this flow. */
  dispose(): void {
    this.unsubscribe();
  }

  get step(): Step {
    return this.current;
  }

  /** The map as it would look with the draft room (for highlights / ghost); equals history.map when idle. */
  get draftMap(): DungeonMap {
    if (this.current.kind === 'idle' || this.current.kind === 'gap') return this.history.map;
    return this.withRoom ?? this.base;
  }

  /** Path the token should animate after the last commit (null if none). */
  get lastWalk(): Cell[] | null {
    return this.walk;
  }

  subscribe(fn: (s: Step) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ---- step 0 ----

  /** Valid only on an empty map with no entrance, on a square from entranceCells. */
  startEntrance(cell: Cell): void {
    if (this.current.kind !== 'idle') return;
    const map = this.history.map;
    if (map.rooms.length > 0) return this.idleError('This map already has an entrance');
    if (!entranceCells(map, dungeonSystem.entranceEdge).some((c) => c.x === cell.x && c.y === cell.y)) {
      return this.idleError('Place the entrance on a square just below the bottom edge');
    }
    this.recorded = [];
    const base = placeEntrance(map, dungeonSystem, cell, this.recordingIds()).apply(map);
    this.base = base;
    this.door = base.doors.find((d) => isOpenExit(base, d)) ?? null;
    this.withRoom = null;
    this.set({ kind: 'size', source: { kind: 'entrance', cell }, first: null, needsSecond: false, error: null });
  }

  /** Valid only for an open exit with room for at least a 1×1 space in front of it. */
  startFromExit(doorId: string): void {
    if (this.current.kind !== 'idle') return;
    const map = this.history.map;
    const door = this.openExit(doorId);
    if (!door) return;
    if (!shrinkToFit(map, door, 1, 1, 0)) return this.idleError('No space beyond this exit');
    this.base = map;
    this.door = door;
    this.withRoom = null;
    this.recorded = [];
    this.set({ kind: 'size', source: { kind: 'exit', doorId }, first: null, needsSecond: false, error: null });
  }

  // ---- step 1: size ----

  enterSize(primary: string, secondary: string): void {
    if (this.current.kind !== 'size') return;
    const p = parseDie(primary);
    const s = parseDie(secondary);
    if (p === null || s === null) {
      this.set({ ...this.current, error: BAD_DIE });
      return;
    }
    this.applySize({ primary: p, secondary: s });
  }

  rollSize(): void {
    if (this.current.kind !== 'size') return;
    this.applySize(rollD66(this.rng));
  }

  /** Rolls the room dice with the injected rng but applies nothing; pass the result to applyRolledSize. */
  rollSizeDice(): D66 | null {
    return this.current.kind === 'size' ? rollD66(this.rng) : null;
  }

  /** Applies dice from rollSizeDice (after the UI has shown them rolling). */
  applyRolledSize(dice: D66): void {
    this.applySize(dice);
  }

  private applySize(dice: D66): void {
    if (this.current.kind !== 'size') return;
    const { source, first } = this.current;
    const entrance = source.kind === 'entrance';
    if (first === null && needsSecondRoll(dice, entrance)) {
      this.set({ ...this.current, first: dice, needsSecond: true, error: null });
      return;
    }
    const size = first === null ? resolveRoomSize(dice, null, entrance) : resolveRoomSize(first, dice, entrance);
    this.toPosition(source, size, size.w, size.h, null);
  }

  // ---- step 2: position ----

  /** Offsets along the wall where the w×h room can be placed as is. */
  private validOffsets(w: number, h: number): number[] {
    const door = this.door!;
    const n = slideRange(this.base, door, w, h);
    const out: number[] = [];
    for (let o = 0; o < n; o++) if (evaluatePlacement(this.base, door, w, h, o).ok) out.push(o);
    return out;
  }

  /** `offset` null starts in the middle, moved to the nearest valid offset when the middle is blocked. */
  private toPosition(source: Source, size: RoomSize, w: number, h: number, offset: number | null): void {
    const door = this.door!;
    const range = slideRange(this.base, door, w, h);
    const middle = Math.floor((range - 1) / 2);
    let o = Math.max(0, Math.min(offset ?? middle, range - 1));
    if (offset === null) {
      const valid = this.validOffsets(w, h);
      if (valid.length > 0 && !valid.includes(o)) {
        o = valid.reduce((best, v) => (Math.abs(v - middle) < Math.abs(best - middle) ? v : best));
      }
    }
    const placement = evaluatePlacement(this.base, door, w, h, o);
    const canShrink = !placement.ok && shrinkToFit(this.base, door, w, h, o) !== null;
    this.set({ kind: 'position', source, size, w, h, offset: o, placement, canShrink });
  }

  /**
   * The arrow buttons: a request above (below) the current offset steps to the next valid
   * offset in that direction, or stays put when there is none. With no valid offset at all
   * it clamps, so a red ghost can still be moved.
   */
  slide(offset: number): void {
    const s = this.current;
    if (s.kind !== 'position' || !Number.isInteger(offset) || offset === s.offset) return;
    const valid = this.validOffsets(s.w, s.h);
    if (valid.length === 0) return this.toPosition(s.source, s.size, s.w, s.h, offset);
    const next = offset > s.offset ? valid.find((v) => v > s.offset) : [...valid].reverse().find((v) => v < s.offset);
    if (next !== undefined) this.toPosition(s.source, s.size, s.w, s.h, next);
  }

  /** Slide to the valid offset whose ghost is nearest the cell (nearest of any kind when none is valid). */
  slideTo(cell: Cell): void {
    const s = this.current;
    if (s.kind !== 'position') return;
    const n = slideRange(this.base, this.door!, s.w, s.h);
    const valid = this.validOffsets(s.w, s.h);
    const candidates = valid.length > 0 ? valid : Array.from({ length: n }, (_, o) => o);
    let best = s.offset;
    let bestDist = Infinity;
    for (const o of candidates) {
      const r = ghostRect(this.base, this.door!, s.w, s.h, o);
      if (!r) continue;
      const dist = Math.abs(cell.x + 0.5 - (r.x + r.w / 2)) + Math.abs(cell.y + 0.5 - (r.y + r.h / 2));
      if (dist < bestDist) {
        bestDist = dist;
        best = o;
      }
    }
    if (best !== s.offset) this.toPosition(s.source, s.size, s.w, s.h, best);
  }

  shrink(): void {
    const s = this.current;
    if (s.kind !== 'position') return;
    const fit = shrinkToFit(this.base, this.door!, s.w, s.h, s.offset);
    if (fit) this.toPosition(s.source, s.size, fit.w, fit.h, fit.offset);
  }

  place(): void {
    const s = this.current;
    if (s.kind !== 'position' || !s.placement.ok || !s.placement.rect) return;
    const rect = s.placement.rect; // the clipped rect is the room's final size
    const entrance = s.source.kind === 'entrance';
    const cls = classify(rect, s.size);
    const kindOf: 'room' | 'corridor' = !entrance && cls === 'corridor' ? 'corridor' : 'room';
    const sizeClass: SizeClass | null = kindOf === 'corridor' ? null : cls === 'corridor' ? 'small' : cls;
    const ids: IdFn = entrance ? this.recordingIds() : this.newId;
    const room = newRoom(this.base, rect, this.door!, ids, kindOf, sizeClass);
    if (entrance) room.label = { ...room.label, type: 'Entrance Room' };
    this.withRoom = addRoom(room).apply(this.base);
    const draft: Draft = { source: s.source, room, kindOf, sizeClass };
    if (entrance) {
      const { exits, dropped } = placeExitsClockwise(this.withRoom, room.id, 3, 0);
      this.set({ kind: 'exits', draft, count: 3, exitType: 'archway', chosen: exits, dropped, error: null });
    } else {
      this.set({ kind: 'exitCount', draft, error: null });
    }
  }

  // ---- step 3: exit count ----

  enterExitCount(text: string): void {
    if (this.current.kind !== 'exitCount') return;
    const d = parseDie(text);
    if (d === null) {
      this.set({ ...this.current, error: BAD_DIE });
      return;
    }
    this.applyExitCount(d);
  }

  rollExitCount(): void {
    if (this.current.kind !== 'exitCount') return;
    this.applyExitCount(rollD6(this.rng));
  }

  /** Rolls one D6 with the injected rng without applying it (exit count, first wall). */
  rollDie(): number {
    return rollD6(this.rng);
  }

  /** Applies a D6 from rollDie as the exit count. */
  applyRolledExitCount(d6: number): void {
    this.applyExitCount(d6);
  }

  private applyExitCount(d6: number): void {
    if (this.current.kind !== 'exitCount') return;
    const { draft } = this.current;
    const count = exitCountFor(d6);
    const archwayOnly = draft.kindOf === 'corridor' || draft.sizeClass === 'small';
    if (count === 0 && draft.kindOf === 'room') {
      this.set({ kind: 'label', draft, chosen: [], exitType: 'archway', dropped: 0 });
    } else if (count === 0 || archwayOnly) {
      // A corridor with no exits still gets the exits step as its confirmation screen.
      this.set({ kind: 'exits', draft, count, exitType: 'archway', chosen: [], dropped: 0, error: null });
    } else {
      this.set({ kind: 'exitType', draft, count });
    }
  }

  // ---- step 4: exit type ----

  chooseExitType(type: string): void {
    const s = this.current;
    if (s.kind !== 'exitType' || !dungeonSystem.doorTypes.some((t) => t.id === type)) return;
    this.set({ kind: 'exits', draft: s.draft, count: s.count, exitType: type, chosen: [], dropped: 0, error: null });
  }

  // ---- step 5: exits ----

  /** Exit edges the user may tap now (empty once the count is reached). */
  get allowedExits(): Edge[] {
    const s = this.current;
    if (s.kind !== 'exits' || !this.withRoom || s.chosen.length >= s.count) return [];
    return allowedExitEdges(this.withRoom, s.draft.room.id, s.chosen);
  }

  toggleExit(edge: Edge): void {
    const s = this.current;
    if (s.kind !== 'exits') return;
    if (s.chosen.some((c) => sameEdge(c, edge))) {
      this.set({ ...s, chosen: s.chosen.filter((c) => !sameEdge(c, edge)), dropped: 0, error: null });
      return;
    }
    if (!this.allowedExits.some((e) => sameEdge(e, edge))) return;
    this.set({ ...s, chosen: [...s.chosen, { x: edge.x, y: edge.y, side: edge.side }], dropped: 0, error: null });
  }

  /** Fills the remaining exits clockwise, starting at the wall chosen by the D6. */
  placeExitsForMe(firstWallD6: number | 'roll'): void {
    const s = this.current;
    if (s.kind !== 'exits' || !this.withRoom) return;
    const d6 = firstWallD6 === 'roll' ? rollD6(this.rng) : firstWallD6;
    if (!Number.isInteger(d6) || d6 < 1 || d6 > 6) return;
    const remaining = s.count - s.chosen.length;
    if (remaining <= 0) return;
    // Treat chosen exits as doors so their walls count as used.
    const withChosen = s.chosen.reduce(
      (m, e) => addDoor(makeDoor(() => `chosen-${e.x}-${e.y}-${e.side}`, e, s.exitType)).apply(m),
      this.withRoom,
    );
    const { exits, dropped } = placeExitsClockwise(withChosen, s.draft.room.id, remaining, firstWallIndex(d6));
    this.set({ ...s, chosen: [...s.chosen, ...exits], dropped, error: null });
  }

  /** Done placing exits: rooms go to the label step; corridors (never labelled) commit now. */
  doneExits(): ExecResult | null {
    const s = this.current;
    if (s.kind !== 'exits') return null;
    const short = this.refuseShortfall();
    if (short) return short;
    if (s.draft.kindOf === 'corridor') return this.finish(null);
    const dropped = s.count - s.chosen.length;
    this.set({ kind: 'label', draft: s.draft, chosen: s.chosen, exitType: s.exitType, dropped });
    return null;
  }

  // ---- step 6 + commit ----

  /** Commits the whole room (and the token's walk) as ONE History command. Valid at `exits` or `label`. */
  finish(label: RoomLabel | null): ExecResult {
    const s = this.current;
    if (s.kind !== 'exits' && s.kind !== 'label') return { ok: false, reason: 'There is no room to finish' };
    const short = this.refuseShortfall();
    if (short) return short;
    const { draft, chosen, exitType } = s;
    const map = this.history.map;
    let result: { command: Command; path: Cell[] | null };
    if (draft.source.kind === 'entrance') {
      const roomLabel = label
        ? { ...label, type: label.type.trim() === '' ? 'Entrance Room' : label.type }
        : undefined;
      result = createEntranceAndRoom(map, dungeonSystem, draft.source.cell, rectOf(draft.room), chosen, this.replayIds(), {
        sizeClass: draft.sizeClass ?? 'small',
        ...(roomLabel ? { label: roomLabel } : {}),
      });
    } else {
      const room = draft.kindOf === 'room' && label ? { ...draft.room, label: { ...label } } : draft.room;
      result = createRoomAndWalk(map, { room, exits: chosen, exitType }, this.newId);
    }
    return this.commit(result.command, result.path);
  }

  // ---- fill a gap with a corridor ----

  startGap(doorId: string): void {
    if (this.current.kind !== 'idle') return;
    const door = this.openExit(doorId);
    if (!door) return;
    const map = this.history.map;
    this.set({
      kind: 'gap',
      door,
      length: 1,
      rect: gapCorridorRect(map, door, 1),
      attempt: gapCorridorGhost(map, door, 1),
      maxLength: maxGapLength(map, door),
    });
  }

  /** Ignored past maxLength, where the boundary would clip the corridor and it would not grow. */
  setGapLength(n: number): void {
    const s = this.current;
    if (s.kind !== 'gap' || !Number.isInteger(n) || n < 1 || n > s.maxLength) return;
    const map = this.history.map;
    this.set({ ...s, length: n, rect: gapCorridorRect(map, s.door, n), attempt: gapCorridorGhost(map, s.door, n) });
  }

  placeGap(): ExecResult {
    const s = this.current;
    if (s.kind !== 'gap') return { ok: false, reason: 'There is no corridor to place' };
    const cmd = createGapCorridor(this.history.map, s.door, s.length, this.newId);
    if (!cmd) return { ok: false, reason: 'The corridor does not fit there' };
    return this.commit(cmd, null);
  }

  cancel(): void {
    this.reset(null);
  }

  // ---- internals ----

  private commit(cmd: Command, path: Cell[] | null): ExecResult {
    this.committing = true;
    let res: ExecResult;
    try {
      res = this.history.execute(cmd);
    } finally {
      this.committing = false;
    }
    if (res.ok) {
      this.walk = path;
      this.reset(null);
    }
    return res;
  }

  /**
   * At the exits step, exits may be left out only when no valid wall remains (they are
   * dropped). Otherwise sets "Place N more exit(s)" on the step and returns the refusal.
   */
  private refuseShortfall(): ExecResult | null {
    const s = this.current;
    if (s.kind !== 'exits') return null;
    const missing = s.count - s.chosen.length;
    if (missing <= 0 || this.allowedExits.length === 0) return null;
    const reason = `Place ${missing} more exit${missing === 1 ? '' : 's'}`;
    this.set({ ...s, error: reason });
    return { ok: false, reason };
  }

  private openExit(doorId: string): Door | null {
    const map = this.history.map;
    const door = map.doors.find((d) => d.id === doorId);
    if (!door || !isOpenExit(map, door)) {
      this.idleError('That is not an open exit');
      return null;
    }
    return door;
  }

  private recordingIds(): IdFn {
    return () => {
      const id = this.newId();
      this.recorded.push(id);
      return id;
    };
  }

  private replayIds(): IdFn {
    let i = 0;
    return () => this.recorded[i++] ?? this.newId();
  }

  private idleError(error: string): void {
    this.set({ kind: 'idle', error });
  }

  private reset(error: string | null): void {
    this.base = this.history.map;
    this.withRoom = null;
    this.door = null;
    this.recorded = [];
    if (this.current.kind === 'idle' && this.current.error === error) return;
    this.set(error === null ? IDLE : { kind: 'idle', error });
  }

  private set(s: Step): void {
    this.current = s;
    for (const fn of [...this.listeners]) {
      try {
        fn(s);
      } catch (err) {
        console.error('PlayFlow listener failed', err);
      }
    }
  }
}

function rectOf(r: Rect): Rect {
  return { x: r.x, y: r.y, w: r.w, h: r.h };
}
