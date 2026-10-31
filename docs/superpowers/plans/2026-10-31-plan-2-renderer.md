# Plan 2: Core Updates, Renderer and Classic Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the user's design decisions to the core (entry doors, rooms removed only through a saveable undo history), then build the canvas renderer and Classic theme. The result is a working viewer that draws a demo dungeon in the inked, hatched style and animates the token.

**Architecture:**
- **Core changes (Tasks 1–3):** split `rules.ts` into `placement.ts` and `invariants.ts`, add `Room.entryDoorId`, and make `History` snapshot-based with export and restore. `deleteRoom` is removed.
- **Renderer (Tasks 5–12):** pure, unit-tested geometry modules under `src/render/` (hatching, floor, walls, doors, labels, token, camera, rng).
- **Drawing (Tasks 13–14):** drawing functions, the Classic theme (in `src/systems/dungeon/`) and a `MapRenderer` with a zoom-bucketed offscreen cache. These are checked visually.
- **App (Tasks 4 and 15):** a Vite + Svelte 5 app that shows a demo map.

**Tech Stack:** TypeScript 5.7, Vitest 2.1, Vite 6.0.7, Svelte 5.16 (runes), svelte-check 4.1, Playwright 1.48 (screenshots), Canvas 2D.

**Spec:** `docs/superpowers/specs/2026-10-31-map-editor-core-design.md`
**Follow-ups this plan resolves:** `docs/superpowers/plans/2026-10-31-plan-1-followups.md`, covering the "Decided with the user" section and the Plan 2 items.

**This is Plan 2 of 4.** Plan 3 is Interaction and UI (play flow, edit tools, touch). Plan 4 is persistence (including saving undo history), PNG export, PWA and e2e tests.

**Not in this plan (deliberately):**
- Dirty-region re-rendering. The whole static cache rebuilds on change, which is fast at these map sizes. Revisit only if profiling shows a need.
- Making missing results consistently null or undefined across modules. That's cosmetic.
- Any interactive editing.

---

## Conventions

- Grid units everywhere in `src/render/`: 1 unit = 1 square, with x right and y down. The context transform maps units to pixels.
- Pure modules (`rng`, `camera`, `hatching`, `floor`, `walls`, `doors`, `labels`, `token`) are unit-tested. Drawing code (`draw.ts`, `classic.ts`, `renderer.ts`, `App.svelte`) is verified with a screenshot.
- `src/core/` must never import from `src/render/`, `src/app/` or `src/systems/`, nor use DOM or Svelte.
- Tasks 1–3 give the **full content** of each file they change. Replace the file with it.
- Commit after every task.

## File structure

| File | Responsibility |
|------|----------------|
| `src/core/placement.ts` | Ghost rect, placement evaluation, valid exits, entrance squares (from `rules.ts`) |
| `src/core/invariants.ts` | `checkInvariants`, `describeRoom` (from `rules.ts`), plus the entry-door invariant |
| `src/core/query.ts` | + `exitDirection`, `exitTarget` |
| `src/core/history.ts` | Snapshot timeline, `exportState`/`fromState`, `undoLabel`/`redoLabel` |
| `src/render/rng.ts` | Seeded PRNG and per-square seeds |
| `src/render/camera.ts` | World↔screen, fit, zoom-at-pointer, pan |
| `src/render/hatching.ts` | Rock hatch strokes |
| `src/render/floor.ts` | Floor shades and decals |
| `src/render/walls.ts` | Merged wall segments and shadow strips |
| `src/render/doors.ts` | Door glyph placement and open-exit stubs |
| `src/render/labels.ts` | Label text and placement |
| `src/render/token.ts` | Path interpolation and footprints |
| `src/render/theme.ts` | `Theme` and `DoorSymbol` types |
| `src/render/draw.ts` | Canvas drawing for each layer |
| `src/render/renderer.ts` | `renderStatic`, `MapRenderer` (cache, animation loop) |
| `src/systems/dungeon/classic.ts` | Classic theme and the 7 door symbols |
| `src/app/demo.ts` | Demo dungeon built with play-flow commands |
| `src/App.svelte`, `src/main.ts`, `index.html` | The viewer |
| `scripts/screenshot.mjs` | Headless screenshot for visual checks |

---

### Task 1: Split `rules.ts` into `placement.ts` and `invariants.ts`

**Files:**
- Create: `src/core/placement.ts`
- Create: `src/core/invariants.ts`
- Create: `tests/core/placement.test.ts`
- Create: `tests/core/invariants.test.ts`
- Modify: `src/core/query.ts`
- Modify: `src/core/history.ts`
- Modify: `src/core/playflow.ts`
- Modify: `src/core/serialize.ts`
- Modify: `tests/core/commands.test.ts`
- Modify: `tests/core/playflow.test.ts`
- Delete: `src/core/rules.ts`
- Delete: `tests/core/rules.test.ts`

This is a pure refactor with no behaviour change. `rules.ts` had turned into a grab bag, so it is split three ways:
- `exitDirection` and `exitTarget` move to `query.ts`, since the renderer needs them.
- `describeRoom` and `checkInvariants` move to `invariants.ts`.
- Placement (ghost rect, evaluation, valid exits, entrance squares) moves to `placement.ts`.

The tests move with their code. The existing suite is the safety net: it must pass unchanged in count.

- [ ] **Step 1: Write `src/core/query.ts`** (full new content)

```ts
import { edgeCells, edgeKey, perimeterEdges, rectContains, sameEdge } from './geometry';
import type { Cell, Direction, Door, DungeonMap, Edge, Room } from './types';

export function roomAt(map: DungeonMap, c: Cell): Room | undefined {
  return map.rooms.find((r) => rectContains(r, c));
}

export function doorAt(map: DungeonMap, e: Edge): Door | undefined {
  return map.doors.find((d) => sameEdge(d, e));
}

/** Rooms on either side of an edge: [north-or-west, south-or-east]. */
export function roomsAcross(map: DungeonMap, e: Edge): [Room | undefined, Room | undefined] {
  const [a, b] = edgeCells(e);
  return [roomAt(map, a), roomAt(map, b)];
}

/** A door with a room on exactly one side: an unexplored exit. */
export function isOpenExit(map: DungeonMap, d: Door): boolean {
  const [a, b] = roomsAcross(map, d);
  return (a === undefined) !== (b === undefined);
}

export function openExits(map: DungeonMap): Door[] {
  return map.doors.filter((d) => isOpenExit(map, d));
}

/** Wall edges, derived from rooms and doors. Each edge appears once. */
export function deriveWalls(map: DungeonMap): Edge[] {
  const seen = new Set<string>();
  const walls: Edge[] = [];
  for (const room of map.rooms) {
    for (const { edge } of perimeterEdges(room)) {
      const key = edgeKey(edge);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!doorAt(map, edge)) walls.push(edge);
    }
  }
  return walls;
}

export function nextRoomNumber(map: DungeonMap): number {
  return map.rooms.reduce((max, r) => (r.kind === 'room' ? Math.max(max, r.number) : max), 0) + 1;
}

/** Direction pointing out of an open exit, away from the room it belongs to. */
export function exitDirection(map: DungeonMap, door: Door): Direction | null {
  const [a, b] = roomsAcross(map, door);
  if (a && !b) return door.side === 'N' ? 'S' : 'E';
  if (!a && b) return door.side === 'N' ? 'N' : 'W';
  return null;
}

/** The empty square just beyond an open exit. */
export function exitTarget(map: DungeonMap, door: Door): Cell | null {
  const dir = exitDirection(map, door);
  if (!dir) return null;
  const [a, b] = edgeCells(door);
  return dir === 'S' || dir === 'E' ? b : a;
}
```

- [ ] **Step 2: Write `src/core/invariants.ts`** (full new content)

```ts
import { clipRect, edgeKey, isBoundaryEdge, rectsOverlap } from './geometry';
import { roomAt, roomsAcross } from './query';
import type { DungeonMap, Room } from './types';

export function describeRoom(r: Room): string {
  if (r.kind === 'room') return `Room ${r.number}`;
  return r.kind === 'passage' ? 'a passage' : 'the entrance';
}

/** Returns a description of the first broken invariant, or null if the map is valid. */
export function checkInvariants(map: DungeonMap): string | null {
  const ids = new Set<string>();
  for (const item of [...map.rooms, ...map.doors, ...map.features]) {
    if (ids.has(item.id)) return `Duplicate id ${item.id}`;
    ids.add(item.id);
  }
  for (const r of map.rooms) {
    if (r.w < 1 || r.h < 1) return `${describeRoom(r)} has no area`;
    if (r.kind === 'entrance') {
      const xIn = r.x >= 0 && r.x < map.width;
      const yIn = r.y >= 0 && r.y < map.height;
      const xOut = r.x === -1 || r.x === map.width;
      const yOut = r.y === -1 || r.y === map.height;
      const besideBoundary = (xOut && yIn) || (yOut && xIn);
      if (r.w !== 1 || r.h !== 1 || !besideBoundary) {
        return 'The entrance must be one square outside the boundary';
      }
    } else {
      const c = clipRect(r, map.width, map.height);
      if (!c || c.w !== r.w || c.h !== r.h) return `${describeRoom(r)} crosses the Outer Boundary`;
    }
  }
  for (let i = 0; i < map.rooms.length; i++) {
    for (let j = i + 1; j < map.rooms.length; j++) {
      const a = map.rooms[i]!;
      const b = map.rooms[j]!;
      if (rectsOverlap(a, b)) return `${describeRoom(a)} overlaps ${describeRoom(b)}`;
    }
  }
  if (map.rooms.filter((r) => r.kind === 'entrance').length > 1) return 'A map can have only one entrance';
  const edgeKeys = new Set<string>();
  for (const d of map.doors) {
    const key = edgeKey(d);
    if (edgeKeys.has(key)) return 'Two doors share one edge';
    edgeKeys.add(key);
    const [a, b] = roomsAcross(map, d);
    if (!a && !b) return 'A door is not attached to any room';
    if (a && b && a.id === b.id) return 'A door is inside a room';
    if ((a?.kind === 'entrance' || b?.kind === 'entrance') && !isBoundaryEdge(d, map.width, map.height)) {
      return 'Doors on the entrance must lead into the map';
    }
    if (isBoundaryEdge(d, map.width, map.height) && a?.kind !== 'entrance' && b?.kind !== 'entrance') {
      return 'Exits cannot be placed on the Outer Boundary';
    }
  }
  for (const f of map.features) {
    if (!roomAt(map, f)) return 'A feature is not on a floor square';
  }
  if (map.token && !roomAt(map, map.token)) return 'The token is not on a floor square';
  return null;
}
```

- [ ] **Step 3: Write `src/core/placement.ts`** (full new content)

```ts
import { clipRect, inBounds, isBoundaryEdge, perimeterEdges, rectContains, rectsOverlap, step } from './geometry';
import { describeRoom } from './invariants';
import { doorAt, exitDirection, exitTarget, roomAt } from './query';
import type { Cell, Direction, Door, DungeonMap, Edge, Rect, Room } from './types';

/** Number of slide positions for a w×h room against an exit. */
export function slideRange(map: DungeonMap, door: Door, w: number, h: number): number {
  const dir = exitDirection(map, door);
  if (!dir) return 0;
  return dir === 'N' || dir === 'S' ? w : h;
}

/**
 * Unclipped rect for a w×h room beyond an open exit. `offset` slides the room along the
 * exit's wall: 0 puts the exit at the room's left (or top) end.
 */
export function ghostRect(map: DungeonMap, door: Door, w: number, h: number, offset: number): Rect | null {
  const dir = exitDirection(map, door);
  const t = exitTarget(map, door);
  if (!dir || !t) return null;
  const max = (dir === 'N' || dir === 'S' ? w : h) - 1;
  const o = Math.max(0, Math.min(offset, max));
  switch (dir) {
    case 'N':
      return { x: t.x - o, y: t.y - h + 1, w, h };
    case 'S':
      return { x: t.x - o, y: t.y, w, h };
    case 'W':
      return { x: t.x - w + 1, y: t.y - o, w, h };
    case 'E':
      return { x: t.x, y: t.y - o, w, h };
  }
}

export interface PlacementResult {
  ok: boolean;
  /** The rect after clipping at the Outer Boundary (null if nothing remains). */
  rect: Rect | null;
  rolled: { w: number; h: number };
  clipped: boolean;
  reason?: string;
}

export function firstOverlap(map: DungeonMap, rect: Rect, ignoreId?: string): Room | undefined {
  return map.rooms.find((r) => r.id !== ignoreId && rectsOverlap(r, rect));
}

export function evaluatePlacement(
  map: DungeonMap,
  door: Door,
  w: number,
  h: number,
  offset: number,
): PlacementResult {
  const rolled = { w, h };
  const raw = ghostRect(map, door, w, h, offset);
  const target = exitTarget(map, door);
  if (!raw || !target) {
    return { ok: false, rect: null, rolled, clipped: false, reason: 'That door is not an open exit' };
  }
  const rect = clipRect(raw, map.width, map.height);
  if (!rect || !rectContains(rect, target)) {
    return {
      ok: false,
      rect,
      rolled,
      clipped: rect !== null && (rect.w !== w || rect.h !== h),
      reason: 'The room must connect to the exit',
    };
  }
  const clipped = rect.w !== w || rect.h !== h;
  const hit = firstOverlap(map, rect);
  if (hit) {
    return { ok: false, rect, rolled, clipped, reason: `Overlaps ${describeRoom(hit)}` };
  }
  return { ok: true, rect, rolled, clipped };
}

/**
 * Wall edges of a room where an exit may be placed: not on the Outer Boundary and not
 * already a door. With passages on, the square beyond must also be empty.
 */
export function validExitEdges(map: DungeonMap, roomId: string, passages: boolean): Edge[] {
  const room = map.rooms.find((r) => r.id === roomId);
  if (!room) return [];
  return perimeterEdges(room)
    .filter(({ edge, inside, dir }) => {
      if (isBoundaryEdge(edge, map.width, map.height)) return false;
      if (doorAt(map, edge)) return false;
      const beyond = step(inside, dir);
      if (!inBounds(beyond, map.width, map.height)) return false;
      if (passages && roomAt(map, beyond)) return false;
      return true;
    })
    .map(({ edge }) => edge);
}

export function entranceInwardDirection(edge: Direction): Direction {
  return ({ N: 'S', S: 'N', E: 'W', W: 'E' } as const)[edge];
}

/** Squares just outside the Outer Boundary on the given edge where the entrance may go. */
export function entranceCells(map: DungeonMap, edge: Direction): Cell[] {
  const cells: Cell[] = [];
  if (edge === 'N' || edge === 'S') {
    const y = edge === 'N' ? -1 : map.height;
    for (let x = 0; x < map.width; x++) cells.push({ x, y });
  } else {
    const x = edge === 'W' ? -1 : map.width;
    for (let y = 0; y < map.height; y++) cells.push({ x, y });
  }
  return cells;
}
```

- [ ] **Step 4: Update imports in `src/core/history.ts`** (full new content)

```ts
import type { Command } from './commands';
import { checkInvariants } from './invariants';
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
    for (const fn of [...this.listeners]) {
      try {
        fn(this.current);
      } catch (err) {
        console.error('History listener failed', err);
      }
    }
  }
}
```

- [ ] **Step 5: Update imports in `src/core/playflow.ts`** (full new content)

```ts
import { addDoor, addRoom, compound, setToken, type Command } from './commands';
import { cellEdge, isBoundaryEdge, perimeterEdges, sameEdge, step } from './geometry';
import type { IdFn } from './ids';
import { doorAt, nextRoomNumber } from './query';
import { entranceInwardDirection } from './placement';
import type { GameSystem } from './system';
import type { Cell, Door, DungeonMap, Edge, Rect, Room, RoomLabel } from './types';

const EMPTY_LABEL: RoomLabel = { type: '', unique: false, narrative: '' };

function makeDoor(newId: IdFn, edge: Edge, type: string): Door {
  return { id: newId(), x: edge.x, y: edge.y, side: edge.side, type, secret: false, lock: null };
}

/**
 * Entrance room outside the boundary, its inward open exit, and the token on it.
 * `cell` must come from `entranceCells(map, system.entranceEdge)`; the door direction is
 * derived from `system.entranceEdge`.
 */
export function placeEntrance(map: DungeonMap, system: GameSystem, cell: Cell, newId: IdFn): Command {
  const entrance: Room = {
    id: newId(),
    number: 0,
    kind: 'entrance',
    x: cell.x,
    y: cell.y,
    w: 1,
    h: 1,
    label: { ...EMPTY_LABEL },
  };
  const inward = cellEdge(cell, entranceInwardDirection(system.entranceEdge));
  return compound('Place entrance', [
    addRoom(entrance),
    addDoor(makeDoor(newId, inward, map.defaultDoorType)),
    setToken(map.token, { x: cell.x, y: cell.y, trail: [] }),
  ]);
}

/** A new numbered room for the given (already clipped) rect, not yet added to the map. */
export function newRoom(map: DungeonMap, rect: Rect, newId: IdFn): Room {
  return { id: newId(), number: nextRoomNumber(map), kind: 'room', ...rect, label: { ...EMPTY_LABEL } };
}

export interface RoomPlan {
  room: Room;
  exits: Edge[];
  exitType: string;
  passages: boolean;
}

/**
 * The single undoable command for steps 3–6 of the play flow: the room, its exits, and
 * (optionally) a 1-square passage beyond each exit with an open exit at its far end,
 * unless that far end is the Outer Boundary (corridors may end there; exits may not) or
 * already has a door (the existing door connects the spaces).
 * Each exit must be a perimeter edge of `plan.room` (as returned by validExitEdges).
 */
export function createRoomFromExit(map: DungeonMap, plan: RoomPlan, newId: IdFn): Command {
  const cmds: Command[] = [addRoom(plan.room)];
  const perimeter = perimeterEdges(plan.room);
  for (const exit of plan.exits) {
    cmds.push(addDoor(makeDoor(newId, exit, plan.exitType)));
    if (!plan.passages) continue;
    const side = perimeter.find((p) => sameEdge(p.edge, exit));
    if (!side) continue;
    const cell = step(side.inside, side.dir);
    const passage: Room = {
      id: newId(),
      number: 0,
      kind: 'passage',
      x: cell.x,
      y: cell.y,
      w: 1,
      h: 1,
      label: { ...EMPTY_LABEL },
    };
    cmds.push(addRoom(passage));
    const far = cellEdge(cell, side.dir);
    if (!isBoundaryEdge(far, map.width, map.height) && !doorAt(map, far)) {
      cmds.push(addDoor(makeDoor(newId, far, plan.exitType)));
    }
  }
  return compound(`Add Room ${plan.room.number}`, cmds);
}
```

- [ ] **Step 6: Update imports in `src/core/serialize.ts`** (full new content)

```ts
import { CURRENT_SCHEMA_VERSION, MAX_MAP_SIZE } from './campaign';
import { checkInvariants } from './invariants';
import type { Campaign } from './types';

/** migrations[n] upgrades a raw campaign object from schema version n to n + 1. */
export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;
export const migrations: Record<number, Migration> = {};

export type ParseResult = { ok: true; campaign: Campaign } | { ok: false; error: string };

export function serializeCampaign(c: Campaign): string {
  return JSON.stringify(c, null, 2);
}

const NOT_A_MAP = "This isn't a map file.";
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

const isInt = (v: unknown): v is number => Number.isInteger(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isCell = (v: unknown): boolean => isObj(v) && isInt(v.x) && isInt(v.y);
const ROOM_KINDS = ['room', 'passage', 'entrance'];

function roomOk(r: unknown): boolean {
  if (!isObj(r) || !isStr(r.id) || !ROOM_KINDS.includes(r.kind as string)) return false;
  if (!isObj(r.label) || !isStr(r.label.type) || !isBool(r.label.unique) || !isStr(r.label.narrative)) return false;
  return ['x', 'y', 'w', 'h', 'number'].every((k) => isInt(r[k]));
}

function doorOk(d: unknown): boolean {
  if (!isObj(d) || !isStr(d.id) || !isStr(d.type) || !isCell(d) || !isBool(d.secret)) return false;
  if (d.side !== 'N' && d.side !== 'W') return false;
  return d.lock === null || (isObj(d.lock) && isBool(d.lock.locked) && isStr(d.lock.note));
}

function featureOk(f: unknown): boolean {
  if (!isObj(f) || !isStr(f.id) || !isCell(f)) return false;
  if (f.kind === 'note') return isStr(f.text);
  if (f.kind !== 'stairs') return false;
  return (f.dir === 'up' || f.dir === 'down') && (f.linkedMapId === undefined || isStr(f.linkedMapId));
}

function tokenOk(t: unknown): boolean {
  return t === null || (isObj(t) && isCell(t) && Array.isArray(t.trail) && t.trail.every(isCell));
}

function shapeProblem(raw: Record<string, unknown>): string | null {
  for (const k of ['id', 'name', 'systemId', 'activeMapId']) if (!isStr(raw[k])) return `missing ${k}`;
  if (!Array.isArray(raw.maps) || raw.maps.length === 0) return 'no maps';
  const seenIds = new Set<string>();
  for (const m of raw.maps) {
    if (!isObj(m)) return 'a map is not an object';
    for (const k of ['id', 'title', 'hero', 'level', 'themeId', 'defaultDoorType']) {
      if (!isStr(m[k])) return `map missing ${k}`;
    }
    if (!isNum(m.seed)) return 'map missing seed';
    for (const k of ['width', 'height']) {
      if (!isNum(m[k])) return `map missing ${k}`;
      if (!isInt(m[k]) || (m[k] as number) < 1 || (m[k] as number) > MAX_MAP_SIZE) return 'a map has an invalid size';
    }
    for (const k of ['rooms', 'doors', 'features']) if (!Array.isArray(m[k])) return `map missing ${k}`;
    if (!(m.rooms as unknown[]).every(roomOk)) return 'a room is malformed';
    if (!(m.doors as unknown[]).every(doorOk)) return 'a door is malformed';
    if (!(m.features as unknown[]).every(featureOk)) return 'a feature is malformed';
    if (!tokenOk(m.token)) return 'the token is malformed';
    if (seenIds.has(m.id as string)) return 'two maps share an id';
    seenIds.add(m.id as string);
  }
  if (!seenIds.has(raw.activeMapId as string)) return 'active map not found';
  return null;
}

export function parseCampaign(
  text: string,
  migs: Record<number, Migration> = migrations,
  current: number = CURRENT_SCHEMA_VERSION,
): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: `${NOT_A_MAP} (It is not valid JSON.)` };
  }
  if (!isObj(raw) || !isNum(raw.schemaVersion)) return { ok: false, error: NOT_A_MAP };
  if (raw.schemaVersion > current) {
    return { ok: false, error: 'This file was made by a newer version of the app. Please update and try again.' };
  }
  let obj: Record<string, unknown> = raw;
  for (let v = raw.schemaVersion; v < current; v++) {
    const cannotUpgrade = { ok: false, error: `Cannot upgrade this file from version ${v}.` } as const;
    const migrate = migs[v];
    if (!migrate) return cannotUpgrade;
    try {
      const next: unknown = migrate(obj);
      if (!isObj(next)) return cannotUpgrade;
      obj = { ...next, schemaVersion: v + 1 };
    } catch {
      return cannotUpgrade;
    }
  }
  const problem = shapeProblem(obj);
  if (problem) return { ok: false, error: `The map file is damaged: ${problem}.` };
  const campaign = obj as unknown as Campaign;
  for (const map of campaign.maps) {
    const broken = checkInvariants(map);
    if (broken) return { ok: false, error: `The map file is damaged: ${broken}.` };
  }
  return { ok: true, campaign };
}
```

- [ ] **Step 7: Write `tests/core/placement.test.ts`** (full content)

```ts
import { entranceCells, evaluatePlacement, ghostRect, slideRange, validExitEdges } from '../../src/core/placement';
import { exitDirection, exitTarget } from '../../src/core/query';
import { door, emptyMap, room, withContent } from './fixtures';

// A 3x2 room at (4,4) with an open exit on its top wall at x=5 (edge (5,4,N)).
function mapWithTopExit() {
  return withContent(emptyMap(10, 10), [room('a', 4, 4, 3, 2, 'room', 1)], [door('d', 5, 4, 'N')]);
}

describe('exit direction and target', () => {
  it('points away from the owning room', () => {
    const m = mapWithTopExit();
    expect(exitDirection(m, m.doors[0]!)).toBe('N');
    expect(exitTarget(m, m.doors[0]!)).toEqual({ x: 5, y: 3 });
  });
  it('works for an east-facing exit', () => {
    const m = withContent(emptyMap(), [room('a', 2, 2, 2, 2)], [door('d', 4, 3, 'W')]);
    expect(exitDirection(m, m.doors[0]!)).toBe('E');
    expect(exitTarget(m, m.doors[0]!)).toEqual({ x: 4, y: 3 });
  });
  it('is null for a door between two rooms', () => {
    const m = withContent(emptyMap(), [room('a', 2, 2, 2, 2), room('b', 4, 2, 2, 2)], [door('d', 4, 3, 'W')]);
    expect(exitDirection(m, m.doors[0]!)).toBeNull();
  });
});

describe('ghostRect', () => {
  it('places a north room so its bottom row touches the exit', () => {
    const m = mapWithTopExit();
    expect(ghostRect(m, m.doors[0]!, 4, 3, 0)).toEqual({ x: 5, y: 1, w: 4, h: 3 });
    expect(ghostRect(m, m.doors[0]!, 4, 3, 3)).toEqual({ x: 2, y: 1, w: 4, h: 3 });
  });
  describe('other directions', () => {
    const base = (d: ReturnType<typeof door>) => withContent(emptyMap(10, 10), [room('a', 4, 4, 2, 2)], [d]);
    it('S', () => {
      const m = base(door('d', 4, 6, 'N'));
      expect(ghostRect(m, m.doors[0]!, 3, 2, 0)).toEqual({ x: 4, y: 6, w: 3, h: 2 });
    });
    it('W', () => {
      const m = base(door('d', 4, 4, 'W'));
      expect(ghostRect(m, m.doors[0]!, 3, 2, 0)).toEqual({ x: 1, y: 4, w: 3, h: 2 });
      expect(ghostRect(m, m.doors[0]!, 3, 2, 1)).toEqual({ x: 1, y: 3, w: 3, h: 2 });
    });
    it('E', () => {
      const m = base(door('d', 6, 5, 'W'));
      expect(ghostRect(m, m.doors[0]!, 3, 2, 0)).toEqual({ x: 6, y: 5, w: 3, h: 2 });
    });
  });
  it('clamps the slide offset', () => {
    const m = mapWithTopExit();
    expect(ghostRect(m, m.doors[0]!, 4, 3, 99)).toEqual({ x: 2, y: 1, w: 4, h: 3 });
  });
});

describe('slideRange', () => {
  it('is 0 when the door is not an open exit', () => {
    const m = withContent(emptyMap(), [], [door('d', 3, 3, 'N')]);
    expect(slideRange(m, m.doors[0]!, 3, 2)).toBe(0);
  });
});

describe('evaluatePlacement', () => {
  it('reports clipped false when the exit target is outside the boundary', () => {
    const m = withContent(emptyMap(10, 10), [room('a', 2, 9, 1, 1)], [door('d', 2, 10, 'N')]);
    const r = evaluatePlacement(m, m.doors[0]!, 3, 2, 0);
    expect(r).toMatchObject({ ok: false, rect: null, clipped: false, reason: 'The room must connect to the exit' });
  });
  it('accepts a room that fits', () => {
    const m = mapWithTopExit();
    const r = evaluatePlacement(m, m.doors[0]!, 2, 2, 0);
    expect(r).toMatchObject({ ok: true, rect: { x: 5, y: 2, w: 2, h: 2 }, clipped: false });
  });
  it('clips at the Outer Boundary and reports it', () => {
    const m = mapWithTopExit();
    // 6 tall from y=3 upward would reach y=-2; clipped to y=0..3 (h=4).
    const r = evaluatePlacement(m, m.doors[0]!, 2, 6, 0);
    expect(r).toMatchObject({ ok: true, rect: { x: 5, y: 0, w: 2, h: 4 }, clipped: true, rolled: { w: 2, h: 6 } });
  });
  it('rejects overlap and names the room', () => {
    const m = withContent(
      emptyMap(),
      [room('a', 4, 4, 3, 2, 'room', 1), room('b', 6, 1, 2, 2, 'room', 2)],
      [door('d', 5, 4, 'N')],
    );
    const r = evaluatePlacement(m, m.doors[0]!, 3, 2, 0);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('Overlaps Room 2');
  });
  it('allows butting up against another room', () => {
    const m = withContent(
      emptyMap(),
      [room('a', 4, 4, 3, 2, 'room', 1), room('b', 7, 1, 2, 2, 'room', 2)],
      [door('d', 5, 4, 'N')],
    );
    expect(evaluatePlacement(m, m.doors[0]!, 2, 2, 0).ok).toBe(true);
  });
});

describe('validExitEdges', () => {
  it('excludes Outer Boundary edges and existing doors', () => {
    // 2x1 room in the top-left corner: top and left edges are boundary.
    const m = withContent(emptyMap(5, 5), [room('a', 0, 0, 2, 1)], [door('d', 0, 1, 'N')]);
    const edges = validExitEdges(m, 'a', false);
    // Perimeter: 2 top (boundary), 2 bottom (one is a door), 1 left (boundary), 1 right.
    expect(edges).toEqual(expect.arrayContaining([{ x: 1, y: 1, side: 'N' }, { x: 2, y: 0, side: 'W' }]));
    expect(edges).toHaveLength(2);
  });
  it('allows an exit into a neighbouring room without passages but not with them', () => {
    const m = withContent(emptyMap(), [room('a', 2, 2, 1, 1), room('b', 3, 2, 1, 1)]);
    const shared = { x: 3, y: 2, side: 'W' };
    expect(validExitEdges(m, 'a', false)).toContainEqual(shared);
    expect(validExitEdges(m, 'a', true)).not.toContainEqual(shared);
  });
});

describe('entranceCells', () => {
  it('lists squares just below the bottom boundary', () => {
    const cells = entranceCells(emptyMap(3, 4), 'S');
    expect(cells).toEqual([
      { x: 0, y: 4 },
      { x: 1, y: 4 },
      { x: 2, y: 4 },
    ]);
  });
});
```

- [ ] **Step 8: Write `tests/core/invariants.test.ts`** (full content)

```ts
import { checkInvariants } from '../../src/core/invariants';
import { door, emptyMap, room, withContent } from './fixtures';

// A 3x2 room at (4,4) with an open exit on its top wall at x=5 (edge (5,4,N)).
function mapWithTopExit() {
  return withContent(emptyMap(10, 10), [room('a', 4, 4, 3, 2, 'room', 1)], [door('d', 5, 4, 'N')]);
}

describe('checkInvariants', () => {
  it('accepts a valid map', () => {
    expect(checkInvariants(mapWithTopExit())).toBeNull();
  });
  it('rejects overlapping rooms', () => {
    const m = withContent(emptyMap(), [room('a', 1, 1, 3, 3), room('b', 2, 2, 3, 3)]);
    expect(checkInvariants(m)).toMatch(/overlaps/);
  });
  it('rejects a room crossing the boundary', () => {
    const m = withContent(emptyMap(5, 5), [room('a', 3, 3, 3, 1)]);
    expect(checkInvariants(m)).toMatch(/Outer Boundary/);
  });
  it('rejects a door on the boundary unless it belongs to the entrance', () => {
    const bad = withContent(emptyMap(5, 5), [room('a', 2, 4, 1, 1)], [door('d', 2, 5, 'N')]);
    expect(checkInvariants(bad)).toMatch(/Outer Boundary/);
    const ok = withContent(
      emptyMap(5, 5),
      [room('a', 2, 4, 1, 1), room('e', 2, 5, 1, 1, 'entrance')],
      [door('d', 2, 5, 'N')],
    );
    expect(checkInvariants(ok)).toBeNull();
  });
  it('rejects an entrance that is not beside the boundary', () => {
    const m = withContent(emptyMap(5, 5), [room('e', 2, 6, 1, 1, 'entrance')]);
    expect(checkInvariants(m)).toMatch(/entrance/);
  });
  it('rejects a door attached to nothing', () => {
    const m = withContent(emptyMap(), [], [door('d', 3, 3, 'N')]);
    expect(checkInvariants(m)).toMatch(/not attached/);
  });
  it('rejects a door whose two sides are the same room', () => {
    const m = withContent(emptyMap(), [room('a', 4, 2, 3, 4)], [door('d', 5, 4, 'N')]);
    expect(checkInvariants(m)).toBe('A door is inside a room');
  });
  it('rejects a door on the entrance that is not on the boundary', () => {
    const m = withContent(emptyMap(10, 10), [room('e', 2, 10, 1, 1, 'entrance')], [door('d', 2, 10, 'W')]);
    expect(checkInvariants(m)).toBe('Doors on the entrance must lead into the map');
  });
  it('accepts the entrance inward door', () => {
    const m = withContent(
      emptyMap(10, 10),
      [room('e', 2, 10, 1, 1, 'entrance'), room('a', 2, 9, 1, 1)],
      [door('d', 2, 10, 'N')],
    );
    expect(checkInvariants(m)).toBeNull();
  });
  it('rejects two doors on one edge', () => {
    const m = withContent(emptyMap(), [room('a', 2, 2, 2, 2)], [door('d1', 2, 2, 'N'), door('d2', 2, 2, 'N')]);
    expect(checkInvariants(m)).toBe('Two doors share one edge');
  });
  it('rejects more than one entrance', () => {
    const m = withContent(emptyMap(10, 10), [
      room('e1', 2, 10, 1, 1, 'entrance'),
      room('e2', 4, 10, 1, 1, 'entrance'),
    ]);
    expect(checkInvariants(m)).toBe('A map can have only one entrance');
  });
});
```

- [ ] **Step 9: Write `tests/core/commands.test.ts`** (full content)

```ts
import { checkInvariants } from '../../src/core/invariants';
import {
  addDoor,
  addFeature,
  addRoom,
  compound,
  deleteRoom,
  removeDoor,
  removeRoom,
  setToken,
  updateDoor,
  updateRoom,
} from '../../src/core/commands';
import type { Command } from '../../src/core/commands';
import type { DungeonMap } from '../../src/core/types';
import { door, emptyMap, room, withContent } from './fixtures';

function roundTrip(map: DungeonMap, cmd: Command) {
  const after = cmd.apply(map);
  expect(cmd.undo(after)).toEqual(map);
  return after;
}

describe('item commands round-trip', () => {
  const base = withContent(emptyMap(), [room('a', 1, 1, 2, 2), room('b', 4, 1, 2, 2)], [door('d', 3, 1, 'W')]);

  it('addRoom', () => {
    const after = roundTrip(base, addRoom(room('c', 7, 7, 1, 1)));
    expect(after.rooms.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('removeRoom restores the original position', () => {
    const after = roundTrip(base, removeRoom(base.rooms[0]!));
    expect(after.rooms.map((r) => r.id)).toEqual(['b']);
  });
  it('updateRoom', () => {
    const after = roundTrip(base, updateRoom(base.rooms[0]!, { ...base.rooms[0]!, w: 1 }));
    expect(after.rooms[0]!.w).toBe(1);
  });
  it('addDoor / removeDoor / updateDoor', () => {
    roundTrip(base, addDoor(door('e', 1, 1, 'N')));
    roundTrip(base, removeDoor(base.doors[0]!));
    const after = roundTrip(base, updateDoor(base.doors[0]!, { ...base.doors[0]!, type: 'wooden' }));
    expect(after.doors[0]!.type).toBe('wooden');
  });
  it('setToken', () => {
    const after = roundTrip(base, setToken(null, { x: 1, y: 1, trail: [] }));
    expect(after.token).toEqual({ x: 1, y: 1, trail: [] });
  });
});

describe('removeItem undo guard and redo', () => {
  it('does not duplicate when undo runs on a map that already has the item', () => {
    const cmd = removeRoom(room('zz', 1, 1, 1, 1));
    cmd.apply(emptyMap());
    const withZz = withContent(emptyMap(), [room('zz', 1, 1, 1, 1)]);
    expect(cmd.undo(withZz).rooms.filter((r) => r.id === 'zz')).toHaveLength(1);
  });
  it('removeRoom survives apply, undo, apply', () => {
    const base = withContent(emptyMap(), [room('a', 1, 1, 2, 2), room('b', 4, 1, 2, 2)]);
    const cmd = removeRoom(base.rooms[0]!);
    const first = cmd.apply(base);
    cmd.undo(first);
    expect(cmd.apply(base)).toEqual(first);
    expect(cmd.undo(first)).toEqual(base);
  });
  it('deleteRoom survives apply, undo, apply', () => {
    const base = withContent(
      emptyMap(),
      [room('a', 1, 1, 2, 2), room('b', 3, 1, 2, 2)],
      [door('d1', 3, 1, 'W'), door('d2', 1, 1, 'N')],
    );
    const cmd = deleteRoom(base, 'a')!;
    const first = cmd.apply(base);
    cmd.undo(first);
    expect(cmd.apply(base)).toEqual(first);
    expect(cmd.undo(first)).toEqual(base);
  });
});

describe('compound', () => {
  it('applies in order and undoes in reverse', () => {
    const base = emptyMap();
    const cmd = compound('two rooms', [addRoom(room('a', 1, 1, 1, 1)), addRoom(room('b', 3, 3, 1, 1))]);
    const after = roundTrip(base, cmd);
    expect(after.rooms.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('deleteRoom', () => {
  it('removes orphaned doors, features inside, and the token', () => {
    const base: DungeonMap = {
      ...withContent(
        emptyMap(),
        [room('a', 1, 1, 2, 2), room('b', 3, 1, 2, 2)],
        // d1 joins a and b (survives); d2 is an open exit on a (orphaned when a goes).
        [door('d1', 3, 1, 'W'), door('d2', 1, 1, 'N')],
      ),
      features: [{ id: 'n', kind: 'note', x: 1, y: 1, text: 'hi' }],
      token: { x: 2, y: 2, trail: [] },
    };
    const cmd = deleteRoom(base, 'a')!;
    const after = roundTrip(base, cmd);
    expect(after.rooms.map((r) => r.id)).toEqual(['b']);
    expect(after.doors.map((d) => d.id)).toEqual(['d1']);
    expect(after.features).toEqual([]);
    expect(after.token).toBeNull();
  });
  it('returns null for an unknown room', () => {
    expect(deleteRoom(emptyMap(), 'nope')).toBeNull();
  });
});

describe('addFeature', () => {
  it('labels by kind', () => {
    expect(addFeature({ id: 's', kind: 'stairs', x: 1, y: 1, dir: 'down' }).label).toBe('Add stairs');
  });
});

describe('deleteRoom on the entrance', () => {
  it('removes the entrance and its boundary door even when a room is attached', () => {
    const base = withContent(
      emptyMap(10, 10),
      [room('e', 4, 10, 1, 1, 'entrance'), room('a', 3, 8, 3, 2, 'room', 1)],
      [door('d', 4, 10, 'N')],
    );
    const after = roundTrip(base, deleteRoom(base, 'e')!);
    expect(after.rooms.map((r) => r.id)).toEqual(['a']);
    expect(after.doors).toEqual([]);
    expect(checkInvariants(after)).toBeNull();
  });
});
```

- [ ] **Step 10: Write `tests/core/playflow.test.ts`** (full content)

```ts
import { History } from '../../src/core/history';
import { sequentialIds } from '../../src/core/ids';
import { createRoomFromExit, newRoom, placeEntrance } from '../../src/core/playflow';
import { openExits } from '../../src/core/query';
import { evaluatePlacement, validExitEdges } from '../../src/core/placement';
import { addRoom } from '../../src/core/commands';
import { dungeonSystem } from '../../src/systems/dungeon';
import { door, emptyMap, room, withContent } from './fixtures';

describe('placeEntrance', () => {
  it('adds the entrance below the map, an inward open exit, and the token', () => {
    const h = new History(emptyMap(10, 10));
    const ids = sequentialIds('e');
    expect(h.execute(placeEntrance(h.map, dungeonSystem, { x: 4, y: 10 }, ids)).ok).toBe(true);
    expect(h.map.rooms).toMatchObject([{ kind: 'entrance', x: 4, y: 10, w: 1, h: 1 }]);
    expect(h.map.doors).toMatchObject([{ x: 4, y: 10, side: 'N', type: 'archway' }]);
    expect(openExits(h.map)).toHaveLength(1);
    expect(h.map.token).toEqual({ x: 4, y: 10, trail: [] });
  });

  it.each([
    ['N', { x: 3, y: -1 }, { x: 3, y: 0, side: 'N' }],
    ['E', { x: 10, y: 3 }, { x: 10, y: 3, side: 'W' }],
    ['W', { x: -1, y: 3 }, { x: 0, y: 3, side: 'W' }],
  ] as const)('works for entrance edge %s', (edge, cell, expected) => {
    const h = new History(emptyMap(10, 10));
    const system = { ...dungeonSystem, entranceEdge: edge };
    expect(h.execute(placeEntrance(h.map, system, cell, sequentialIds('e'))).ok).toBe(true);
    expect(h.map.doors).toMatchObject([expected]);
  });
});

describe('full play-flow round', () => {
  it('entrance → room → exits with passages, as one undo step', () => {
    const h = new History(emptyMap(10, 10));
    const ids = sequentialIds('x');
    h.execute(placeEntrance(h.map, dungeonSystem, { x: 4, y: 10 }, ids));
    const exit = openExits(h.map)[0]!;
    const doorsBefore = structuredClone(h.map.doors);
    const tokenBefore = structuredClone(h.map.token);

    // Rolled red 3 × blue 2, slid so the exit is at the room's middle column.
    const placement = evaluatePlacement(h.map, exit, 3, 2, 1);
    expect(placement).toMatchObject({ ok: true, rect: { x: 3, y: 8, w: 3, h: 2 } });

    const room = newRoom(h.map, placement.rect!, ids);
    expect(room.number).toBe(1);

    // Exits are chosen against a draft map that already contains the room.
    const draft = addRoom(room).apply(h.map);
    const valid = validExitEdges(draft, room.id, true);
    const top = { x: 4, y: 8, side: 'N' as const };
    expect(valid).toContainEqual(top);

    const cmd = createRoomFromExit(
      h.map,
      { room: { ...room, label: { type: 'Guard Room', unique: false, narrative: '' } }, exits: [top], exitType: 'wooden', passages: true },
      ids,
    );
    expect(h.execute(cmd).ok).toBe(true);

    expect(h.map.rooms.map((r) => r.kind)).toEqual(['entrance', 'room', 'passage']);
    expect(h.map.rooms[2]).toMatchObject({ x: 4, y: 7, w: 1, h: 1 });
    // Entrance door now joins two rooms; the passage's far end is the only open exit.
    expect(openExits(h.map)).toMatchObject([{ x: 4, y: 7, side: 'N', type: 'wooden' }]);

    h.undo();
    expect(h.map.rooms.map((r) => r.kind)).toEqual(['entrance']);
    expect(h.map.doors).toEqual(doorsBefore);
    expect(h.map.token).toEqual(tokenBefore);
  });

  it('does not put a door at a passage end that meets the Outer Boundary', () => {
    const h = new History(emptyMap(5, 5));
    const ids = sequentialIds('y');
    h.execute(placeEntrance(h.map, dungeonSystem, { x: 2, y: 5 }, ids));
    const exit = openExits(h.map)[0]!;
    // 1 wide × 4 tall fills y=1..4; a passage north of it sits at y=0, against the boundary.
    const placement = evaluatePlacement(h.map, exit, 1, 4, 0);
    const room = newRoom(h.map, placement.rect!, ids);
    const cmd = createRoomFromExit(h.map, { room, exits: [{ x: 2, y: 1, side: 'N' }], exitType: 'archway', passages: true }, ids);
    expect(h.execute(cmd).ok).toBe(true);
    expect(h.map.rooms.find((r) => r.kind === 'passage')).toMatchObject({ x: 2, y: 0 });
    expect(openExits(h.map)).toEqual([]);
  });

  it('adds no far door when the passage end already has a door', () => {
    const map = withContent(emptyMap(10, 10), [room('B', 4, 2, 2, 2)], [door('d', 4, 4, 'N')]);
    const h = new History(map);
    const r = { ...room('R', 3, 5, 3, 2), number: 2 };
    const cmd = createRoomFromExit(h.map, { room: r, exits: [{ x: 4, y: 5, side: 'N' }], exitType: 'archway', passages: true }, sequentialIds('z'));
    expect(h.execute(cmd).ok).toBe(true);
    expect(h.map.doors.filter((d) => d.x === 4 && d.y === 4 && d.side === 'N')).toHaveLength(1);
    expect(h.map.rooms.find((x) => x.kind === 'passage')).toMatchObject({ x: 4, y: 4 });
  });

  it('creates no passage rooms when passages is off', () => {
    const h = new History(emptyMap(10, 10));
    const r = { ...room('R', 3, 5, 3, 2), number: 1 };
    const exits = [{ x: 3, y: 5, side: 'N' as const }, { x: 5, y: 5, side: 'N' as const }];
    const cmd = createRoomFromExit(h.map, { room: r, exits, exitType: 'archway', passages: false }, sequentialIds('p'));
    expect(h.execute(cmd).ok).toBe(true);
    expect(h.map.rooms.map((x) => x.kind)).toEqual(['room']);
    expect(openExits(h.map)).toHaveLength(2);
  });
});
```

- [ ] **Step 11: Delete the old files**

```bash
git rm -q src/core/rules.ts tests/core/rules.test.ts
```

- [ ] **Step 12: Verify nothing else imports `rules`, then run everything**

Run: `grep -rn "core/rules\|'./rules'" src tests || echo NONE && npm test && npm run typecheck`
Expected: `NONE`, then **133 tests pass** (same count as before), and the typecheck prints nothing.

- [ ] **Step 13: Commit**

```bash
git add src/core tests/core
git commit -m "refactor(core): split rules into placement and invariants"
```

### Task 2: Rooms remember their entry door (`entryDoorId`)

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/core/playflow.ts`
- Modify: `src/core/invariants.ts`
- Modify: `src/core/serialize.ts`
- Modify: `tests/core/fixtures.ts`
- Modify: `tests/core/invariants.test.ts`
- Modify: `tests/core/playflow.test.ts`
- Modify: `tests/core/serialize.test.ts`

This task records which door each room was entered through. Labels anchor near that door (user decision, 2026-10-31).
- `newRoom` gains an `entryDoor` parameter.
- Passages record the exit door they came through.
- A new invariant requires a room's entry door to exist and to sit on that room's wall.
- The file validator checks the field.

No v1 files exist yet, so this stays on schema version 1 with no migration.

- [ ] **Step 1: Update `tests/core/fixtures.ts`** (full content)

```ts
import { createMap } from '../../src/core/campaign';
import { sequentialIds } from '../../src/core/ids';
import { dungeonSystem } from '../../src/systems/dungeon';
import type { Door, DungeonMap, Room, RoomKind, Side } from '../../src/core/types';

export function emptyMap(width = 10, height = 10): DungeonMap {
  return createMap(dungeonSystem, { width, height, seed: 1, newId: sequentialIds('map') });
}

export function room(
  id: string,
  x: number,
  y: number,
  w: number,
  h: number,
  kind: RoomKind = 'room',
  number = 0,
): Room {
  return { id, number, kind, x, y, w, h, label: { type: '', unique: false, narrative: '' }, entryDoorId: null };
}

export function door(id: string, x: number, y: number, side: Side, type = 'archway'): Door {
  return { id, x, y, side, type, secret: false, lock: null };
}

export function withContent(map: DungeonMap, rooms: Room[], doors: Door[] = []): DungeonMap {
  return { ...map, rooms, doors };
}
```

- [ ] **Step 2: Update `tests/core/invariants.test.ts`** (full content)

```ts
import { checkInvariants } from '../../src/core/invariants';
import { door, emptyMap, room, withContent } from './fixtures';

// A 3x2 room at (4,4) with an open exit on its top wall at x=5 (edge (5,4,N)).
function mapWithTopExit() {
  return withContent(emptyMap(10, 10), [room('a', 4, 4, 3, 2, 'room', 1)], [door('d', 5, 4, 'N')]);
}

describe('checkInvariants', () => {
  it('accepts a valid map', () => {
    expect(checkInvariants(mapWithTopExit())).toBeNull();
  });
  it('rejects overlapping rooms', () => {
    const m = withContent(emptyMap(), [room('a', 1, 1, 3, 3), room('b', 2, 2, 3, 3)]);
    expect(checkInvariants(m)).toMatch(/overlaps/);
  });
  it('rejects a room crossing the boundary', () => {
    const m = withContent(emptyMap(5, 5), [room('a', 3, 3, 3, 1)]);
    expect(checkInvariants(m)).toMatch(/Outer Boundary/);
  });
  it('rejects a door on the boundary unless it belongs to the entrance', () => {
    const bad = withContent(emptyMap(5, 5), [room('a', 2, 4, 1, 1)], [door('d', 2, 5, 'N')]);
    expect(checkInvariants(bad)).toMatch(/Outer Boundary/);
    const ok = withContent(
      emptyMap(5, 5),
      [room('a', 2, 4, 1, 1), room('e', 2, 5, 1, 1, 'entrance')],
      [door('d', 2, 5, 'N')],
    );
    expect(checkInvariants(ok)).toBeNull();
  });
  it('rejects an entrance that is not beside the boundary', () => {
    const m = withContent(emptyMap(5, 5), [room('e', 2, 6, 1, 1, 'entrance')]);
    expect(checkInvariants(m)).toMatch(/entrance/);
  });
  it('rejects a door attached to nothing', () => {
    const m = withContent(emptyMap(), [], [door('d', 3, 3, 'N')]);
    expect(checkInvariants(m)).toMatch(/not attached/);
  });
  it('rejects a door whose two sides are the same room', () => {
    const m = withContent(emptyMap(), [room('a', 4, 2, 3, 4)], [door('d', 5, 4, 'N')]);
    expect(checkInvariants(m)).toBe('A door is inside a room');
  });
  it('rejects a door on the entrance that is not on the boundary', () => {
    const m = withContent(emptyMap(10, 10), [room('e', 2, 10, 1, 1, 'entrance')], [door('d', 2, 10, 'W')]);
    expect(checkInvariants(m)).toBe('Doors on the entrance must lead into the map');
  });
  it('accepts the entrance inward door', () => {
    const m = withContent(
      emptyMap(10, 10),
      [room('e', 2, 10, 1, 1, 'entrance'), room('a', 2, 9, 1, 1)],
      [door('d', 2, 10, 'N')],
    );
    expect(checkInvariants(m)).toBeNull();
  });
  it('rejects two doors on one edge', () => {
    const m = withContent(emptyMap(), [room('a', 2, 2, 2, 2)], [door('d1', 2, 2, 'N'), door('d2', 2, 2, 'N')]);
    expect(checkInvariants(m)).toBe('Two doors share one edge');
  });
  it('rejects more than one entrance', () => {
    const m = withContent(emptyMap(10, 10), [
      room('e1', 2, 10, 1, 1, 'entrance'),
      room('e2', 4, 10, 1, 1, 'entrance'),
    ]);
    expect(checkInvariants(m)).toBe('A map can have only one entrance');
  });
});

describe('entry door invariant', () => {
  it('rejects a room whose entry door is missing or not on its wall', () => {
    const missing = withContent(emptyMap(), [{ ...room('a', 2, 2, 2, 2, 'room', 1), entryDoorId: 'gone' }]);
    expect(checkInvariants(missing)).toMatch(/lost the door/);
    const elsewhere = withContent(
      emptyMap(),
      [{ ...room('a', 2, 2, 2, 2, 'room', 1), entryDoorId: 'd' }, room('b', 6, 6, 1, 1)],
      [door('d', 6, 6, 'N')],
    );
    expect(checkInvariants(elsewhere)).toMatch(/lost the door/);
  });
  it('accepts a room whose entry door is on its wall', () => {
    const ok = withContent(emptyMap(), [{ ...room('a', 2, 2, 2, 2, 'room', 1), entryDoorId: 'd' }], [door('d', 2, 4, 'N')]);
    expect(checkInvariants(ok)).toBeNull();
  });
});
```

- [ ] **Step 3: Update `tests/core/playflow.test.ts`** (full content)

```ts
import { History } from '../../src/core/history';
import { sequentialIds } from '../../src/core/ids';
import { createRoomFromExit, newRoom, placeEntrance } from '../../src/core/playflow';
import { openExits } from '../../src/core/query';
import { evaluatePlacement, validExitEdges } from '../../src/core/placement';
import { addRoom } from '../../src/core/commands';
import { dungeonSystem } from '../../src/systems/dungeon';
import { door, emptyMap, room, withContent } from './fixtures';

describe('placeEntrance', () => {
  it('adds the entrance below the map, an inward open exit, and the token', () => {
    const h = new History(emptyMap(10, 10));
    const ids = sequentialIds('e');
    expect(h.execute(placeEntrance(h.map, dungeonSystem, { x: 4, y: 10 }, ids)).ok).toBe(true);
    expect(h.map.rooms).toMatchObject([{ kind: 'entrance', x: 4, y: 10, w: 1, h: 1 }]);
    expect(h.map.doors).toMatchObject([{ x: 4, y: 10, side: 'N', type: 'archway' }]);
    expect(openExits(h.map)).toHaveLength(1);
    expect(h.map.token).toEqual({ x: 4, y: 10, trail: [] });
  });

  it.each([
    ['N', { x: 3, y: -1 }, { x: 3, y: 0, side: 'N' }],
    ['E', { x: 10, y: 3 }, { x: 10, y: 3, side: 'W' }],
    ['W', { x: -1, y: 3 }, { x: 0, y: 3, side: 'W' }],
  ] as const)('works for entrance edge %s', (edge, cell, expected) => {
    const h = new History(emptyMap(10, 10));
    const system = { ...dungeonSystem, entranceEdge: edge };
    expect(h.execute(placeEntrance(h.map, system, cell, sequentialIds('e'))).ok).toBe(true);
    expect(h.map.doors).toMatchObject([expected]);
  });
});

describe('full play-flow round', () => {
  it('entrance → room → exits with passages, as one undo step', () => {
    const h = new History(emptyMap(10, 10));
    const ids = sequentialIds('x');
    h.execute(placeEntrance(h.map, dungeonSystem, { x: 4, y: 10 }, ids));
    const exit = openExits(h.map)[0]!;
    const doorsBefore = structuredClone(h.map.doors);
    const tokenBefore = structuredClone(h.map.token);

    // Rolled red 3 × blue 2, slid so the exit is at the room's middle column.
    const placement = evaluatePlacement(h.map, exit, 3, 2, 1);
    expect(placement).toMatchObject({ ok: true, rect: { x: 3, y: 8, w: 3, h: 2 } });

    const room = newRoom(h.map, placement.rect!, exit, ids);
    expect(room.number).toBe(1);
    expect(room.entryDoorId).toBe(exit.id);

    // Exits are chosen against a draft map that already contains the room.
    const draft = addRoom(room).apply(h.map);
    const valid = validExitEdges(draft, room.id, true);
    const top = { x: 4, y: 8, side: 'N' as const };
    expect(valid).toContainEqual(top);

    const cmd = createRoomFromExit(
      h.map,
      { room: { ...room, label: { type: 'Guard Room', unique: false, narrative: '' } }, exits: [top], exitType: 'wooden', passages: true },
      ids,
    );
    expect(h.execute(cmd).ok).toBe(true);

    expect(h.map.rooms.map((r) => r.kind)).toEqual(['entrance', 'room', 'passage']);
    expect(h.map.rooms[2]).toMatchObject({ x: 4, y: 7, w: 1, h: 1 });
    // Entrance door now joins two rooms; the passage's far end is the only open exit.
    expect(openExits(h.map)).toMatchObject([{ x: 4, y: 7, side: 'N', type: 'wooden' }]);

    h.undo();
    expect(h.map.rooms.map((r) => r.kind)).toEqual(['entrance']);
    expect(h.map.doors).toEqual(doorsBefore);
    expect(h.map.token).toEqual(tokenBefore);
  });

  it('does not put a door at a passage end that meets the Outer Boundary', () => {
    const h = new History(emptyMap(5, 5));
    const ids = sequentialIds('y');
    h.execute(placeEntrance(h.map, dungeonSystem, { x: 2, y: 5 }, ids));
    const exit = openExits(h.map)[0]!;
    // 1 wide × 4 tall fills y=1..4; a passage north of it sits at y=0, against the boundary.
    const placement = evaluatePlacement(h.map, exit, 1, 4, 0);
    const room = newRoom(h.map, placement.rect!, exit, ids);
    const cmd = createRoomFromExit(h.map, { room, exits: [{ x: 2, y: 1, side: 'N' }], exitType: 'archway', passages: true }, ids);
    expect(h.execute(cmd).ok).toBe(true);
    expect(h.map.rooms.find((r) => r.kind === 'passage')).toMatchObject({ x: 2, y: 0 });
    expect(openExits(h.map)).toEqual([]);
  });

  it('adds no far door when the passage end already has a door', () => {
    const map = withContent(emptyMap(10, 10), [room('B', 4, 2, 2, 2)], [door('d', 4, 4, 'N')]);
    const h = new History(map);
    const r = { ...room('R', 3, 5, 3, 2), number: 2 };
    const cmd = createRoomFromExit(h.map, { room: r, exits: [{ x: 4, y: 5, side: 'N' }], exitType: 'archway', passages: true }, sequentialIds('z'));
    expect(h.execute(cmd).ok).toBe(true);
    expect(h.map.doors.filter((d) => d.x === 4 && d.y === 4 && d.side === 'N')).toHaveLength(1);
    expect(h.map.rooms.find((x) => x.kind === 'passage')).toMatchObject({ x: 4, y: 4 });
  });

  it('creates no passage rooms when passages is off', () => {
    const h = new History(emptyMap(10, 10));
    const r = { ...room('R', 3, 5, 3, 2), number: 1 };
    const exits = [{ x: 3, y: 5, side: 'N' as const }, { x: 5, y: 5, side: 'N' as const }];
    const cmd = createRoomFromExit(h.map, { room: r, exits, exitType: 'archway', passages: false }, sequentialIds('p'));
    expect(h.execute(cmd).ok).toBe(true);
    expect(h.map.rooms.map((x) => x.kind)).toEqual(['room']);
    expect(openExits(h.map)).toHaveLength(2);
  });
});

describe('entry doors', () => {
  it('records the exit used for the room and for each passage', () => {
    const h = new History(emptyMap(10, 10));
    const ids = sequentialIds('n');
    h.execute(placeEntrance(h.map, dungeonSystem, { x: 4, y: 10 }, ids));
    const exit = openExits(h.map)[0]!;
    const room = newRoom(h.map, evaluatePlacement(h.map, exit, 3, 2, 1).rect!, exit, ids);
    h.execute(createRoomFromExit(h.map, { room, exits: [{ x: 4, y: 8, side: 'N' }], exitType: 'archway', passages: true }, ids));
    const passage = h.map.rooms.find((r) => r.kind === 'passage')!;
    const roomExit = h.map.doors.find((d) => d.x === 4 && d.y === 8 && d.side === 'N')!;
    expect(h.map.rooms.find((r) => r.kind === 'room')!.entryDoorId).toBe(exit.id);
    expect(passage.entryDoorId).toBe(roomExit.id);
  });

  it('frees the newest room number on undo', () => {
    const h = new History(emptyMap(10, 10));
    const ids = sequentialIds('u');
    h.execute(placeEntrance(h.map, dungeonSystem, { x: 4, y: 10 }, ids));
    const exit = openExits(h.map)[0]!;
    const room = newRoom(h.map, evaluatePlacement(h.map, exit, 2, 2, 0).rect!, exit, ids);
    h.execute(createRoomFromExit(h.map, { room, exits: [], exitType: 'archway', passages: false }, ids));
    h.undo();
    expect(newRoom(h.map, { x: 4, y: 8, w: 2, h: 2 }, exit, ids).number).toBe(1);
  });
});
```

- [ ] **Step 4: Update `tests/core/serialize.test.ts`** (full content)

```ts
import { createCampaign } from '../../src/core/campaign';
import { sequentialIds } from '../../src/core/ids';
import { parseCampaign, serializeCampaign } from '../../src/core/serialize';
import { dungeonSystem } from '../../src/systems/dungeon';
import { room } from './fixtures';

function sample() {
  const c = createCampaign(dungeonSystem, 'Test run', { seed: 7, newId: sequentialIds('c') });
  c.maps[0]!.rooms.push(room('r1', 2, 2, 3, 3, 'room', 1));
  return c;
}

describe('serialize / parse', () => {
  it('round-trips a campaign', () => {
    const c = sample();
    const result = parseCampaign(serializeCampaign(c));
    expect(result).toEqual({ ok: true, campaign: c });
  });

  it('rejects text that is not JSON', () => {
    const r = parseCampaign('not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/isn't a map file/);
  });

  it('rejects JSON without a schemaVersion', () => {
    const r = parseCampaign('{"hello": 1}');
    expect(r).toEqual({ ok: false, error: "This isn't a map file." });
  });

  it('rejects files from a newer version', () => {
    const c = { ...sample(), schemaVersion: 99 };
    const r = parseCampaign(JSON.stringify(c));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/newer version/);
  });

  it('reports damaged structure', () => {
    const c = sample() as unknown as Record<string, unknown>;
    delete c.maps;
    const r = parseCampaign(JSON.stringify(c));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('The map file is damaged: no maps.');
  });

  it('reports broken game rules', () => {
    const c = sample();
    c.maps[0]!.rooms.push(room('r2', 3, 3, 2, 2, 'room', 2));
    const r = parseCampaign(serializeCampaign(c));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/overlaps/);
  });

  it('runs migrations in order up to the current version', () => {
    const c = sample();
    const v0 = { ...c, schemaVersion: 0, name: undefined, title: 'Old name' };
    const migs = {
      0: (raw: Record<string, unknown>) => {
        const { title, ...rest } = raw;
        return { ...rest, name: title };
      },
    };
    const r = parseCampaign(JSON.stringify(v0), migs, 1);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.campaign.name).toBe('Old name');
      expect(r.campaign.schemaVersion).toBe(1);
    }
  });

  it('fails clearly when a migration is missing', () => {
    const c = { ...sample(), schemaVersion: 0 };
    const r = parseCampaign(JSON.stringify(c), {}, 1);
    expect(r).toEqual({ ok: false, error: 'Cannot upgrade this file from version 0.' });
  });

  const okDoor = { id: 'd1', x: 2, y: 2, side: 'N', type: 'archway', secret: false, lock: null };
  const corruptions: [string, (c: any) => void, string][] = [
    ['width 0', (c) => { c.maps[0].width = 0; }, 'a map has an invalid size'],
    ['width 1e9', (c) => { c.maps[0].width = 1e9; }, 'a map has an invalid size'],
    ['width 2.5', (c) => { c.maps[0].width = 2.5; }, 'a map has an invalid size'],
    ['room x 1.5', (c) => { c.maps[0].rooms[0].x = 1.5; }, 'a room is malformed'],
    ['room kind banana', (c) => { c.maps[0].rooms[0].kind = 'banana'; }, 'a room is malformed'],
    ['room label {}', (c) => { c.maps[0].rooms[0].label = {}; }, 'a room is malformed'],
    ['room entryDoorId 5', (c) => { c.maps[0].rooms[0].entryDoorId = 5; }, 'a room is malformed'],
    ['door secret yes', (c) => { c.maps[0].doors.push({ ...okDoor, secret: 'yes' }); }, 'a door is malformed'],
    ['door lock partial', (c) => { c.maps[0].doors.push({ ...okDoor, lock: { locked: true } }); }, 'a door is malformed'],
    ['stairs dir sideways', (c) => { c.maps[0].features.push({ id: 'f1', x: 1, y: 1, kind: 'stairs', dir: 'sideways' }); }, 'a feature is malformed'],
    ['note without text', (c) => { c.maps[0].features.push({ id: 'f1', x: 1, y: 1, kind: 'note' }); }, 'a feature is malformed'],
    ['token trail bad item', (c) => { c.maps[0].token = { x: 1, y: 1, trail: [{ x: 'a', y: 1 }] }; }, 'the token is malformed'],
    ['duplicate map ids', (c) => { c.maps.push(structuredClone(c.maps[0])); }, 'two maps share an id'],
    ['active map missing', (c) => { c.activeMapId = 'nope'; }, 'active map not found'],
  ];
  it.each(corruptions)('rejects corruption: %s', (_name, corrupt, problem) => {
    const c = structuredClone(sample());
    corrupt(c);
    let r: ReturnType<typeof parseCampaign> | undefined;
    expect(() => { r = parseCampaign(JSON.stringify(c)); }).not.toThrow();
    expect(r).toEqual({ ok: false, error: `The map file is damaged: ${problem}.` });
  });

  it('fails clearly when a migration throws', () => {
    const c = { ...sample(), schemaVersion: 0 };
    const migs = { 0: () => { throw new Error('boom'); } };
    expect(parseCampaign(JSON.stringify(c), migs, 1)).toEqual({ ok: false, error: 'Cannot upgrade this file from version 0.' });
  });

  it('fails clearly when a migration returns null', () => {
    const c = { ...sample(), schemaVersion: 0 };
    const migs = { 0: () => null as unknown as Record<string, unknown> };
    expect(parseCampaign(JSON.stringify(c), migs, 1)).toEqual({ ok: false, error: 'Cannot upgrade this file from version 0.' });
  });
});
```

- [ ] **Step 5: Run the tests to see them fail**

Run: `npx vitest run`
Expected: FAIL. The new entry-door tests fail (`entryDoorId` is undefined, and the invariant and validator don't check it yet).

- [ ] **Step 6: Update `src/core/types.ts`** (full content)

```ts
export type Side = 'N' | 'W';
export type Direction = 'N' | 'S' | 'E' | 'W';

export interface Cell {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** An edge between two grid squares, stored canonically as the N or W side of square (x,y). */
export interface Edge {
  x: number;
  y: number;
  side: Side;
}

export type RoomKind = 'room' | 'passage' | 'entrance';

export interface RoomLabel {
  type: string;
  unique: boolean;
  narrative: string;
}

export interface Room extends Rect {
  id: string;
  /** Display number for kind 'room'; 0 for passages and the entrance. */
  number: number;
  kind: RoomKind;
  label: RoomLabel;
  /** The door this room was entered through (its label anchors there); null for the entrance. */
  entryDoorId: string | null;
}

export interface DoorLock {
  locked: boolean;
  note: string;
}

export interface Door extends Edge {
  id: string;
  type: string;
  secret: boolean;
  lock: DoorLock | null;
}

export type Feature =
  | { id: string; kind: 'stairs'; x: number; y: number; dir: 'up' | 'down'; linkedMapId?: string }
  | { id: string; kind: 'note'; x: number; y: number; text: string };

export interface Token {
  x: number;
  y: number;
  trail: Cell[];
}

export interface DungeonMap {
  id: string;
  title: string;
  hero: string;
  level: string;
  width: number;
  height: number;
  themeId: string;
  defaultDoorType: string;
  seed: number;
  rooms: Room[];
  doors: Door[];
  features: Feature[];
  token: Token | null;
}

export interface Campaign {
  schemaVersion: number;
  id: string;
  name: string;
  systemId: string;
  maps: DungeonMap[];
  activeMapId: string;
  /** Reserved for the Part 3 character sheet; shape defined by the game system. */
  hero: unknown | null;
}
```

- [ ] **Step 7: Update `src/core/playflow.ts`** (full content)

```ts
import { addDoor, addRoom, compound, setToken, type Command } from './commands';
import { cellEdge, isBoundaryEdge, perimeterEdges, sameEdge, step } from './geometry';
import type { IdFn } from './ids';
import { doorAt, nextRoomNumber } from './query';
import { entranceInwardDirection } from './placement';
import type { GameSystem } from './system';
import type { Cell, Door, DungeonMap, Edge, Rect, Room, RoomLabel } from './types';

const EMPTY_LABEL: RoomLabel = { type: '', unique: false, narrative: '' };

function makeDoor(newId: IdFn, edge: Edge, type: string): Door {
  return { id: newId(), x: edge.x, y: edge.y, side: edge.side, type, secret: false, lock: null };
}

/**
 * Entrance room outside the boundary, its inward open exit, and the token on it.
 * `cell` must come from `entranceCells(map, system.entranceEdge)`; the door direction is
 * derived from `system.entranceEdge`.
 */
export function placeEntrance(map: DungeonMap, system: GameSystem, cell: Cell, newId: IdFn): Command {
  const entrance: Room = {
    id: newId(),
    number: 0,
    kind: 'entrance',
    x: cell.x,
    y: cell.y,
    w: 1,
    h: 1,
    label: { ...EMPTY_LABEL },
    entryDoorId: null,
  };
  const inward = cellEdge(cell, entranceInwardDirection(system.entranceEdge));
  return compound('Place entrance', [
    addRoom(entrance),
    addDoor(makeDoor(newId, inward, map.defaultDoorType)),
    setToken(map.token, { x: cell.x, y: cell.y, trail: [] }),
  ]);
}

/**
 * A new numbered room for the given (already clipped) rect, entered through `entryDoor`
 * (the open exit it was placed against). Not yet added to the map.
 */
export function newRoom(map: DungeonMap, rect: Rect, entryDoor: Door, newId: IdFn): Room {
  return {
    id: newId(),
    number: nextRoomNumber(map),
    kind: 'room',
    ...rect,
    label: { ...EMPTY_LABEL },
    entryDoorId: entryDoor.id,
  };
}

export interface RoomPlan {
  room: Room;
  exits: Edge[];
  exitType: string;
  passages: boolean;
}

/**
 * The single undoable command for steps 3–6 of the play flow: the room, its exits, and
 * (optionally) a 1-square passage beyond each exit with an open exit at its far end,
 * unless that far end is the Outer Boundary (corridors may end there; exits may not) or
 * already has a door (the existing door connects the spaces).
 * Each exit must be a perimeter edge of `plan.room` (as returned by validExitEdges).
 */
export function createRoomFromExit(map: DungeonMap, plan: RoomPlan, newId: IdFn): Command {
  const cmds: Command[] = [addRoom(plan.room)];
  const perimeter = perimeterEdges(plan.room);
  for (const exit of plan.exits) {
    const exitDoor = makeDoor(newId, exit, plan.exitType);
    cmds.push(addDoor(exitDoor));
    if (!plan.passages) continue;
    const side = perimeter.find((p) => sameEdge(p.edge, exit));
    if (!side) continue;
    const cell = step(side.inside, side.dir);
    const passage: Room = {
      id: newId(),
      number: 0,
      kind: 'passage',
      x: cell.x,
      y: cell.y,
      w: 1,
      h: 1,
      label: { ...EMPTY_LABEL },
      entryDoorId: exitDoor.id,
    };
    cmds.push(addRoom(passage));
    const far = cellEdge(cell, side.dir);
    if (!isBoundaryEdge(far, map.width, map.height) && !doorAt(map, far)) {
      cmds.push(addDoor(makeDoor(newId, far, plan.exitType)));
    }
  }
  return compound(`Add Room ${plan.room.number}`, cmds);
}
```

- [ ] **Step 8: Update `src/core/invariants.ts`** (full content)

```ts
import { clipRect, edgeKey, isBoundaryEdge, perimeterEdges, rectsOverlap, sameEdge } from './geometry';
import { roomAt, roomsAcross } from './query';
import type { DungeonMap, Room } from './types';

export function describeRoom(r: Room): string {
  if (r.kind === 'room') return `Room ${r.number}`;
  return r.kind === 'passage' ? 'a passage' : 'the entrance';
}

/** Returns a description of the first broken invariant, or null if the map is valid. */
export function checkInvariants(map: DungeonMap): string | null {
  const ids = new Set<string>();
  for (const item of [...map.rooms, ...map.doors, ...map.features]) {
    if (ids.has(item.id)) return `Duplicate id ${item.id}`;
    ids.add(item.id);
  }
  for (const r of map.rooms) {
    if (r.w < 1 || r.h < 1) return `${describeRoom(r)} has no area`;
    if (r.kind === 'entrance') {
      const xIn = r.x >= 0 && r.x < map.width;
      const yIn = r.y >= 0 && r.y < map.height;
      const xOut = r.x === -1 || r.x === map.width;
      const yOut = r.y === -1 || r.y === map.height;
      const besideBoundary = (xOut && yIn) || (yOut && xIn);
      if (r.w !== 1 || r.h !== 1 || !besideBoundary) {
        return 'The entrance must be one square outside the boundary';
      }
    } else {
      const c = clipRect(r, map.width, map.height);
      if (!c || c.w !== r.w || c.h !== r.h) return `${describeRoom(r)} crosses the Outer Boundary`;
    }
  }
  for (let i = 0; i < map.rooms.length; i++) {
    for (let j = i + 1; j < map.rooms.length; j++) {
      const a = map.rooms[i]!;
      const b = map.rooms[j]!;
      if (rectsOverlap(a, b)) return `${describeRoom(a)} overlaps ${describeRoom(b)}`;
    }
  }
  if (map.rooms.filter((r) => r.kind === 'entrance').length > 1) return 'A map can have only one entrance';
  const edgeKeys = new Set<string>();
  for (const d of map.doors) {
    const key = edgeKey(d);
    if (edgeKeys.has(key)) return 'Two doors share one edge';
    edgeKeys.add(key);
    const [a, b] = roomsAcross(map, d);
    if (!a && !b) return 'A door is not attached to any room';
    if (a && b && a.id === b.id) return 'A door is inside a room';
    if ((a?.kind === 'entrance' || b?.kind === 'entrance') && !isBoundaryEdge(d, map.width, map.height)) {
      return 'Doors on the entrance must lead into the map';
    }
    if (isBoundaryEdge(d, map.width, map.height) && a?.kind !== 'entrance' && b?.kind !== 'entrance') {
      return 'Exits cannot be placed on the Outer Boundary';
    }
  }
  for (const r of map.rooms) {
    if (r.entryDoorId === null) continue;
    const entry = map.doors.find((d) => d.id === r.entryDoorId);
    if (!entry || !perimeterEdges(r).some((p) => sameEdge(p.edge, entry))) {
      return `${describeRoom(r)} has lost the door it was entered through`;
    }
  }
  for (const f of map.features) {
    if (!roomAt(map, f)) return 'A feature is not on a floor square';
  }
  if (map.token && !roomAt(map, map.token)) return 'The token is not on a floor square';
  return null;
}
```

- [ ] **Step 9: Update `src/core/serialize.ts`** (full content)

```ts
import { CURRENT_SCHEMA_VERSION, MAX_MAP_SIZE } from './campaign';
import { checkInvariants } from './invariants';
import type { Campaign } from './types';

/** migrations[n] upgrades a raw campaign object from schema version n to n + 1. */
export type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;
export const migrations: Record<number, Migration> = {};

export type ParseResult = { ok: true; campaign: Campaign } | { ok: false; error: string };

export function serializeCampaign(c: Campaign): string {
  return JSON.stringify(c, null, 2);
}

const NOT_A_MAP = "This isn't a map file.";
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';

const isInt = (v: unknown): v is number => Number.isInteger(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isCell = (v: unknown): boolean => isObj(v) && isInt(v.x) && isInt(v.y);
const ROOM_KINDS = ['room', 'passage', 'entrance'];

function roomOk(r: unknown): boolean {
  if (!isObj(r) || !isStr(r.id) || !ROOM_KINDS.includes(r.kind as string)) return false;
  if (!isObj(r.label) || !isStr(r.label.type) || !isBool(r.label.unique) || !isStr(r.label.narrative)) return false;
  if (r.entryDoorId !== null && !isStr(r.entryDoorId)) return false;
  return ['x', 'y', 'w', 'h', 'number'].every((k) => isInt(r[k]));
}

function doorOk(d: unknown): boolean {
  if (!isObj(d) || !isStr(d.id) || !isStr(d.type) || !isCell(d) || !isBool(d.secret)) return false;
  if (d.side !== 'N' && d.side !== 'W') return false;
  return d.lock === null || (isObj(d.lock) && isBool(d.lock.locked) && isStr(d.lock.note));
}

function featureOk(f: unknown): boolean {
  if (!isObj(f) || !isStr(f.id) || !isCell(f)) return false;
  if (f.kind === 'note') return isStr(f.text);
  if (f.kind !== 'stairs') return false;
  return (f.dir === 'up' || f.dir === 'down') && (f.linkedMapId === undefined || isStr(f.linkedMapId));
}

function tokenOk(t: unknown): boolean {
  return t === null || (isObj(t) && isCell(t) && Array.isArray(t.trail) && t.trail.every(isCell));
}

function shapeProblem(raw: Record<string, unknown>): string | null {
  for (const k of ['id', 'name', 'systemId', 'activeMapId']) if (!isStr(raw[k])) return `missing ${k}`;
  if (!Array.isArray(raw.maps) || raw.maps.length === 0) return 'no maps';
  const seenIds = new Set<string>();
  for (const m of raw.maps) {
    if (!isObj(m)) return 'a map is not an object';
    for (const k of ['id', 'title', 'hero', 'level', 'themeId', 'defaultDoorType']) {
      if (!isStr(m[k])) return `map missing ${k}`;
    }
    if (!isNum(m.seed)) return 'map missing seed';
    for (const k of ['width', 'height']) {
      if (!isNum(m[k])) return `map missing ${k}`;
      if (!isInt(m[k]) || (m[k] as number) < 1 || (m[k] as number) > MAX_MAP_SIZE) return 'a map has an invalid size';
    }
    for (const k of ['rooms', 'doors', 'features']) if (!Array.isArray(m[k])) return `map missing ${k}`;
    if (!(m.rooms as unknown[]).every(roomOk)) return 'a room is malformed';
    if (!(m.doors as unknown[]).every(doorOk)) return 'a door is malformed';
    if (!(m.features as unknown[]).every(featureOk)) return 'a feature is malformed';
    if (!tokenOk(m.token)) return 'the token is malformed';
    if (seenIds.has(m.id as string)) return 'two maps share an id';
    seenIds.add(m.id as string);
  }
  if (!seenIds.has(raw.activeMapId as string)) return 'active map not found';
  return null;
}

export function parseCampaign(
  text: string,
  migs: Record<number, Migration> = migrations,
  current: number = CURRENT_SCHEMA_VERSION,
): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: `${NOT_A_MAP} (It is not valid JSON.)` };
  }
  if (!isObj(raw) || !isNum(raw.schemaVersion)) return { ok: false, error: NOT_A_MAP };
  if (raw.schemaVersion > current) {
    return { ok: false, error: 'This file was made by a newer version of the app. Please update and try again.' };
  }
  let obj: Record<string, unknown> = raw;
  for (let v = raw.schemaVersion; v < current; v++) {
    const cannotUpgrade = { ok: false, error: `Cannot upgrade this file from version ${v}.` } as const;
    const migrate = migs[v];
    if (!migrate) return cannotUpgrade;
    try {
      const next: unknown = migrate(obj);
      if (!isObj(next)) return cannotUpgrade;
      obj = { ...next, schemaVersion: v + 1 };
    } catch {
      return cannotUpgrade;
    }
  }
  const problem = shapeProblem(obj);
  if (problem) return { ok: false, error: `The map file is damaged: ${problem}.` };
  const campaign = obj as unknown as Campaign;
  for (const map of campaign.maps) {
    const broken = checkInvariants(map);
    if (broken) return { ok: false, error: `The map file is damaged: ${broken}.` };
  }
  return { ok: true, campaign };
}
```

- [ ] **Step 10: Run everything**

Run: `npm test && npm run typecheck`
Expected: **138 tests pass**; typecheck silent.

- [ ] **Step 11: Commit**

```bash
git add src/core tests/core
git commit -m "feat(core): rooms remember their entry door"
```

### Task 3: Snapshot-based, saveable History; remove `deleteRoom`

**Files:**
- Modify: `src/core/commands.ts`
- Modify: `src/core/history.ts`
- Modify: `tests/core/commands.test.ts`
- Modify: `tests/core/history.test.ts`

This task applies two user decisions from 2026-10-31.
- **Rooms are removed only through Undo.** `deleteRoom` and its tests are removed. Undo removes rooms newest-first, so numbers stay 1…N, and the existing max + 1 numbering is correct (Task 2 added a test for it).
- **Undo history is saved with the game.** `History` becomes snapshot-based: it keeps past and future `{label, map}` entries and stops calling `Command.undo`. It adds:
  - `exportState()` and `History.fromState()`, which Plan 4 uses for persistence
  - `undoLabel` and `redoLabel`
  - skipping commands that change nothing

Snapshots share unchanged objects, so memory stays small.

- [ ] **Step 1: Update `tests/core/commands.test.ts`** (full content)

```ts
import {
  addDoor,
  addFeature,
  addRoom,
  compound,
  removeDoor,
  removeRoom,
  setToken,
  updateDoor,
  updateRoom,
} from '../../src/core/commands';
import type { Command } from '../../src/core/commands';
import type { DungeonMap } from '../../src/core/types';
import { door, emptyMap, room, withContent } from './fixtures';

function roundTrip(map: DungeonMap, cmd: Command) {
  const after = cmd.apply(map);
  expect(cmd.undo(after)).toEqual(map);
  return after;
}

describe('item commands round-trip', () => {
  const base = withContent(emptyMap(), [room('a', 1, 1, 2, 2), room('b', 4, 1, 2, 2)], [door('d', 3, 1, 'W')]);

  it('addRoom', () => {
    const after = roundTrip(base, addRoom(room('c', 7, 7, 1, 1)));
    expect(after.rooms.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('removeRoom restores the original position', () => {
    const after = roundTrip(base, removeRoom(base.rooms[0]!));
    expect(after.rooms.map((r) => r.id)).toEqual(['b']);
  });
  it('updateRoom', () => {
    const after = roundTrip(base, updateRoom(base.rooms[0]!, { ...base.rooms[0]!, w: 1 }));
    expect(after.rooms[0]!.w).toBe(1);
  });
  it('addDoor / removeDoor / updateDoor', () => {
    roundTrip(base, addDoor(door('e', 1, 1, 'N')));
    roundTrip(base, removeDoor(base.doors[0]!));
    const after = roundTrip(base, updateDoor(base.doors[0]!, { ...base.doors[0]!, type: 'wooden' }));
    expect(after.doors[0]!.type).toBe('wooden');
  });
  it('setToken', () => {
    const after = roundTrip(base, setToken(null, { x: 1, y: 1, trail: [] }));
    expect(after.token).toEqual({ x: 1, y: 1, trail: [] });
  });
});

describe('removeItem undo guard and redo', () => {
  it('does not duplicate when undo runs on a map that already has the item', () => {
    const cmd = removeRoom(room('zz', 1, 1, 1, 1));
    cmd.apply(emptyMap());
    const withZz = withContent(emptyMap(), [room('zz', 1, 1, 1, 1)]);
    expect(cmd.undo(withZz).rooms.filter((r) => r.id === 'zz')).toHaveLength(1);
  });
  it('removeRoom survives apply, undo, apply', () => {
    const base = withContent(emptyMap(), [room('a', 1, 1, 2, 2), room('b', 4, 1, 2, 2)]);
    const cmd = removeRoom(base.rooms[0]!);
    const first = cmd.apply(base);
    cmd.undo(first);
    expect(cmd.apply(base)).toEqual(first);
    expect(cmd.undo(first)).toEqual(base);
  });
});

describe('compound', () => {
  it('applies in order and undoes in reverse', () => {
    const base = emptyMap();
    const cmd = compound('two rooms', [addRoom(room('a', 1, 1, 1, 1)), addRoom(room('b', 3, 3, 1, 1))]);
    const after = roundTrip(base, cmd);
    expect(after.rooms.map((r) => r.id)).toEqual(['a', 'b']);
  });
});

describe('addFeature', () => {
  it('labels by kind', () => {
    expect(addFeature({ id: 's', kind: 'stairs', x: 1, y: 1, dir: 'down' }).label).toBe('Add stairs');
  });
});
```

- [ ] **Step 2: Update `tests/core/history.test.ts`** (full content)

```ts
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
    const noop = { label: 'Nothing', apply: (m: DungeonMap) => m, undo: (m: DungeonMap) => m };
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
});
```

- [ ] **Step 3: Run the tests to see them fail**

Run: `npx vitest run tests/core/history.test.ts`
Expected: FAIL. `undoLabel`, `exportState` and `fromState` don't exist yet, and the no-op test records a step.

- [ ] **Step 4: Update `src/core/commands.ts`** (full content)

```ts
import type { Door, DungeonMap, Feature, Room, Token } from './types';

/** A reversible change to a map. apply/undo are pure: they return a new map.
 * Commands may capture state during apply; undo must only be called after the matching apply
 * (History guarantees this). */
export interface Command {
  label: string;
  apply(map: DungeonMap): DungeonMap;
  undo(map: DungeonMap): DungeonMap;
}

type Collection = 'rooms' | 'doors' | 'features';
type ItemOf<K extends Collection> = DungeonMap[K][number];

function addItem<K extends Collection>(key: K, item: ItemOf<K>, label: string): Command {
  return {
    label,
    apply: (m) => ({ ...m, [key]: [...m[key], item] }),
    undo: (m) => ({ ...m, [key]: (m[key] as ItemOf<K>[]).filter((x) => x.id !== item.id) }),
  };
}

function removeItem<K extends Collection>(key: K, item: ItemOf<K>, label: string): Command {
  let index = -1;
  return {
    label,
    apply: (m) => {
      const list = m[key] as ItemOf<K>[];
      index = list.findIndex((x) => x.id === item.id);
      return { ...m, [key]: list.filter((x) => x.id !== item.id) };
    },
    undo: (m) => {
      const list = [...(m[key] as ItemOf<K>[])];
      if (list.some((x) => x.id === item.id)) return m;
      list.splice(index < 0 ? list.length : index, 0, item);
      return { ...m, [key]: list };
    },
  };
}

function updateItem<K extends Collection>(key: K, before: ItemOf<K>, after: ItemOf<K>, label: string): Command {
  const swap = (from: ItemOf<K>, to: ItemOf<K>) => (m: DungeonMap) => ({
    ...m,
    [key]: (m[key] as ItemOf<K>[]).map((x) => (x.id === from.id ? to : x)),
  });
  return { label, apply: swap(before, after), undo: swap(after, before) };
}

export const addRoom = (room: Room) => addItem('rooms', room, 'Add room');
export const removeRoom = (room: Room) => removeItem('rooms', room, 'Remove room');
export const updateRoom = (before: Room, after: Room) => updateItem('rooms', before, after, 'Edit room');

export const addDoor = (door: Door) => addItem('doors', door, 'Add door');
export const removeDoor = (door: Door) => removeItem('doors', door, 'Remove door');
export const updateDoor = (before: Door, after: Door) => updateItem('doors', before, after, 'Edit door');

export const addFeature = (f: Feature) => addItem('features', f, `Add ${f.kind}`);
export const removeFeature = (f: Feature) => removeItem('features', f, `Remove ${f.kind}`);
export const updateFeature = (before: Feature, after: Feature) => updateItem('features', before, after, `Edit ${after.kind}`);

export function setToken(before: Token | null, after: Token | null): Command {
  return {
    label: 'Move token',
    apply: (m) => ({ ...m, token: after }),
    undo: (m) => ({ ...m, token: before }),
  };
}

export function updateMapInfo(
  before: Pick<DungeonMap, 'title' | 'hero' | 'level' | 'defaultDoorType' | 'themeId'>,
  after: Pick<DungeonMap, 'title' | 'hero' | 'level' | 'defaultDoorType' | 'themeId'>,
): Command {
  return {
    label: 'Edit map info',
    apply: (m) => ({ ...m, ...after }),
    undo: (m) => ({ ...m, ...before }),
  };
}

/** Several commands applied in order and undone in reverse, as one undo step. */
export function compound(label: string, commands: Command[]): Command {
  return {
    label,
    apply: (m) => commands.reduce((acc, c) => c.apply(acc), m),
    undo: (m) => commands.reduceRight((acc, c) => c.undo(acc), m),
  };
}
```

- [ ] **Step 5: Update `src/core/history.ts`** (full content)

```ts
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
```

- [ ] **Step 6: Run everything and confirm `deleteRoom` is gone**

Run: `grep -rn deleteRoom src tests || echo NONE && npm test && npm run typecheck`
Expected: `NONE`, then **138 tests pass**, and the typecheck is silent.

- [ ] **Step 7: Commit**

```bash
git add src/core tests/core
git commit -m "feat(core): snapshot undo history that can be saved; rooms leave only via undo"
```

### Task 4: Vite + Svelte scaffold

**Files:**
- Create: `vite.config.ts`
- Create: `svelte.config.js`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/App.svelte`
- Modify: `package.json`
- Modify: `tsconfig.json`

This task adds Vite, Svelte 5 and Playwright, the latter for screenshot checks. `App.svelte` is a placeholder until Task 15. The typecheck now also runs `svelte-check`, and `verbatimModuleSyntax` is turned on.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "2d6-map-maker",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit && svelte-check --tsconfig ./tsconfig.json --fail-on-warnings",
    "screenshot": "node scripts/screenshot.mjs"
  },
  "devDependencies": {
    "@sveltejs/vite-plugin-svelte": "5.0.3",
    "playwright": "1.48.2",
    "svelte": "5.16.0",
    "svelte-check": "4.1.1",
    "typescript": "5.7.2",
    "vite": "6.0.7",
    "vitest": "2.1.8"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "types": ["vitest/globals", "svelte"]
  },
  "include": ["src/**/*.ts", "src/**/*.svelte", "tests"]
}
```

- [ ] **Step 3: Write `vite.config.ts`**

```ts
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [svelte()],
});
```

- [ ] **Step 4: Write `svelte.config.js`**

```js
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

export default {
  preprocess: vitePreprocess(),
};
```

- [ ] **Step 5: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <title>2D6 Map Maker</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 6: Write `src/main.ts`**

```ts
import { mount } from 'svelte';
import App from './App.svelte';

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app element');

export default mount(App, { target });
```

- [ ] **Step 7: Write a placeholder `src/App.svelte`**

```svelte
<main>
  <p>2D6 Map Maker</p>
</main>
```

- [ ] **Step 8: Install and verify**

Run: `npm install && npm run typecheck && npm test && npx vite build`
Expected:
- install succeeds
- `svelte-check found 0 errors and 0 warnings`
- 138 tests pass
- the build writes `dist/` (`dist/` is already git-ignored)

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts svelte.config.js index.html src/main.ts src/App.svelte
git commit -m "chore: add Vite + Svelte app scaffold"
```

### Task 5: Seeded randomness

**Files:**
- Create: `src/render/rng.ts`
- Test: `tests/render/rng.test.ts`

All decoration (hatching, floor shades, decals) is seeded by `(map.seed, x, y)`, so it never shimmers between redraws and PNG export matches the screen.

- [ ] **Step 1: Write the failing test `tests/render/rng.test.ts`**

```ts
import { cellRng, cellSeed, mulberry32 } from '../../src/render/rng';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('produces values in [0, 1)', () => {
    const r = mulberry32(123);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('gives different squares different seeds, stable per square', () => {
    expect(cellSeed(1, 2, 3)).toBe(cellSeed(1, 2, 3));
    expect(cellSeed(1, 2, 3)).not.toBe(cellSeed(1, 3, 2));
    expect(cellSeed(1, 2, 3, 0)).not.toBe(cellSeed(1, 2, 3, 1));
    expect(cellRng(9, -1, 4)()).toBe(cellRng(9, -1, 4)());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/render/rng.test.ts`
Expected: FAIL — cannot resolve `../../src/render/rng`

- [ ] **Step 3: Implement `src/render/rng.ts`**

```ts
/** Small, fast seeded PRNG (mulberry32). Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable seed for one grid square, so its decoration never changes between redraws. */
export function cellSeed(seed: number, x: number, y: number, salt = 0): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (const v of [x, y, salt]) {
    h = Math.imul(h ^ (v | 0), 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
  }
  return h;
}

export function cellRng(seed: number, x: number, y: number, salt = 0): () => number {
  return mulberry32(cellSeed(seed, x, y, salt));
}
```

- [ ] **Step 4: Run the test and typecheck**

Run: `npx vitest run tests/render/rng.test.ts && npm run typecheck`
Expected: all tests in the file PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/render/rng.ts tests/render/rng.test.ts
git commit -m "feat(render): seeded per-square randomness"
```

### Task 6: Camera maths

**Files:**
- Create: `src/render/camera.ts`
- Test: `tests/render/camera.test.ts`

World units are grid squares, and `screen = (world - origin) * scale`. The drawable world is the map plus a one-square ring, which holds the entrance and the hatching around the edge.

- [ ] **Step 1: Write the failing test `tests/render/camera.test.ts`**

```ts
import { clampScale, fitCamera, MAX_SCALE, MIN_SCALE, panBy, screenToWorld, worldBounds, worldToScreen, zoomAt } from '../../src/render/camera';
import { emptyMap } from '../core/fixtures';

describe('camera', () => {
  const cam = { x: 2, y: 3, scale: 10 };
  it('converts world ↔ screen', () => {
    expect(worldToScreen(cam, { x: 4, y: 5 })).toEqual({ x: 20, y: 20 });
    expect(screenToWorld(cam, { x: 20, y: 20 })).toEqual({ x: 4, y: 5 });
  });
  it('world bounds include a one-square ring', () => {
    expect(worldBounds(emptyMap(10, 8))).toEqual({ x: -1, y: -1, w: 12, h: 10 });
  });
  it('fits and centres the bounds in the view', () => {
    const c = fitCamera({ x: 0, y: 0, w: 10, h: 5 }, 220, 220, 10);
    expect(c.scale).toBe(20);
    expect(worldToScreen(c, { x: 5, y: 2.5 })).toEqual({ x: 110, y: 110 });
  });
  it('zooms around the pointer', () => {
    const z = zoomAt(cam, 2, { x: 50, y: 40 });
    expect(z.scale).toBe(20);
    expect(screenToWorld(z, { x: 50, y: 40 })).toEqual(screenToWorld(cam, { x: 50, y: 40 }));
  });
  it('pans with the pointer', () => {
    expect(panBy(cam, 10, -20)).toEqual({ x: 1, y: 5, scale: 10 });
  });
  it('clamps scale', () => {
    expect(clampScale(1)).toBe(MIN_SCALE);
    expect(clampScale(1e6)).toBe(MAX_SCALE);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/render/camera.test.ts`
Expected: FAIL — cannot resolve `../../src/render/camera`

- [ ] **Step 3: Implement `src/render/camera.ts`**

```ts
import type { DungeonMap, Rect } from '../core/types';

/** World units are grid squares. screen = (world - origin) * scale. */
export interface Camera {
  x: number;
  y: number;
  /** Screen pixels per grid square. */
  scale: number;
}

export interface Point {
  x: number;
  y: number;
}

export const MIN_SCALE = 6;
export const MAX_SCALE = 160;

export function worldToScreen(c: Camera, p: Point): Point {
  return { x: (p.x - c.x) * c.scale, y: (p.y - c.y) * c.scale };
}

export function screenToWorld(c: Camera, p: Point): Point {
  return { x: p.x / c.scale + c.x, y: p.y / c.scale + c.y };
}

/** The drawable world area: the map plus a one-square ring for the entrance and hatching. */
export function worldBounds(map: DungeonMap): Rect {
  return { x: -1, y: -1, w: map.width + 2, h: map.height + 2 };
}

/** A camera that fits `bounds` inside a view of the given pixel size, centred, with padding. */
export function fitCamera(bounds: Rect, viewW: number, viewH: number, padding = 16): Camera {
  const availW = Math.max(1, viewW - padding * 2);
  const availH = Math.max(1, viewH - padding * 2);
  const scale = clampScale(Math.min(availW / bounds.w, availH / bounds.h));
  return {
    scale,
    x: bounds.x + bounds.w / 2 - viewW / 2 / scale,
    y: bounds.y + bounds.h / 2 - viewH / 2 / scale,
  };
}

/** Zoom by `factor`, keeping the world point under `screen` fixed. */
export function zoomAt(c: Camera, factor: number, screen: Point): Camera {
  const scale = clampScale(c.scale * factor);
  const anchor = screenToWorld(c, screen);
  return { scale, x: anchor.x - screen.x / scale, y: anchor.y - screen.y / scale };
}

/** Pan by a screen-pixel delta (content follows the pointer). */
export function panBy(c: Camera, dx: number, dy: number): Camera {
  return { ...c, x: c.x - dx / c.scale, y: c.y - dy / c.scale };
}

export function clampScale(s: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}
```

- [ ] **Step 4: Run the test and typecheck**

Run: `npx vitest run tests/render/camera.test.ts && npm run typecheck`
Expected: all tests in the file PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/render/camera.ts tests/render/camera.test.ts
git commit -m "feat(render): camera transform, fit, zoom and pan"
```

### Task 7: Hatching geometry

**Files:**
- Create: `src/render/hatching.ts`
- Test: `tests/render/hatching.test.ts`

Rock squares within `reach` squares of floor get clusters of short parallel strokes at random angles. The strokes are densest and darkest next to the wall and fade further out. This is the Classic look (see the spec, §9).

- [ ] **Step 1: Write the failing test `tests/render/hatching.test.ts`**

```ts
import { floorLookup, hatchStrokes } from '../../src/render/hatching';
import { emptyMap, room, withContent } from '../core/fixtures';

describe('hatching', () => {
  const map = withContent(emptyMap(10, 10), [room('a', 4, 4, 2, 2)]);
  it('is identical on every call', () => {
    expect(hatchStrokes(map, 1.6)).toEqual(hatchStrokes(map, 1.6));
  });
  it('changes with the map seed', () => {
    expect(hatchStrokes({ ...map, seed: 2 }, 1.6)).not.toEqual(hatchStrokes(map, 1.6));
  });
  it('only hatches rock within reach of the floor', () => {
    const strokes = hatchStrokes(map, 1.6);
    expect(strokes.length).toBeGreaterThan(0);
    for (const s of strokes) {
      const mx = (s.x1 + s.x2) / 2;
      const my = (s.y1 + s.y2) / 2;
      // Stroke centres sit in squares at most 2 away from the 2x2 room at (4..5, 4..5).
      expect(mx).toBeGreaterThan(2 - 0.2);
      expect(mx).toBeLessThan(8 + 0.2);
      expect(my).toBeGreaterThan(2 - 0.2);
      expect(my).toBeLessThan(8 + 0.2);
    }
  });
  it('is denser and darker next to the wall', () => {
    const strokes = hatchStrokes(map, 1.6);
    const near = strokes.filter((s) => s.alpha > 0.5).length;
    const far = strokes.filter((s) => s.alpha <= 0.5).length;
    expect(near).toBeGreaterThan(far);
  });
  it('produces nothing on an empty map', () => {
    expect(hatchStrokes(emptyMap(5, 5), 1.6)).toEqual([]);
  });
  it('floorLookup matches room squares', () => {
    const isFloor = floorLookup(map, 2);
    expect(isFloor(4, 4)).toBe(true);
    expect(isFloor(6, 4)).toBe(false);
    expect(isFloor(-50, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/render/hatching.test.ts`
Expected: FAIL — cannot resolve `../../src/render/hatching`

- [ ] **Step 3: Implement `src/render/hatching.ts`**

```ts
import { roomAt } from '../core/query';
import type { DungeonMap } from '../core/types';
import { cellRng } from './rng';

/** One short pen stroke, in grid units. */
export interface Stroke {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  alpha: number;
}

/**
 * Hatching for the rock around the floor: every rock square within `reach` squares
 * (Chebyshev distance) of floor gets a few clusters of short parallel strokes at a random
 * angle, fading with distance. Seeded per square, so it is identical on every redraw.
 */
export function hatchStrokes(map: DungeonMap, reach: number): Stroke[] {
  const r = Math.ceil(reach);
  const isFloor = floorLookup(map, r);
  const strokes: Stroke[] = [];
  for (let y = -1 - r; y <= map.height + r; y++) {
    for (let x = -1 - r; x <= map.width + r; x++) {
      if (isFloor(x, y)) continue;
      const d = distanceToFloor(isFloor, x, y, r);
      if (d > reach) continue;
      const rng = cellRng(map.seed, x, y, 1);
      const alpha = d <= 1 ? 0.7 : 0.7 * (1 - (d - 1) / reach);
      const clusters = d <= 1 ? 8 + Math.floor(rng() * 4) : 2 + Math.floor(rng() * 3);
      for (let c = 0; c < clusters; c++) strokes.push(...cluster(rng, x, y, alpha));
    }
  }
  return strokes;
}

function cluster(rng: () => number, x: number, y: number, alpha: number): Stroke[] {
  const cx = x + 0.1 + rng() * 0.8;
  const cy = y + 0.1 + rng() * 0.8;
  const angle = rng() * Math.PI;
  const n = 3 + Math.floor(rng() * 3);
  const len = 0.16 + rng() * 0.1;
  const spacing = 0.05;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const out: Stroke[] = [];
  for (let i = 0; i < n; i++) {
    const off = (i - (n - 1) / 2) * spacing;
    const px = cx - dy * off;
    const py = cy + dx * off;
    out.push({ x1: px - (dx * len) / 2, y1: py - (dy * len) / 2, x2: px + (dx * len) / 2, y2: py + (dy * len) / 2, alpha });
  }
  return out;
}

/** Fast floor test over the drawable area (map plus margin), precomputed into a grid. */
export function floorLookup(map: DungeonMap, margin: number): (x: number, y: number) => boolean {
  const x0 = -1 - margin;
  const y0 = -1 - margin;
  const w = map.width + 2 + margin * 2;
  const h = map.height + 2 + margin * 2;
  const grid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) if (roomAt(map, { x: x + x0, y: y + y0 })) grid[y * w + x] = 1;
  }
  return (x, y) => {
    const gx = x - x0;
    const gy = y - y0;
    return gx >= 0 && gy >= 0 && gx < w && gy < h && grid[gy * w + gx] === 1;
  };
}

function distanceToFloor(isFloor: (x: number, y: number) => boolean, x: number, y: number, r: number): number {
  for (let d = 1; d <= r; d++) {
    for (let dy = -d; dy <= d; dy++) {
      for (let dx = -d; dx <= d; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === d && isFloor(x + dx, y + dy)) return d;
      }
    }
  }
  return Infinity;
}
```

- [ ] **Step 4: Run the test and typecheck**

Run: `npx vitest run tests/render/hatching.test.ts && npm run typecheck`
Expected: all tests in the file PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/render/hatching.ts tests/render/hatching.test.ts
git commit -m "feat(render): seeded rock hatching strokes"
```

### Task 8: Floor tiles and decals

**Files:**
- Create: `src/render/floor.ts`
- Test: `tests/render/floor.test.ts`

- [ ] **Step 1: Write the failing test `tests/render/floor.test.ts`**

```ts
import { floorDecals, floorTiles } from '../../src/render/floor';
import { emptyMap, room, withContent } from '../core/fixtures';

describe('floor', () => {
  const map = withContent(emptyMap(10, 10), [room('a', 1, 1, 3, 2), room('b', 6, 6, 2, 2)]);
  it('has one tile per floor square with a valid shade', () => {
    const tiles = floorTiles(map, 3);
    expect(tiles).toHaveLength(10);
    for (const t of tiles) expect([0, 1, 2]).toContain(t.shade);
  });
  it('decals are deterministic and inside their square', () => {
    const big = withContent(emptyMap(20, 20), [room('a', 0, 0, 20, 20)]);
    const decals = floorDecals(big);
    expect(floorDecals(big)).toEqual(decals);
    expect(decals.length).toBeGreaterThan(0);
    expect(decals.length).toBeLessThan(400);
    for (const d of decals) {
      expect(d.x - Math.floor(d.x)).toBeGreaterThanOrEqual(0.2);
      expect(d.x - Math.floor(d.x)).toBeLessThanOrEqual(0.8);
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/render/floor.test.ts`
Expected: FAIL — cannot resolve `../../src/render/floor`

- [ ] **Step 3: Implement `src/render/floor.ts`**

```ts
import type { DungeonMap } from '../core/types';
import { cellRng } from './rng';

export interface FloorTile {
  x: number;
  y: number;
  /** Index into theme.floor. */
  shade: number;
}

export type DecalKind = 'crack' | 'stain' | 'pebbles';

export interface Decal {
  kind: DecalKind;
  /** Centre, in grid units. */
  x: number;
  y: number;
  size: number;
  angle: number;
  /** Per-decal seed for the drawing code's own small randomness. */
  seed: number;
}

export const DECAL_CHANCE = 0.22;

/** One tile per floor square with a seeded shade. */
export function floorTiles(map: DungeonMap, shades: number): FloorTile[] {
  const tiles: FloorTile[] = [];
  for (const room of map.rooms) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        tiles.push({ x, y, shade: Math.floor(cellRng(map.seed, x, y, 2)() * shades) });
      }
    }
  }
  return tiles;
}

/** Occasional cracks, stains and pebbles on floor squares, seeded per square. */
export function floorDecals(map: DungeonMap): Decal[] {
  const kinds: DecalKind[] = ['crack', 'stain', 'pebbles'];
  const decals: Decal[] = [];
  for (const room of map.rooms) {
    for (let y = room.y; y < room.y + room.h; y++) {
      for (let x = room.x; x < room.x + room.w; x++) {
        const rng = cellRng(map.seed, x, y, 3);
        if (rng() >= DECAL_CHANCE) continue;
        decals.push({
          kind: kinds[Math.floor(rng() * kinds.length)]!,
          x: x + 0.2 + rng() * 0.6,
          y: y + 0.2 + rng() * 0.6,
          size: 0.12 + rng() * 0.18,
          angle: rng() * Math.PI * 2,
          seed: Math.floor(rng() * 2 ** 31),
        });
      }
    }
  }
  return decals;
}
```

- [ ] **Step 4: Run the test and typecheck**

Run: `npx vitest run tests/render/floor.test.ts && npm run typecheck`
Expected: all tests in the file PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/render/floor.ts tests/render/floor.test.ts
git commit -m "feat(render): floor shades and decals"
```

### Task 9: Wall segments and shadows

**Files:**
- Create: `src/render/walls.ts`
- Test: `tests/render/walls.test.ts`

Wall edges come from `deriveWalls`. Collinear touching edges are merged so long walls and corners draw cleanly. Each floor side of a wall gets a shadow strip, so a shared wall gets two.

- [ ] **Step 1: Write the failing test `tests/render/walls.test.ts`**

```ts
import { edgeSegment, wallSegments, wallShadows } from '../../src/render/walls';
import { door, emptyMap, room, withContent } from '../core/fixtures';

describe('walls', () => {
  it('edgeSegment spans one square', () => {
    expect(edgeSegment({ x: 2, y: 3, side: 'N' })).toEqual({ x1: 2, y1: 3, x2: 3, y2: 3 });
    expect(edgeSegment({ x: 2, y: 3, side: 'W' })).toEqual({ x1: 2, y1: 3, x2: 2, y2: 4 });
  });
  it('merges a lone room into four sides', () => {
    const m = withContent(emptyMap(), [room('a', 1, 1, 3, 2)]);
    expect(wallSegments(m)).toEqual(
      expect.arrayContaining([
        { x1: 1, y1: 1, x2: 4, y2: 1 },
        { x1: 1, y1: 3, x2: 4, y2: 3 },
        { x1: 1, y1: 1, x2: 1, y2: 3 },
        { x1: 4, y1: 1, x2: 4, y2: 3 },
      ]),
    );
    expect(wallSegments(m)).toHaveLength(4);
  });
  it('splits a wall around a door', () => {
    const m = withContent(emptyMap(), [room('a', 1, 1, 3, 1)], [door('d', 2, 1, 'N')]);
    const top = wallSegments(m).filter((s) => s.y1 === 1 && s.y2 === 1);
    expect(top).toEqual(
      expect.arrayContaining([
        { x1: 1, y1: 1, x2: 2, y2: 1 },
        { x1: 3, y1: 1, x2: 4, y2: 1 },
      ]),
    );
  });
  it('shadows fall on the floor side, both sides of a shared wall', () => {
    const lone = withContent(emptyMap(), [room('a', 1, 1, 1, 1)]);
    expect(wallShadows(lone).map((s) => s.inward).sort()).toEqual(['E', 'N', 'S', 'W']);
    const pair = withContent(emptyMap(), [room('a', 1, 1, 1, 1), room('b', 2, 1, 1, 1)]);
    const shared = wallShadows(pair).filter((s) => s.seg.x1 === 2 && s.seg.x2 === 2);
    expect(shared.map((s) => s.inward).sort()).toEqual(['E', 'W']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/render/walls.test.ts`
Expected: FAIL — cannot resolve `../../src/render/walls`

- [ ] **Step 3: Implement `src/render/walls.ts`**

```ts
import { edgeCells } from '../core/geometry';
import { deriveWalls, roomAt } from '../core/query';
import type { Direction, DungeonMap, Edge } from '../core/types';

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function edgeSegment(e: Edge): Segment {
  return e.side === 'N' ? { x1: e.x, y1: e.y, x2: e.x + 1, y2: e.y } : { x1: e.x, y1: e.y, x2: e.x, y2: e.y + 1 };
}

/** Wall lines, with collinear touching edges merged so corners and long walls draw cleanly. */
export function wallSegments(map: DungeonMap): Segment[] {
  const rows = new Map<number, number[]>();
  const cols = new Map<number, number[]>();
  for (const e of deriveWalls(map)) {
    const bucket = e.side === 'N' ? rows : cols;
    const key = e.side === 'N' ? e.y : e.x;
    const list = bucket.get(key) ?? [];
    list.push(e.side === 'N' ? e.x : e.y);
    bucket.set(key, list);
  }
  const out: Segment[] = [];
  const merge = (bucket: Map<number, number[]>, horizontal: boolean) => {
    for (const [line, starts] of bucket) {
      starts.sort((a, b) => a - b);
      let runStart = starts[0]!;
      let prev = runStart;
      for (const s of [...starts.slice(1), Infinity]) {
        if (s === prev + 1) {
          prev = s;
          continue;
        }
        out.push(horizontal ? { x1: runStart, y1: line, x2: prev + 1, y2: line } : { x1: line, y1: runStart, x2: line, y2: prev + 1 });
        runStart = s;
        prev = s;
      }
    }
  };
  merge(rows, true);
  merge(cols, false);
  return out;
}

export interface ShadowEdge {
  seg: Segment;
  /** Direction from the wall into the floor the shadow falls on. */
  inward: Direction;
}

/** One shadow strip per floor side of every wall edge. */
export function wallShadows(map: DungeonMap): ShadowEdge[] {
  const out: ShadowEdge[] = [];
  for (const e of deriveWalls(map)) {
    const [a, b] = edgeCells(e);
    const seg = edgeSegment(e);
    if (roomAt(map, a)) out.push({ seg, inward: e.side === 'N' ? 'N' : 'W' });
    if (roomAt(map, b)) out.push({ seg, inward: e.side === 'N' ? 'S' : 'E' });
  }
  return out;
}
```

- [ ] **Step 4: Run the test and typecheck**

Run: `npx vitest run tests/render/walls.test.ts && npm run typecheck`
Expected: all tests in the file PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/render/walls.ts tests/render/walls.test.ts
git commit -m "feat(render): merged wall segments and inner shadows"
```

### Task 10: Door glyphs and exit stubs

**Files:**
- Create: `src/render/doors.ts`
- Test: `tests/render/doors.test.ts`

A symbol is drawn with the door along its x axis and +y pointing into the room. `rotation` maps that onto the map: 0 points south, π north, -π/2 east and π/2 west.

- [ ] **Step 1: Write the failing test `tests/render/doors.test.ts`**

```ts
import { doorGlyphs, exitStubs } from '../../src/render/doors';
import { door, emptyMap, room, withContent } from '../core/fixtures';

describe('door glyphs', () => {
  it('centres on the edge and points into the room', () => {
    // Open exit on the top wall of a room: room is south of the edge → rotation 0.
    const top = withContent(emptyMap(), [room('a', 2, 2, 2, 2)], [door('d', 2, 2, 'N')]);
    expect(doorGlyphs(top)[0]).toMatchObject({ cx: 2.5, cy: 2, rotation: 0, open: true });
    // Open exit on the bottom wall: room is north → rotation π.
    const bottom = withContent(emptyMap(), [room('a', 2, 2, 2, 2)], [door('d', 2, 4, 'N')]);
    expect(doorGlyphs(bottom)[0]!.rotation).toBeCloseTo(Math.PI);
    // Left wall: room is east → -π/2. Right wall: room is west → π/2.
    const left = withContent(emptyMap(), [room('a', 2, 2, 2, 2)], [door('d', 2, 2, 'W')]);
    expect(doorGlyphs(left)[0]).toMatchObject({ cx: 2, cy: 2.5 });
    expect(doorGlyphs(left)[0]!.rotation).toBeCloseTo(-Math.PI / 2);
    const right = withContent(emptyMap(), [room('a', 2, 2, 2, 2)], [door('d', 4, 2, 'W')]);
    expect(doorGlyphs(right)[0]!.rotation).toBeCloseTo(Math.PI / 2);
  });
  it('reports secret, lock and open state', () => {
    const d = { ...door('d', 4, 2, 'W'), secret: true, lock: { locked: true, note: '' } };
    const m = withContent(emptyMap(), [room('a', 2, 2, 2, 2), room('b', 4, 2, 2, 2)], [d]);
    expect(doorGlyphs(m)[0]).toMatchObject({ secret: true, locked: true, open: false });
  });
});

describe('exit stubs', () => {
  it('point outward from open exits only', () => {
    const m = withContent(
      emptyMap(),
      [room('a', 2, 2, 2, 2), room('b', 4, 2, 2, 2)],
      [door('open', 2, 2, 'N'), door('shut', 4, 2, 'W')],
    );
    expect(exitStubs(m)).toEqual([{ doorId: 'open', cx: 2.5, cy: 2, dx: 0, dy: -1 }]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/render/doors.test.ts`
Expected: FAIL — cannot resolve `../../src/render/doors`

- [ ] **Step 3: Implement `src/render/doors.ts`**

```ts
import { exitDirection, roomsAcross } from '../core/query';
import type { DungeonMap } from '../core/types';

/** Where and how to draw a door, in grid units. */
export interface DoorGlyph {
  id: string;
  type: string;
  /** Centre of the door's edge. */
  cx: number;
  cy: number;
  /** Rotation in radians so the symbol's x axis runs along the edge and +y points into its room. */
  rotation: number;
  secret: boolean;
  /** null = no lock; otherwise whether it is currently locked. */
  locked: boolean | null;
  /** An unexplored exit (room on one side only). */
  open: boolean;
}

export function doorGlyphs(map: DungeonMap): DoorGlyph[] {
  return map.doors.map((d) => {
    const [a, b] = roomsAcross(map, d);
    // Symbol +y should point into a room: towards b (south/east) unless only a exists.
    // Rotation θ maps symbol +y to (-sin θ, cos θ): 0 → south, π → north, -π/2 → east, π/2 → west.
    const towardsB = b !== undefined || a === undefined;
    const rotation = d.side === 'N' ? (towardsB ? 0 : Math.PI) : towardsB ? -Math.PI / 2 : Math.PI / 2;
    return {
      id: d.id,
      type: d.type,
      cx: d.side === 'N' ? d.x + 0.5 : d.x,
      cy: d.side === 'N' ? d.y : d.y + 0.5,
      rotation,
      secret: d.secret,
      locked: d.lock ? d.lock.locked : null,
      open: (a === undefined) !== (b === undefined),
    };
  });
}

/** The marker drawn on an open exit: from the edge centre, pointing outward. */
export interface ExitStub {
  doorId: string;
  cx: number;
  cy: number;
  dx: number;
  dy: number;
}

export function exitStubs(map: DungeonMap): ExitStub[] {
  const out: ExitStub[] = [];
  for (const d of map.doors) {
    const dir = exitDirection(map, d);
    if (!dir) continue;
    const v = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] }[dir] as [number, number];
    out.push({
      doorId: d.id,
      cx: d.side === 'N' ? d.x + 0.5 : d.x,
      cy: d.side === 'N' ? d.y : d.y + 0.5,
      dx: v[0],
      dy: v[1],
    });
  }
  return out;
}
```

- [ ] **Step 4: Run the test and typecheck**

Run: `npx vitest run tests/render/doors.test.ts && npm run typecheck`
Expected: all tests in the file PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/render/doors.ts tests/render/doors.test.ts
git commit -m "feat(render): door glyph placement and exit stubs"
```

### Task 11: Label placement

**Files:**
- Create: `src/render/labels.ts`
- Test: `tests/render/labels.test.ts`

This follows the user decision from 2026-10-31:
- A label goes inside its room, as close as possible to the entry door.
- If the text doesn't fit inside, the label moves to the nearest spot on the rock where it overlaps no room.
- Labels never overlap each other or any door symbol.
- Rooms are placed in number order, so earlier labels keep their spots.

- [ ] **Step 1: Write the failing test `tests/render/labels.test.ts`**

```ts
import { rectsOverlap } from '../../src/core/geometry';
import { anchorPoint, doorZone, labelText, type MeasureText, placeLabels } from '../../src/render/labels';
import { door, emptyMap, room, withContent } from '../core/fixtures';

// Every character is 0.2 squares wide; boxes are 0.5 tall.
const measure: MeasureText = (t) => ({ w: t.length * 0.2, h: 0.5 });

function named(id: string, x: number, y: number, w: number, h: number, n: number, type: string, entryDoorId: string | null) {
  return { ...room(id, x, y, w, h, 'room', n), label: { type, unique: false, narrative: '' }, entryDoorId };
}

describe('labels', () => {
  it('formats "N - Type", or just N without a type', () => {
    expect(labelText(named('a', 0, 0, 1, 1, 3, 'Shrine', null))).toBe('3 - Shrine');
    expect(labelText(named('a', 0, 0, 1, 1, 3, '  ', null))).toBe('3');
  });

  it('anchors at the entry door', () => {
    const m = withContent(emptyMap(), [named('a', 2, 2, 4, 3, 1, 'X', 'd')], [door('d', 3, 5, 'N')]);
    expect(anchorPoint(m, m.rooms[0]!)).toEqual({ x: 3.5, y: 5 });
  });

  it('places a short label inside the room near its entry door, clear of the door', () => {
    const m = withContent(emptyMap(20, 20), [named('a', 2, 2, 6, 4, 1, 'Hall', 'd')], [door('d', 4, 6, 'N')]);
    const [box] = placeLabels(m, measure);
    expect(box!.text).toBe('1 - Hall');
    // Inside the room…
    expect(box!.x).toBeGreaterThanOrEqual(2);
    expect(box!.x + box!.w).toBeLessThanOrEqual(8);
    expect(box!.y).toBeGreaterThanOrEqual(2);
    expect(box!.y + box!.h).toBeLessThanOrEqual(6);
    // …in the half nearest the door (bottom wall)…
    expect(box!.y).toBeGreaterThan(4);
    // …and not over the door.
    expect(rectsOverlap(box!, doorZone(m.doors[0]!))).toBe(false);
  });

  it('moves a label that does not fit inside onto the rock, overlapping no room', () => {
    const m = withContent(
      emptyMap(20, 20),
      [named('a', 8, 8, 2, 2, 1, 'Collapsed Armoury', 'd'), room('b', 10, 8, 3, 2, 'passage')],
      [door('d', 8, 10, 'N')],
    );
    const box = placeLabels(m, measure).find((l) => l.roomId === 'a')!;
    expect(box.w).toBeCloseTo(4.2);
    for (const r of m.rooms) expect(rectsOverlap(box, r)).toBe(false);
  });

  it('never overlaps two labels', () => {
    const m = withContent(
      emptyMap(20, 20),
      [named('a', 2, 2, 2, 1, 1, 'Long Name Here', null), named('b', 4, 2, 2, 1, 2, 'Another Long One', null)],
    );
    const [a, b] = placeLabels(m, measure);
    expect(rectsOverlap(a!, b!)).toBe(false);
  });

  it('ignores passages and the entrance', () => {
    const m = withContent(emptyMap(), [room('p', 1, 1, 1, 1, 'passage'), room('e', 1, 10, 1, 1, 'entrance')]);
    expect(placeLabels(m, measure)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/render/labels.test.ts`
Expected: FAIL — cannot resolve `../../src/render/labels`

- [ ] **Step 3: Implement `src/render/labels.ts`**

```ts
import { rectsOverlap } from '../core/geometry';
import type { DungeonMap, Rect, Room } from '../core/types';

export interface LabelBox extends Rect {
  roomId: string;
  text: string;
}

/** Text size in grid units. */
export type MeasureText = (text: string) => { w: number; h: number };

const STEP = 0.25;
const INSET = 0.12;
const GAP = 0.06;

export function labelText(room: Room): string {
  const type = room.label.type.trim();
  return type ? `${room.number} - ${type}` : `${room.number}`;
}

/**
 * Place a boxed label for every numbered room. Preferred spot: inside the room, as close
 * as possible to its entry door. If the text doesn't fit inside the room, the box moves to
 * the nearest spot on the rock outside where it overlaps no room and no other label.
 * Labels are placed in room-number order, so earlier rooms keep their spots.
 */
export function placeLabels(map: DungeonMap, measure: MeasureText): LabelBox[] {
  const placed: LabelBox[] = [];
  const rooms = map.rooms.filter((r) => r.kind === 'room').sort((a, b) => a.number - b.number);
  const doorZones = map.doors.map(doorZone);
  for (const room of rooms) {
    const text = labelText(room);
    const { w, h } = measure(text);
    const anchor = anchorPoint(map, room);
    const free = (r: Rect) =>
      !placed.some((p) => rectsOverlap(grow(p, GAP), r)) && !doorZones.some((z) => rectsOverlap(z, r));
    const inside = bestSpot(insideCandidates(room, w, h), anchor, free);
    const outside =
      inside ??
      bestSpot(outsideCandidates(map, room, w, h), anchor, (r) => free(r) && !map.rooms.some((o) => rectsOverlap(grow(o, GAP), r)));
    const rect = outside ?? { x: anchor.x - w / 2, y: anchor.y - h / 2, w, h };
    placed.push({ ...rect, roomId: room.id, text });
  }
  return placed;
}

/** The middle of the room's entry door, or the room's top-left corner area if it has none. */
export function anchorPoint(map: DungeonMap, room: Room): { x: number; y: number } {
  const door = map.doors.find((d) => d.id === room.entryDoorId);
  if (!door) return { x: room.x + 0.5, y: room.y + 0.5 };
  return door.side === 'N' ? { x: door.x + 0.5, y: door.y } : { x: door.x, y: door.y + 0.5 };
}

function insideCandidates(room: Room, w: number, h: number): Rect[] {
  return grid(room.x + INSET, room.y + INSET, room.x + room.w - INSET - w, room.y + room.h - INSET - h, w, h);
}

function outsideCandidates(map: DungeonMap, room: Room, w: number, h: number): Rect[] {
  const minX = Math.max(-1, room.x - w - 1.5);
  const minY = Math.max(-1, room.y - h - 1.5);
  const maxX = Math.min(map.width + 1 - w, room.x + room.w + 1.5);
  const maxY = Math.min(map.height + 1 - h, room.y + room.h + 1.5);
  return grid(minX, minY, maxX, maxY, w, h);
}

function grid(x0: number, y0: number, x1: number, y1: number, w: number, h: number): Rect[] {
  const out: Rect[] = [];
  for (let y = y0; y <= y1 + 1e-9; y += STEP) {
    for (let x = x0; x <= x1 + 1e-9; x += STEP) out.push({ x, y, w, h });
  }
  return out;
}

function bestSpot(cands: Rect[], anchor: { x: number; y: number }, ok: (r: Rect) => boolean): Rect | null {
  let best: Rect | null = null;
  let bestScore = Infinity;
  for (const r of cands) {
    if (!ok(r)) continue;
    const nx = Math.max(r.x, Math.min(anchor.x, r.x + r.w));
    const ny = Math.max(r.y, Math.min(anchor.y, r.y + r.h));
    const edgeDist = Math.hypot(anchor.x - nx, anchor.y - ny);
    const centreDist = Math.hypot(anchor.x - (r.x + r.w / 2), anchor.y - (r.y + r.h / 2));
    const score = edgeDist * 10 + centreDist;
    if (score < bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return best;
}

/** The area a door symbol (and its lock) occupies, which labels must keep clear of. */
export function doorZone(d: { x: number; y: number; side: 'N' | 'W' }): Rect {
  return d.side === 'N' ? { x: d.x, y: d.y - 0.36, w: 1, h: 0.72 } : { x: d.x - 0.36, y: d.y, w: 0.72, h: 1 };
}

function grow(r: Rect, by: number): Rect {
  return { x: r.x - by, y: r.y - by, w: r.w + by * 2, h: r.h + by * 2 };
}
```

- [ ] **Step 4: Run the test and typecheck**

Run: `npx vitest run tests/render/labels.test.ts && npm run typecheck`
Expected: all tests in the file PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/render/labels.ts tests/render/labels.test.ts
git commit -m "feat(render): label placement near the entry door"
```

### Task 12: Token path and footprints

**Files:**
- Create: `src/render/token.ts`
- Test: `tests/render/token.test.ts`

- [ ] **Step 1: Write the failing test `tests/render/token.test.ts`**

```ts
import { footprints, pathPosition } from '../../src/render/token';
import { emptyMap, room, withContent } from '../core/fixtures';

describe('pathPosition', () => {
  const path = [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 2, y: 2 },
  ];
  it('interpolates between square centres', () => {
    expect(pathPosition(path, 0)).toEqual({ x: 1.5, y: 1.5, done: false });
    expect(pathPosition(path, 0.5)).toEqual({ x: 2, y: 1.5, done: false });
    expect(pathPosition(path, 1.5)).toEqual({ x: 2.5, y: 2, done: false });
  });
  it('finishes at the last square', () => {
    expect(pathPosition(path, 5)).toEqual({ x: 2.5, y: 2.5, done: true });
  });
});

describe('footprints', () => {
  const map = withContent(emptyMap(), [room('a', 0, 0, 5, 1)]);
  it('alternates feet and fades older prints', () => {
    const prints = footprints(map, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], { x: 3, y: 0 });
    expect(prints.map((p) => p.left)).toEqual([true, false, true]);
    expect(prints[0]!.age).toBeGreaterThan(prints[2]!.age);
    expect(prints[2]!.age).toBe(0);
    // Heading east.
    for (const p of prints) expect(p.angle).toBeCloseTo(0);
  });
  it('skips squares that are no longer floor', () => {
    const prints = footprints(map, [{ x: 9, y: 9 }, { x: 0, y: 0 }], { x: 1, y: 0 });
    expect(prints).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/render/token.test.ts`
Expected: FAIL — cannot resolve `../../src/render/token`

- [ ] **Step 3: Implement `src/render/token.ts`**

```ts
import { roomAt } from '../core/query';
import type { Cell, DungeonMap } from '../core/types';

export interface Footprint {
  /** Centre, in grid units. */
  x: number;
  y: number;
  /** Heading in radians (0 = east, π/2 = south). */
  angle: number;
  left: boolean;
  /** 0 = newest, approaching 1 = oldest. */
  age: number;
}

const SIDE_OFFSET = 0.11;

/** Position along a path of squares after travelling `distance` squares, at square centres. */
export function pathPosition(path: Cell[], distance: number): { x: number; y: number; done: boolean } {
  const last = path[path.length - 1];
  if (!last) return { x: 0, y: 0, done: true };
  const max = path.length - 1;
  if (distance >= max) return { x: last.x + 0.5, y: last.y + 0.5, done: true };
  const d = Math.max(0, distance);
  const i = Math.floor(d);
  const t = d - i;
  const a = path[i]!;
  const b = path[i + 1]!;
  return { x: a.x + (b.x - a.x) * t + 0.5, y: a.y + (b.y - a.y) * t + 0.5, done: false };
}

/**
 * Footprints for a trail of squares walked, heading towards the token. Feet alternate left
 * and right of the square centre. Squares that are no longer floor are skipped.
 */
export function footprints(map: DungeonMap, trail: Cell[], token: Cell | null): Footprint[] {
  const steps = token ? [...trail, token] : trail;
  const out: Footprint[] = [];
  const n = trail.length;
  for (let i = 0; i < n; i++) {
    const here = steps[i]!;
    const next = steps[i + 1] ?? here;
    const prev = steps[i - 1] ?? here;
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    if (!roomAt(map, here)) continue;
    const angle = dx === 0 && dy === 0 ? -Math.PI / 2 : Math.atan2(dy, dx);
    const left = i % 2 === 0;
    const side = left ? -1 : 1;
    out.push({
      x: here.x + 0.5 + -Math.sin(angle) * SIDE_OFFSET * side,
      y: here.y + 0.5 + Math.cos(angle) * SIDE_OFFSET * side,
      angle,
      left,
      age: n <= 1 ? 0 : (n - 1 - i) / n,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run the test and typecheck**

Run: `npx vitest run tests/render/token.test.ts && npm run typecheck`
Expected: all tests in the file PASS; typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add src/render/token.ts tests/render/token.test.ts
git commit -m "feat(render): token path interpolation and footprints"
```

### Task 13: Theme type, Classic theme, and layer drawing

**Files:**
- Create: `src/render/theme.ts`
- Create: `src/systems/dungeon/classic.ts`
- Create: `src/render/draw.ts`

This task adds the canvas drawing for each layer and the Classic theme. These functions draw pixels, so they are checked visually in Task 15 rather than unit-tested. A few points about them:
- Text is drawn at 100× scale and scaled back down, because canvas fonts misbehave below 1px.
- Door symbols are original vector drawings.
- A secret door draws as a wall with an "S".
- A lock draws a small padlock just inside the room, filled when locked.

- [ ] **Step 1: Write `src/render/theme.ts`**

```ts
/**
 * Geometry handed to a door-symbol function, in grid units. The context is already
 * translated to the door's centre and rotated so the door runs along the x axis from
 * x = -0.5 to x = 0.5; +y points into the room the door belongs to.
 */
export type DoorSymbol = (ctx: CanvasRenderingContext2D, theme: Theme) => void;

/** Everything visual about a map style. Game systems supply these; the renderer reads them. */
export interface Theme {
  id: string;
  name: string;
  paper: string;
  gridDot: string;
  boundary: string;
  /** Floor shades, picked per square for subtle variation. */
  floor: string[];
  decal: string;
  ink: string;
  hatch: string;
  /** Colour at the wall edge of the inner shadow (fades to transparent). */
  shadow: string;
  accent: string;
  accentFaded: string;
  labelFill: string;
  labelText: string;
  labelFont: string;
  token: string;
  tokenText: string;
  footprint: string;
  /** Wall stroke width in grid units. */
  wallWidth: number;
  /** How far hatching reaches from the floor, in squares. */
  hatchReach: number;
  rockStyle: 'hatch' | 'none';
  doorSymbols: Record<string, DoorSymbol>;
}
```

- [ ] **Step 2: Write `src/systems/dungeon/classic.ts`**

```ts
import type { DoorSymbol, Theme } from '../../render/theme';

// Door symbols are drawn with the door running along x from -0.5 to 0.5 (grid units),
// centred on the wall, with +y pointing into the room. Walls stop at the door's edge.

const LW = 0.045;

function slab(fill: string, depth: number, extra?: (ctx: CanvasRenderingContext2D) => void): DoorSymbol {
  return (ctx, theme) => {
    ctx.fillStyle = fill;
    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = LW;
    ctx.beginPath();
    ctx.rect(-0.36, -depth / 2, 0.72, depth);
    ctx.fill();
    ctx.stroke();
    extra?.(ctx);
    jambs(ctx, theme);
  };
}

function jambs(ctx: CanvasRenderingContext2D, theme: Theme): void {
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = theme.wallWidth;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  for (const x of [-0.5, 0.5]) {
    ctx.moveTo(x, -0.13);
    ctx.lineTo(x, 0.13);
  }
  ctx.stroke();
}

const archway: DoorSymbol = (ctx, theme) => {
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = LW;
  ctx.beginPath();
  ctx.moveTo(-0.5, 0);
  ctx.quadraticCurveTo(0, 0.32, 0.5, 0);
  ctx.stroke();
  jambs(ctx, theme);
};

const curtain: DoorSymbol = (ctx, theme) => {
  ctx.strokeStyle = '#7a3b2e';
  ctx.lineWidth = LW * 1.6;
  ctx.beginPath();
  ctx.moveTo(-0.42, 0);
  for (let i = 0; i < 6; i++) {
    const x = -0.42 + (i + 1) * 0.14;
    ctx.quadraticCurveTo(x - 0.07, i % 2 === 0 ? -0.1 : 0.1, x, 0);
  }
  ctx.stroke();
  jambs(ctx, theme);
};

const portcullis: DoorSymbol = (ctx, theme) => {
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = LW;
  ctx.fillStyle = theme.floor[0] ?? '#fff';
  ctx.beginPath();
  ctx.rect(-0.36, -0.08, 0.72, 0.16);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  for (let i = 1; i < 6; i++) {
    const x = -0.36 + i * 0.12;
    ctx.moveTo(x, -0.08);
    ctx.lineTo(x, 0.08);
  }
  ctx.stroke();
  jambs(ctx, theme);
};

const bands = (ctx: CanvasRenderingContext2D) => {
  ctx.beginPath();
  for (const x of [-0.18, 0, 0.18]) {
    ctx.moveTo(x, -0.09);
    ctx.lineTo(x, 0.09);
  }
  ctx.stroke();
};

const midline = (ctx: CanvasRenderingContext2D) => {
  ctx.beginPath();
  ctx.moveTo(-0.36, 0);
  ctx.lineTo(0.36, 0);
  ctx.stroke();
};

export const classicTheme: Theme = {
  id: 'classic',
  name: 'Classic',
  paper: '#ffffff',
  gridDot: 'rgba(60, 60, 60, 0.35)',
  boundary: 'rgba(60, 60, 60, 0.45)',
  floor: ['#f8f8f6', '#f4f4f1', '#f0f0ec'],
  decal: 'rgba(70, 70, 70, 0.28)',
  ink: '#1b1b1b',
  hatch: '#2a2a2a',
  shadow: 'rgba(0, 0, 0, 0.22)',
  accent: '#1f8a3a',
  accentFaded: 'rgba(31, 138, 58, 0.35)',
  labelFill: '#ffffff',
  labelText: '#1b1b1b',
  labelFont: '"Segoe UI", system-ui, sans-serif',
  token: '#2b2b2b',
  tokenText: '#ffffff',
  footprint: 'rgba(80, 80, 80, 0.7)',
  wallWidth: 0.07,
  hatchReach: 1.6,
  rockStyle: 'hatch',
  doorSymbols: {
    archway,
    wooden: slab('#9a6a3a', 0.18),
    metal: slab('#9aa1a8', 0.16, midline),
    reinforced: slab('#7b5530', 0.2, bands),
    curtain,
    portcullis,
    stoneSlab: slab('#6f6f6f', 0.26),
  },
};
```

- [ ] **Step 3: Write `src/render/draw.ts`**

```ts
// Canvas drawing for each layer. Every function expects the context to be transformed so
// that one unit = one grid square. These are not unit-tested; they are checked visually.
import type { DungeonMap, Feature } from '../core/types';
import { worldBounds } from './camera';
import type { DoorGlyph, ExitStub } from './doors';
import type { Decal, FloorTile } from './floor';
import type { Stroke } from './hatching';
import type { LabelBox } from './labels';
import { mulberry32 } from './rng';
import type { Theme } from './theme';
import type { Footprint } from './token';
import type { Segment, ShadowEdge } from './walls';

export const LABEL_FONT_SIZE = 0.34;
export const LABEL_PAD_X = 0.1;
export const LABEL_PAD_Y = 0.06;

/** Canvas fonts misbehave below 1px, so text is drawn at 100× and scaled back down. */
const TEXT_SCALE = 100;

export function fillText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  font: string,
  weight = '',
): void {
  ctx.save();
  ctx.scale(1 / TEXT_SCALE, 1 / TEXT_SCALE);
  ctx.font = `${weight} ${size * TEXT_SCALE}px ${font}`.trim();
  ctx.fillText(text, x * TEXT_SCALE, y * TEXT_SCALE);
  ctx.restore();
}

/** Width of `text` in grid units at `size` grid units. */
export function measureText(ctx: CanvasRenderingContext2D, text: string, size: number, font: string): number {
  ctx.save();
  ctx.font = `${size * TEXT_SCALE}px ${font}`;
  const w = ctx.measureText(text).width / TEXT_SCALE;
  ctx.restore();
  return w;
}

export function drawPaper(ctx: CanvasRenderingContext2D, map: DungeonMap, theme: Theme, grid: boolean): void {
  const b = worldBounds(map);
  ctx.fillStyle = theme.paper;
  ctx.fillRect(b.x - 2, b.y - 2, b.w + 4, b.h + 4);
  if (grid) {
    ctx.fillStyle = theme.gridDot;
    for (let y = b.y; y <= b.y + b.h; y++) {
      for (let x = b.x; x <= b.x + b.w; x++) {
        ctx.beginPath();
        ctx.arc(x, y, 0.03, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.save();
  ctx.strokeStyle = theme.boundary;
  ctx.lineWidth = 0.025;
  ctx.setLineDash([0.08, 0.08]);
  ctx.strokeRect(0, 0, map.width, map.height);
  ctx.restore();
}

export function drawHatching(ctx: CanvasRenderingContext2D, strokes: Stroke[], theme: Theme): void {
  ctx.strokeStyle = theme.hatch;
  ctx.lineWidth = 0.016;
  ctx.lineCap = 'round';
  // Batch by alpha to keep this fast with thousands of strokes.
  const byAlpha = new Map<number, Stroke[]>();
  for (const s of strokes) {
    const a = Math.round(s.alpha * 10) / 10;
    const list = byAlpha.get(a) ?? [];
    list.push(s);
    byAlpha.set(a, list);
  }
  for (const [alpha, list] of byAlpha) {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    for (const s of list) {
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

export function drawFloors(ctx: CanvasRenderingContext2D, tiles: FloorTile[], theme: Theme): void {
  for (const t of tiles) {
    ctx.fillStyle = theme.floor[t.shade] ?? theme.floor[0] ?? '#fff';
    // Slight overdraw hides hairline seams between tiles.
    ctx.fillRect(t.x - 0.005, t.y - 0.005, 1.01, 1.01);
  }
}

export function drawDecals(ctx: CanvasRenderingContext2D, decals: Decal[], theme: Theme): void {
  ctx.strokeStyle = theme.decal;
  ctx.fillStyle = theme.decal;
  ctx.lineWidth = 0.018;
  ctx.lineCap = 'round';
  for (const d of decals) {
    const rng = mulberry32(d.seed);
    ctx.save();
    ctx.translate(d.x, d.y);
    ctx.rotate(d.angle);
    if (d.kind === 'crack') {
      ctx.beginPath();
      ctx.moveTo(-d.size, 0);
      let x = -d.size;
      while (x < d.size) {
        x += d.size / 3;
        ctx.lineTo(x, (rng() - 0.5) * d.size * 0.6);
      }
      ctx.stroke();
    } else if (d.kind === 'stain') {
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.ellipse(0, 0, d.size, d.size * (0.6 + rng() * 0.4), 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc((rng() - 0.5) * d.size * 1.5, (rng() - 0.5) * d.size * 1.5, 0.02 + rng() * 0.02, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

export function drawShadows(ctx: CanvasRenderingContext2D, shadows: ShadowEdge[], theme: Theme): void {
  const depth = 0.32;
  for (const { seg, inward } of shadows) {
    const horizontal = seg.y1 === seg.y2;
    const sign = inward === 'S' || inward === 'E' ? 1 : -1;
    const x0 = horizontal ? seg.x1 : seg.x1;
    const y0 = horizontal ? seg.y1 : seg.y1;
    const g = horizontal
      ? ctx.createLinearGradient(0, y0, 0, y0 + depth * sign)
      : ctx.createLinearGradient(x0, 0, x0 + depth * sign, 0);
    g.addColorStop(0, theme.shadow);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    if (horizontal) ctx.fillRect(seg.x1, Math.min(y0, y0 + depth * sign), seg.x2 - seg.x1, depth);
    else ctx.fillRect(Math.min(x0, x0 + depth * sign), seg.y1, depth, seg.y2 - seg.y1);
  }
}

export function drawWalls(ctx: CanvasRenderingContext2D, segments: Segment[], theme: Theme): void {
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = theme.wallWidth;
  ctx.lineCap = 'square';
  ctx.beginPath();
  for (const s of segments) {
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
  }
  ctx.stroke();
}

export function drawDoors(ctx: CanvasRenderingContext2D, glyphs: DoorGlyph[], theme: Theme): void {
  for (const g of glyphs) {
    ctx.save();
    ctx.translate(g.cx, g.cy);
    ctx.rotate(g.rotation);
    if (g.secret) {
      // A secret door reads as wall with an "S".
      ctx.strokeStyle = theme.ink;
      ctx.lineWidth = theme.wallWidth;
      ctx.beginPath();
      ctx.moveTo(-0.5, 0);
      ctx.lineTo(0.5, 0);
      ctx.stroke();
      ctx.rotate(-g.rotation);
      ctx.fillStyle = theme.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      fillText(ctx, 'S', 0, 0.02, 0.3, theme.labelFont, 'bold');
    } else {
      (theme.doorSymbols[g.type] ?? theme.doorSymbols.archway)?.(ctx, theme);
    }
    ctx.restore();
    if (g.locked !== null) drawLock(ctx, g, theme);
  }
}

function drawLock(ctx: CanvasRenderingContext2D, g: DoorGlyph, theme: Theme): void {
  ctx.save();
  ctx.translate(g.cx, g.cy);
  ctx.rotate(g.rotation);
  ctx.translate(0, 0.26);
  ctx.rotate(-g.rotation);
  ctx.strokeStyle = theme.ink;
  ctx.lineWidth = 0.03;
  ctx.beginPath();
  ctx.arc(0, -0.04, 0.05, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = g.locked ? theme.ink : theme.paper;
  ctx.fillRect(-0.075, -0.04, 0.15, 0.11);
  ctx.strokeRect(-0.075, -0.04, 0.15, 0.11);
  ctx.restore();
}

export function drawExitStubs(ctx: CanvasRenderingContext2D, stubs: ExitStub[], theme: Theme, faded: Set<string>): void {
  for (const s of stubs) {
    const colour = faded.has(s.doorId) ? theme.accentFaded : theme.accent;
    ctx.strokeStyle = colour;
    ctx.fillStyle = colour;
    ctx.lineWidth = 0.06;
    ctx.beginPath();
    ctx.moveTo(s.cx, s.cy);
    ctx.lineTo(s.cx + s.dx * 0.55, s.cy + s.dy * 0.55);
    ctx.stroke();
    ctx.fillRect(s.cx - 0.1, s.cy - 0.1, 0.2, 0.2);
  }
}

export function drawFeatures(ctx: CanvasRenderingContext2D, features: Feature[], theme: Theme): void {
  ctx.strokeStyle = theme.ink;
  ctx.fillStyle = theme.ink;
  ctx.lineWidth = 0.035;
  for (const f of features) {
    if (f.kind === 'stairs') {
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const y = f.y + 0.18 + i * 0.16;
        const inset = f.dir === 'down' ? i * 0.04 : (4 - i) * 0.04;
        ctx.moveTo(f.x + 0.15 + inset, y);
        ctx.lineTo(f.x + 0.85 - inset, y);
      }
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(f.x + 0.5, f.y + 0.4, 0.12, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(f.x + 0.5, f.y + 0.5);
      ctx.lineTo(f.x + 0.5, f.y + 0.78);
      ctx.stroke();
    }
  }
}

export function drawLabels(ctx: CanvasRenderingContext2D, boxes: LabelBox[], theme: Theme): void {
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  for (const b of boxes) {
    ctx.fillStyle = theme.labelFill;
    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = 0.025;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = theme.labelText;
    fillText(ctx, b.text, b.x + LABEL_PAD_X, b.y + b.h / 2 + 0.01, LABEL_FONT_SIZE, theme.labelFont);
  }
}

export function drawFootprints(ctx: CanvasRenderingContext2D, prints: Footprint[], theme: Theme): void {
  ctx.fillStyle = theme.footprint;
  for (const p of prints) {
    ctx.save();
    ctx.globalAlpha = 1 - p.age * 0.75;
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.beginPath();
    ctx.ellipse(0.03, 0, 0.09, 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-0.1, 0, 0.042, 0.036, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

export function drawToken(ctx: CanvasRenderingContext2D, x: number, y: number, theme: Theme, time: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(time / 300);
  ctx.fillStyle = theme.token;
  ctx.globalAlpha = 0.15 + 0.15 * pulse;
  ctx.beginPath();
  ctx.arc(x, y, 0.28 + 0.08 * pulse, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.arc(x, y, 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = theme.tokenText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  fillText(ctx, 'P', x, y + 0.015, 0.26, theme.labelFont, 'bold');
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/render/theme.ts src/systems/dungeon/classic.ts src/render/draw.ts
git commit -m "feat(render): Classic theme and layer drawing"
```

### Task 14: Map renderer

**Files:**
- Create: `src/render/renderer.ts`

`MapRenderer` works as follows:
- Static layers (paper through labels) are rendered into an offscreen cache, at a resolution matched to the zoom level in ×√2 buckets.
- The cache is rebuilt only when the map, theme, toggles or zoom bucket change. Panning never re-renders.
- Each frame blits the cache, then draws footprints and the pulsing token.
- `walkToken(path, onDone)` animates the token, then calls `onDone` so the caller can commit `moveToken`.
- `renderStatic` is exported so Plan 4's PNG export can reuse it.

- [ ] **Step 1: Write `src/render/renderer.ts`**

```ts
import { perimeterEdges, sameEdge } from '../core/geometry';
import { roomAt } from '../core/query';
import type { Cell, DungeonMap } from '../core/types';
import { type Camera, fitCamera, worldBounds } from './camera';
import { doorGlyphs, exitStubs } from './doors';
import {
  drawDecals,
  drawDoors,
  drawExitStubs,
  drawFeatures,
  drawFloors,
  drawFootprints,
  drawHatching,
  drawLabels,
  drawPaper,
  drawShadows,
  drawToken,
  drawWalls,
  LABEL_FONT_SIZE,
  LABEL_PAD_X,
  LABEL_PAD_Y,
  measureText,
} from './draw';
import { floorDecals, floorTiles } from './floor';
import { hatchStrokes } from './hatching';
import { type MeasureText, placeLabels } from './labels';
import type { Theme } from './theme';
import { footprints, pathPosition } from './token';
import { wallSegments, wallShadows } from './walls';

export interface DisplayToggles {
  grid: boolean;
  shadows: boolean;
  hatching: boolean;
  decals: boolean;
  footprints: boolean;
  token: boolean;
}

export const DEFAULT_TOGGLES: DisplayToggles = {
  grid: true,
  shadows: true,
  hatching: true,
  decals: true,
  footprints: true,
  token: true,
};

/** Squares per second when the token walks. */
export const WALK_SPEED = 4;

/** A label measurer backed by a canvas context. */
export function canvasMeasure(ctx: CanvasRenderingContext2D, theme: Theme): MeasureText {
  return (text) => ({
    w: measureText(ctx, text, LABEL_FONT_SIZE, theme.labelFont) + LABEL_PAD_X * 2,
    h: LABEL_FONT_SIZE + LABEL_PAD_Y * 2,
  });
}

/**
 * Draw everything that doesn't animate (paper → labels) in world units. Used for the
 * on-screen cache and, later, PNG export. The context must already map 1 unit = 1 square.
 */
export function renderStatic(ctx: CanvasRenderingContext2D, map: DungeonMap, theme: Theme, toggles: DisplayToggles): void {
  drawPaper(ctx, map, theme, toggles.grid);
  if (toggles.hatching && theme.rockStyle === 'hatch') drawHatching(ctx, hatchStrokes(map, theme.hatchReach), theme);
  drawFloors(ctx, floorTiles(map, theme.floor.length), theme);
  if (toggles.decals) drawDecals(ctx, floorDecals(map), theme);
  if (toggles.shadows) drawShadows(ctx, wallShadows(map), theme);
  drawWalls(ctx, wallSegments(map), theme);
  drawDoors(ctx, doorGlyphs(map), theme);
  drawExitStubs(ctx, exitStubs(map), theme, fadedExits(map));
  drawFeatures(ctx, map.features, theme);
  drawLabels(ctx, placeLabels(map, canvasMeasure(ctx, theme)), theme);
}

/** Open exits not on the walls of the room the token stands in are drawn faded. */
export function fadedExits(map: DungeonMap): Set<string> {
  const here = map.token ? roomAt(map, map.token) : undefined;
  const edges = here ? perimeterEdges(here) : [];
  return new Set(map.doors.filter((d) => !edges.some((p) => sameEdge(p.edge, d))).map((d) => d.id));
}

interface Walk {
  path: Cell[];
  start: number;
  onDone: () => void;
}

/**
 * Draws a map onto a canvas. Static layers are rendered once into an offscreen cache at a
 * resolution matched to the zoom level (rebuilt when the map, theme, toggles or zoom
 * bucket change); each frame just blits the cache and draws footprints and the token.
 */
export class MapRenderer {
  private ctx: CanvasRenderingContext2D;
  private map: DungeonMap | null = null;
  private toggles: DisplayToggles = { ...DEFAULT_TOGGLES };
  private cam: Camera = { x: 0, y: 0, scale: 24 };
  private dpr = 1;
  private cache: HTMLCanvasElement | null = null;
  private cacheScale = 0;
  private cacheDirty = true;
  private walk: Walk | null = null;
  private frame = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private theme: Theme,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D is not available');
    this.ctx = ctx;
  }

  get camera(): Camera {
    return this.cam;
  }

  setMap(map: DungeonMap): void {
    if (map === this.map) return;
    this.map = map;
    this.cacheDirty = true;
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.cacheDirty = true;
  }

  setToggles(toggles: DisplayToggles): void {
    this.toggles = { ...toggles };
    this.cacheDirty = true;
  }

  setCamera(cam: Camera): void {
    this.cam = cam;
  }

  /** Size the canvas backing store to its CSS size × devicePixelRatio. */
  resize(cssW: number, cssH: number, dpr: number): void {
    this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
  }

  fit(): void {
    if (!this.map) return;
    this.cam = fitCamera(worldBounds(this.map), this.canvas.width / this.dpr, this.canvas.height / this.dpr);
  }

  /** Animate the token along `path` (starting at the token), then call onDone to commit the move. */
  walkToken(path: Cell[], onDone: () => void): void {
    this.walk = { path, start: performance.now(), onDone };
  }

  get walking(): boolean {
    return this.walk !== null;
  }

  start(): void {
    const loop = (t: number) => {
      this.draw(t);
      this.frame = requestAnimationFrame(loop);
    };
    this.frame = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.frame);
  }

  private draw(time: number): void {
    const { ctx, map } = this;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#e9e9e6';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!map) return;
    this.ensureCache();
    const s = this.cam.scale * this.dpr;
    ctx.setTransform(s, 0, 0, s, -this.cam.x * s, -this.cam.y * s);
    const b = worldBounds(map);
    if (this.cache) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.cache, b.x - 1, b.y - 1, b.w + 2, b.h + 2);
    }
    this.drawDynamic(map, time);
  }

  private drawDynamic(map: DungeonMap, time: number): void {
    const token = map.token;
    if (!token) return;
    let pos = { x: token.x + 0.5, y: token.y + 0.5 };
    let trail = token.trail;
    let at: Cell = token;
    if (this.walk) {
      const travelled = ((time - this.walk.start) / 1000) * WALK_SPEED;
      const p = pathPosition(this.walk.path, travelled);
      pos = p;
      const passed = Math.min(this.walk.path.length - 1, Math.floor(travelled));
      trail = [...token.trail, ...this.walk.path.slice(0, passed)];
      at = this.walk.path[passed]!;
      if (p.done) {
        const done = this.walk.onDone;
        this.walk = null;
        done();
      }
    }
    if (this.toggles.footprints) drawFootprints(this.ctx, footprints(map, trail, at), this.theme);
    if (this.toggles.token) drawToken(this.ctx, pos.x, pos.y, this.theme, time);
  }

  /** Zoom levels are bucketed (×√2 steps) so panning never re-renders and zooming rarely does. */
  private ensureCache(): void {
    const map = this.map;
    if (!map) return;
    const wanted = Math.min(96, Math.pow(Math.SQRT2, Math.ceil(Math.log(this.cam.scale * this.dpr) / Math.log(Math.SQRT2))));
    if (!this.cacheDirty && this.cache && wanted === this.cacheScale) return;
    const b = worldBounds(map);
    const maxPx = 8192;
    const scale = Math.min(wanted, maxPx / (b.w + 2), maxPx / (b.h + 2));
    const cache = this.cache ?? document.createElement('canvas');
    cache.width = Math.ceil((b.w + 2) * scale);
    cache.height = Math.ceil((b.h + 2) * scale);
    const cctx = cache.getContext('2d');
    if (!cctx) return;
    cctx.setTransform(scale, 0, 0, scale, -(b.x - 1) * scale, -(b.y - 1) * scale);
    renderStatic(cctx, map, this.theme, this.toggles);
    this.cache = cache;
    this.cacheScale = wanted;
    this.cacheDirty = false;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/render/renderer.ts
git commit -m "feat(render): cached map renderer with token animation"
```

### Task 15: Demo map viewer and visual check

**Files:**
- Create: `src/app/demo.ts`
- Create: `scripts/screenshot.mjs`
- Modify: `src/App.svelte`

This task builds a viewer on a demo dungeon assembled from the real play-flow commands. The demo uses every door type, a secret door, two locks, stairs, a note, passages, a room clipped by the boundary, and a long label that has to move outside its room. The viewer supports wheel zoom, drag pan, Fit, display toggles and "Walk token". Real interaction arrives in Plan 3.

The expected result is committed as `docs/superpowers/plans/2026-10-31-plan-2-expected.png`.

- [ ] **Step 1: Write `src/app/demo.ts`**

```ts
// A sample dungeon built with the real play-flow commands, so the viewer has something to
// draw before the interactive UI exists (Plan 3). Exercises every door type, a secret
// door, a lock, stairs, a note, a clipped room, passages and a long label.
import { createMap } from '../core/campaign';
import { addFeature, updateDoor } from '../core/commands';
import { History } from '../core/history';
import { randomId } from '../core/ids';
import { evaluatePlacement } from '../core/placement';
import { createRoomFromExit, newRoom, placeEntrance } from '../core/playflow';
import { doorAt } from '../core/query';
import type { DungeonMap, Edge } from '../core/types';
import { dungeonSystem } from '../systems/dungeon';

function must<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`Demo map: ${what}`);
  return v;
}

/** Add a room beyond the open exit at `exit`, with the given exits. */
function room(
  h: History,
  exit: Edge,
  w: number,
  hgt: number,
  offset: number,
  type: string,
  exits: Edge[],
  opts: { passages?: boolean; exitType?: string } = {},
): void {
  const door = must(doorAt(h.map, exit), `no door at ${JSON.stringify(exit)}`);
  const placement = evaluatePlacement(h.map, door, w, hgt, offset);
  if (!placement.ok || !placement.rect) throw new Error(`Demo map: ${placement.reason}`);
  const r = newRoom(h.map, placement.rect, door, randomId);
  const result = h.execute(
    createRoomFromExit(
      h.map,
      {
        room: { ...r, label: { type, unique: false, narrative: '' } },
        exits,
        exitType: opts.exitType ?? 'archway',
        passages: opts.passages ?? false,
      },
      randomId,
    ),
  );
  if (!result.ok) throw new Error(`Demo map: ${result.reason}`);
}

function retype(h: History, edge: Edge, patch: Partial<{ type: string; secret: boolean; lock: { locked: boolean; note: string } }>): void {
  const d = must(doorAt(h.map, edge), `no door at ${JSON.stringify(edge)}`);
  h.execute(updateDoor(d, { ...d, ...patch }));
}

export function demoMap(): DungeonMap {
  const h = new History(createMap(dungeonSystem, { width: 20, height: 16, seed: 42, title: 'Demo' }));
  h.execute(placeEntrance(h.map, dungeonSystem, { x: 9, y: 16 }, randomId));
  // Room 1: Guard Room above the entrance, with three exits on passages.
  room(h, { x: 9, y: 16, side: 'N' }, 6, 3, 2, 'Guard Room', [
    { x: 8, y: 13, side: 'N' },
    { x: 7, y: 14, side: 'W' },
    { x: 13, y: 15, side: 'W' },
  ], { passages: true });
  // Room 2: Shrine north of the first passage.
  room(h, { x: 8, y: 12, side: 'N' }, 5, 4, 1, 'Shrine', [{ x: 7, y: 9, side: 'W' }, { x: 9, y: 8, side: 'N' }]);
  // Room 3: a narrow room whose label must move outside.
  room(h, { x: 6, y: 14, side: 'W' }, 2, 2, 1, 'Collapsed Armoury', []);
  // Room 4: west of the Shrine.
  room(h, { x: 7, y: 9, side: 'W' }, 3, 3, 1, 'Crypt', []);
  // Room 5: a tall hall behind a secret door.
  room(h, { x: 9, y: 8, side: 'N' }, 4, 6, 1, 'Great Hall', [{ x: 12, y: 3, side: 'W' }]);
  // Room 6: rolled 3×2 but clipped to 3×1 by the Outer Boundary.
  room(h, { x: 14, y: 15, side: 'W' }, 3, 2, 0, 'Store', []);

  retype(h, { x: 9, y: 16, side: 'N' }, { type: 'portcullis' });
  retype(h, { x: 8, y: 13, side: 'N' }, { type: 'wooden' });
  retype(h, { x: 8, y: 12, side: 'N' }, { type: 'metal' });
  retype(h, { x: 7, y: 14, side: 'W' }, { type: 'curtain' });
  retype(h, { x: 6, y: 14, side: 'W' }, { type: 'reinforced', lock: { locked: true, note: 'Rusted shut' } });
  retype(h, { x: 7, y: 9, side: 'W' }, { type: 'stoneSlab' });
  retype(h, { x: 9, y: 8, side: 'N' }, { secret: true });
  retype(h, { x: 14, y: 15, side: 'W' }, { type: 'wooden', lock: { locked: false, note: '' } });

  h.execute(addFeature({ id: randomId(), kind: 'stairs', x: 10, y: 3, dir: 'down' }));
  h.execute(addFeature({ id: randomId(), kind: 'note', x: 4, y: 9, text: 'Bones' }));
  return h.map;
}
```

- [ ] **Step 2: Write `src/App.svelte`**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { demoMap } from './app/demo';
  import { findPath } from './core/pathfinding';
  import { moveToken } from './core/token';
  import type { DungeonMap } from './core/types';
  import { panBy, zoomAt } from './render/camera';
  import { DEFAULT_TOGGLES, type DisplayToggles, MapRenderer } from './render/renderer';
  import { classicTheme } from './systems/dungeon/classic';

  let canvas: HTMLCanvasElement;
  let renderer: MapRenderer | null = null;
  let map: DungeonMap = demoMap();
  let toggles: DisplayToggles = $state({ ...DEFAULT_TOGGLES });
  let drag: { x: number; y: number } | null = null;

  const toggleNames = Object.keys(DEFAULT_TOGGLES) as (keyof DisplayToggles)[];

  onMount(() => {
    const r = new MapRenderer(canvas, classicTheme);
    renderer = r;
    r.setMap(map);
    const size = () => {
      r.resize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio || 1);
    };
    size();
    r.fit();
    r.start();
    const onResize = () => size();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      r.stop();
    };
  });

  $effect(() => {
    renderer?.setToggles({ ...toggles });
  });

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    if (!renderer) return;
    const rect = canvas.getBoundingClientRect();
    renderer.setCamera(zoomAt(renderer.camera, Math.exp(-e.deltaY * 0.0015), { x: e.clientX - rect.left, y: e.clientY - rect.top }));
  }

  function onPointerDown(e: PointerEvent) {
    drag = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    if (!drag || !renderer) return;
    renderer.setCamera(panBy(renderer.camera, e.clientX - drag.x, e.clientY - drag.y));
    drag = { x: e.clientX, y: e.clientY };
  }

  function onPointerUp() {
    drag = null;
  }

  /** Walk the token to a random reachable floor square. */
  function wander() {
    const token = map.token;
    if (!renderer || renderer.walking || !token) return;
    const floor = map.rooms.flatMap((room) =>
      Array.from({ length: room.w * room.h }, (_, i) => ({ x: room.x + (i % room.w), y: room.y + Math.floor(i / room.w) })),
    );
    for (let tries = 0; tries < 20; tries++) {
      const target = floor[Math.floor(Math.random() * floor.length)]!;
      const path = findPath(map, token, target);
      const cmd = path && moveToken(map, path);
      if (!path || !cmd) continue;
      renderer.walkToken(path, () => {
        map = cmd.apply(map);
        renderer?.setMap(map);
      });
      return;
    }
  }
</script>

<main>
  <canvas
    bind:this={canvas}
    onwheel={onWheel}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
  ></canvas>
  <div class="panel">
    <button onclick={() => renderer?.fit()}>Fit</button>
    <button onclick={wander}>Walk token</button>
    {#each toggleNames as name (name)}
      <label><input type="checkbox" bind:checked={toggles[name]} /> {name}</label>
    {/each}
  </div>
</main>

<style>
  :global(html, body) {
    margin: 0;
    height: 100%;
    font-family: system-ui, sans-serif;
  }
  main {
    position: fixed;
    inset: 0;
  }
  canvas {
    width: 100%;
    height: 100%;
    display: block;
    touch-action: none;
  }
  .panel {
    position: absolute;
    top: 8px;
    left: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    background: rgba(255, 255, 255, 0.9);
    padding: 6px 10px;
    border-radius: 6px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2);
    font-size: 14px;
  }
  button {
    min-height: 32px;
  }
</style>
```

- [ ] **Step 3: Write `scripts/screenshot.mjs`**

```js
// Usage: node scripts/screenshot.mjs <url> <out.png> [width] [height]
// Opens the app in headless Firefox and saves a screenshot, for visual checks.
import { firefox } from 'playwright';

const [url = 'http://localhost:5173', out = 'screenshot.png', w = '1400', h = '900'] = process.argv.slice(2);
const browser = await firefox.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.screenshot({ path: out });
await browser.close();
if (errors.length) {
  console.error('Page errors:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`Saved ${out}`);
```

- [ ] **Step 4: Typecheck and build**

Run: `npm run typecheck && npx vite build`
Expected: clean; build succeeds.

- [ ] **Step 5: Visual check**

Start the dev server in the background, then take a screenshot. Save it **outside the repo**:

```bash
npx vite --port 5173 --strictPort &
sleep 4
node scripts/screenshot.mjs http://localhost:5173 /tmp/plan2-check.png
```

Expected: `Saved /tmp/plan2-check.png` and no `Page errors`. Open both `/tmp/plan2-check.png` and `docs/superpowers/plans/2026-10-31-plan-2-expected.png`. They should match: same rooms, labels, door symbols, hatching and token at the entrance. The fine hatching strokes are seeded, so they should be identical too. Confirm specifically:
- "3 - Collapsed Armoury" sits outside its small room.
- The "S" of the secret door below "5 - Great Hall" is not covered by the label.
- "6 - Store" is clipped to one square tall.
- The Great Hall's east open exit shows a faded green stub.

When done, stop the dev server (`kill %1`, or kill the vite process you started).

- [ ] **Step 6: Commit**

```bash
git add src/app/demo.ts src/App.svelte scripts/screenshot.mjs
git commit -m "feat(app): demo map viewer"
```

### Task 16: Final verification

- [ ] **Step 1: Full suite, typecheck, build**

Run: `npm test && npm run typecheck && npx vite build`
Expected: **19 test files, 172 tests pass**; `svelte-check found 0 errors and 0 warnings`; build succeeds.

- [ ] **Step 2: Layering checks**

Run: `grep -rnE "from '\.\./(render|app|systems)|svelte|document|window|HTMLCanvas" src/core || echo CORE-CLEAN`
Expected: `CORE-CLEAN`. The core imports nothing from rendering or the UI.

- [ ] **Step 3: Private files**

Run: `git ls-files | grep -E "^(pdf|local-data|reference|\.superpowers)/" || echo PRIVATE-CLEAN`
Expected: `PRIVATE-CLEAN`

- [ ] **Step 4: Clean tree**

Run: `git status --short`
Expected: empty. If not, commit what remains with `git commit -m "chore: finish Plan 2"`.
