# Plan 1 — Project Scaffold & Game Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the TypeScript project and build the complete, unit-tested, UI-free game core for the 2D6 map editor: data model, grid geometry, 2D6 Dungeon placement rules, reversible commands with validated undo/redo, play-flow command builders, A* token pathfinding, and versioned JSON serialization.

**Architecture:** Pure TypeScript modules under `src/core/` with no DOM/canvas/Svelte imports. The map is an immutable value; every change is a `Command` with pure `apply`/`undo`. `History` applies commands, rejects any that break map invariants (`checkInvariants`), and manages undo/redo. Game-specific constants come from a `GameSystem` object (`src/systems/dungeon/`). Walls and open exits are derived, never stored.

**Tech Stack:** TypeScript 5.7, Vitest 2.1 (globals mode), Node 24. (Vite + Svelte arrive in Plan 2.)

**Spec:** `docs/superpowers/specs/2026-10-31-map-editor-core-design.md`

**This is Plan 1 of 4:**
1. **Scaffold & game core** (this plan)
2. Renderer & Classic theme (canvas viewer for a map)
3. Interaction & UI (play flow, edit tools, token, touch)
4. Persistence, PNG export, PWA, e2e tests

**Deviation from spec (intentional):** the spec's `GameSystem` lists `themes: Theme[]` (with draw functions). To honour the spec's own rule that `core/` never touches the canvas, core's `GameSystem` carries only `defaultThemeId`; Plan 2 adds a render-side theme registry keyed by system id.

---

## Conventions

- Coordinates are integer grid squares: x right, y down, (0,0) = top-left square **inside** the Outer Boundary. The entrance sits one square outside (for Dungeon: `y = height`).
- An `Edge` is stored canonically as the **N** or **W** side of square `(x,y)`. Use `cellEdge(cell, dir)` to get one from any side.
- Tests use `sequentialIds()` for deterministic ids; production uses `randomId` (`crypto.randomUUID`).
- Run single files with `npx vitest run tests/core/<file>.test.ts`.
- Commit after every task.

## File structure

| File | Responsibility |
|------|----------------|
| `package.json`, `tsconfig.json`, `vitest.config.ts` | Tooling |
| `src/core/types.ts` | All data-model types (Campaign, DungeonMap, Room, Door, Feature, Token, Edge, Rect…) |
| `src/core/system.ts` | `GameSystem` interface (rules-facing only) |
| `src/systems/dungeon/index.ts` | The 2D6 Dungeon system definition |
| `src/core/ids.ts` | Id generators (random + sequential for tests) |
| `src/core/campaign.ts` | `createMap`, `createCampaign`, `CURRENT_SCHEMA_VERSION` |
| `src/core/geometry.ts` | Rect/edge maths: overlap, clip, canonical edges, boundary test, perimeter |
| `src/core/query.ts` | Read-only lookups: room/door at, open exits, derived walls, next room number |
| `src/core/rules.ts` | Game rules: exit direction, ghost rect, placement evaluation (clip/overlap), valid exit squares, entrance squares, map invariants |
| `src/core/commands.ts` | `Command` type + add/remove/update for rooms, doors, features; token; map info; `compound`; `deleteRoom` |
| `src/core/history.ts` | Validated execute, undo/redo, cap, subscribe |
| `src/core/playflow.ts` | Command builders for the guided flow: `placeEntrance`, `newRoom`, `createRoomFromExit` |
| `src/core/pathfinding.ts` | `canStep`, A* `findPath` |
| `src/core/token.ts` | `moveToken` (trail capped at 200) |
| `src/core/serialize.ts` | `serializeCampaign`, `parseCampaign` with validation + migrations |
| `tests/core/fixtures.ts` | Test helpers: `emptyMap`, `room`, `door`, `withContent` |
| `tests/core/*.test.ts` | One test file per module |

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`

`.gitignore` already exists (it ignores `node_modules/`, `dist/`, `pdf/`, `local-data/`, `reference/`, `.superpowers/`). Do not change it.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "2d6-map-maker",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "5.7.2",
    "vitest": "2.1.8"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Install and verify the toolchain**

Run: `npm install && npx vitest run`
Expected: install succeeds; Vitest reports `No test files found` (exit code 1 is expected at this point).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts
git commit -m "chore: scaffold TypeScript + Vitest project"
```


### Task 2: Data model, game system, and campaign factory

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/system.ts`
- Create: `src/systems/dungeon/index.ts`
- Create: `src/core/ids.ts`
- Create: `src/core/campaign.ts`
- Test: `tests/core/campaign.test.ts`

The dungeon system encodes the rules agreed in the spec: entrance on the bottom (`S`) edge, 25×25 default, each room dimension 1–6 (one die each — red = width, blue = height), up to 3 exits, 7 door types.

- [ ] **Step 1: Write the failing test**

Create `tests/core/campaign.test.ts`:

```ts
import { createCampaign, createMap, CURRENT_SCHEMA_VERSION } from '../../src/core/campaign';
import { sequentialIds } from '../../src/core/ids';
import { dungeonSystem } from '../../src/systems/dungeon';

describe('createMap', () => {
  it('uses the system defaults', () => {
    const m = createMap(dungeonSystem, { seed: 3, newId: sequentialIds('m') });
    expect(m).toEqual({
      id: 'm-1',
      title: '',
      hero: '',
      level: '',
      width: 25,
      height: 25,
      themeId: 'classic',
      defaultDoorType: 'archway',
      seed: 3,
      rooms: [],
      doors: [],
      features: [],
      token: null,
    });
  });
  it('accepts overrides', () => {
    const m = createMap(dungeonSystem, { width: 12, height: 8, title: 'Level 1' });
    expect(m).toMatchObject({ width: 12, height: 8, title: 'Level 1' });
  });
});

describe('createCampaign', () => {
  it('wraps one active map and reserves the hero slot', () => {
    const c = createCampaign(dungeonSystem, 'My run', { newId: sequentialIds('c') });
    expect(c.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(c.systemId).toBe('dungeon');
    expect(c.maps).toHaveLength(1);
    expect(c.activeMapId).toBe(c.maps[0]!.id);
    expect(c.hero).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/campaign.test.ts`
Expected: FAIL — cannot resolve `../../src/core/campaign`

- [ ] **Step 3: Implement `src/core/types.ts`**

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

- [ ] **Step 4: Implement `src/core/system.ts`**

```ts
import type { Direction } from './types';

export interface DoorTypeDef {
  id: string;
  name: string;
}

/**
 * The rules-facing part of a game system. Rendering concerns (themes, symbols)
 * are registered separately by the render layer so core stays canvas-free.
 */
export interface GameSystem {
  id: string;
  name: string;
  doorTypes: DoorTypeDef[];
  defaultDoorType: string;
  defaultThemeId: string;
  /** Map edge the entrance sits outside of. */
  entranceEdge: Direction;
  defaultMapSize: { width: number; height: number };
  /** Inclusive range for each room dimension (one die each). */
  roomDieRange: { min: number; max: number };
  maxExits: number;
}
```

- [ ] **Step 5: Implement `src/systems/dungeon/index.ts`**

```ts
import type { GameSystem } from '../../core/system';

export const dungeonSystem: GameSystem = {
  id: 'dungeon',
  name: '2D6 Dungeon',
  doorTypes: [
    { id: 'archway', name: 'Archway' },
    { id: 'wooden', name: 'Wooden door' },
    { id: 'metal', name: 'Metal door' },
    { id: 'reinforced', name: 'Reinforced door' },
    { id: 'curtain', name: 'Curtain' },
    { id: 'portcullis', name: 'Portcullis' },
    { id: 'stoneSlab', name: 'Stone slab' },
  ],
  defaultDoorType: 'archway',
  defaultThemeId: 'classic',
  entranceEdge: 'S',
  defaultMapSize: { width: 25, height: 25 },
  roomDieRange: { min: 1, max: 6 },
  maxExits: 3,
};
```

- [ ] **Step 6: Implement `src/core/ids.ts`**

```ts
export type IdFn = () => string;

export const randomId: IdFn = () => crypto.randomUUID();

/** Deterministic ids for tests: prefix-1, prefix-2, ... */
export function sequentialIds(prefix = 'id'): IdFn {
  let n = 0;
  return () => `${prefix}-${++n}`;
}
```

- [ ] **Step 7: Implement `src/core/campaign.ts`**

```ts
import { randomId, type IdFn } from './ids';
import type { GameSystem } from './system';
import type { Campaign, DungeonMap } from './types';

export const CURRENT_SCHEMA_VERSION = 1;

export interface NewMapOptions {
  title?: string;
  hero?: string;
  level?: string;
  width?: number;
  height?: number;
  seed?: number;
  newId?: IdFn;
}

export function createMap(system: GameSystem, opts: NewMapOptions = {}): DungeonMap {
  const newId = opts.newId ?? randomId;
  return {
    id: newId(),
    title: opts.title ?? '',
    hero: opts.hero ?? '',
    level: opts.level ?? '',
    width: opts.width ?? system.defaultMapSize.width,
    height: opts.height ?? system.defaultMapSize.height,
    themeId: system.defaultThemeId,
    defaultDoorType: system.defaultDoorType,
    seed: opts.seed ?? Math.floor(Math.random() * 2 ** 31),
    rooms: [],
    doors: [],
    features: [],
    token: null,
  };
}

export function createCampaign(
  system: GameSystem,
  name: string,
  mapOpts: NewMapOptions = {},
): Campaign {
  const newId = mapOpts.newId ?? randomId;
  const map = createMap(system, { ...mapOpts, newId });
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    id: newId(),
    name,
    systemId: system.id,
    maps: [map],
    activeMapId: map.id,
    hero: null,
  };
}
```

- [ ] **Step 8: Run the tests and typecheck**

Run: `npx vitest run tests/core/campaign.test.ts && npm run typecheck`
Expected: all tests in the file PASS; `tsc` prints nothing.

- [ ] **Step 9: Commit**

```bash
git add src/core/types.ts src/core/system.ts src/systems/dungeon/index.ts src/core/ids.ts src/core/campaign.ts tests/core/campaign.test.ts
git commit -m "feat(core): data model, dungeon system, campaign factory"
```


### Task 3: Grid geometry

**Files:**
- Create: `src/core/geometry.ts`
- Test: `tests/core/geometry.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/core/geometry.test.ts`:

```ts
import {
  cellEdge,
  clipRect,
  edgeCells,
  isBoundaryEdge,
  perimeterEdges,
  rectContains,
  rectsOverlap,
} from '../../src/core/geometry';

describe('rectsOverlap', () => {
  it('detects overlapping rects', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 3, h: 3 }, { x: 2, y: 2, w: 3, h: 3 })).toBe(true);
  });
  it('treats touching rects as not overlapping', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 3, h: 3 }, { x: 3, y: 0, w: 2, h: 2 })).toBe(false);
    expect(rectsOverlap({ x: 0, y: 0, w: 3, h: 3 }, { x: 0, y: 3, w: 2, h: 2 })).toBe(false);
  });
});

describe('rectContains', () => {
  it('includes top-left and excludes far edges', () => {
    const r = { x: 2, y: 2, w: 2, h: 2 };
    expect(rectContains(r, { x: 2, y: 2 })).toBe(true);
    expect(rectContains(r, { x: 3, y: 3 })).toBe(true);
    expect(rectContains(r, { x: 4, y: 3 })).toBe(false);
  });
});

describe('clipRect', () => {
  it('returns the rect unchanged when inside', () => {
    expect(clipRect({ x: 1, y: 1, w: 3, h: 2 }, 10, 10)).toEqual({ x: 1, y: 1, w: 3, h: 2 });
  });
  it('clips at the top and left', () => {
    expect(clipRect({ x: -2, y: -1, w: 5, h: 4 }, 10, 10)).toEqual({ x: 0, y: 0, w: 3, h: 3 });
  });
  it('clips at the bottom and right', () => {
    expect(clipRect({ x: 8, y: 7, w: 5, h: 5 }, 10, 10)).toEqual({ x: 8, y: 7, w: 2, h: 3 });
  });
  it('returns null when nothing remains', () => {
    expect(clipRect({ x: -5, y: 0, w: 5, h: 2 }, 10, 10)).toBeNull();
  });
});

describe('edges', () => {
  it('canonicalises S and E onto the neighbour square', () => {
    expect(cellEdge({ x: 3, y: 4 }, 'S')).toEqual({ x: 3, y: 5, side: 'N' });
    expect(cellEdge({ x: 3, y: 4 }, 'E')).toEqual({ x: 4, y: 4, side: 'W' });
  });
  it('edgeCells returns both neighbours', () => {
    expect(edgeCells({ x: 3, y: 5, side: 'N' })).toEqual([
      { x: 3, y: 4 },
      { x: 3, y: 5 },
    ]);
    expect(edgeCells({ x: 4, y: 4, side: 'W' })).toEqual([
      { x: 3, y: 4 },
      { x: 4, y: 4 },
    ]);
  });
  it('identifies Outer Boundary edges', () => {
    expect(isBoundaryEdge({ x: 2, y: 0, side: 'N' }, 10, 8)).toBe(true);
    expect(isBoundaryEdge({ x: 2, y: 8, side: 'N' }, 10, 8)).toBe(true);
    expect(isBoundaryEdge({ x: 0, y: 3, side: 'W' }, 10, 8)).toBe(true);
    expect(isBoundaryEdge({ x: 10, y: 3, side: 'W' }, 10, 8)).toBe(true);
    expect(isBoundaryEdge({ x: 2, y: 4, side: 'N' }, 10, 8)).toBe(false);
  });
  it('perimeterEdges lists 2w+2h edges', () => {
    expect(perimeterEdges({ x: 0, y: 0, w: 3, h: 2 })).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/geometry.test.ts`
Expected: FAIL — cannot resolve `../../src/core/geometry`

- [ ] **Step 3: Implement `src/core/geometry.ts`**

```ts
import type { Cell, Direction, Edge, Rect } from './types';

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function rectContains(r: Rect, c: Cell): boolean {
  return c.x >= r.x && c.x < r.x + r.w && c.y >= r.y && c.y < r.y + r.h;
}

/** Clip a rect to the area 0..width-1 × 0..height-1. Returns null if nothing remains. */
export function clipRect(r: Rect, width: number, height: number): Rect | null {
  const x0 = Math.max(r.x, 0);
  const y0 = Math.max(r.y, 0);
  const x1 = Math.min(r.x + r.w, width);
  const y1 = Math.min(r.y + r.h, height);
  if (x1 <= x0 || y1 <= y0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export function inBounds(c: Cell, width: number, height: number): boolean {
  return c.x >= 0 && c.x < width && c.y >= 0 && c.y < height;
}

/** The canonical edge on the given side of a square. */
export function cellEdge(c: Cell, dir: Direction): Edge {
  switch (dir) {
    case 'N':
      return { x: c.x, y: c.y, side: 'N' };
    case 'S':
      return { x: c.x, y: c.y + 1, side: 'N' };
    case 'W':
      return { x: c.x, y: c.y, side: 'W' };
    case 'E':
      return { x: c.x + 1, y: c.y, side: 'W' };
  }
}

/** The two squares an edge separates: [north-or-west square, south-or-east square]. */
export function edgeCells(e: Edge): [Cell, Cell] {
  return e.side === 'N'
    ? [{ x: e.x, y: e.y - 1 }, { x: e.x, y: e.y }]
    : [{ x: e.x - 1, y: e.y }, { x: e.x, y: e.y }];
}

export function edgeKey(e: Edge): string {
  return `${e.x},${e.y},${e.side}`;
}

export function sameEdge(a: Edge, b: Edge): boolean {
  return a.x === b.x && a.y === b.y && a.side === b.side;
}

/** True if the edge lies on the map's Outer Boundary. */
export function isBoundaryEdge(e: Edge, width: number, height: number): boolean {
  if (e.side === 'N') return (e.y === 0 || e.y === height) && e.x >= 0 && e.x < width;
  return (e.x === 0 || e.x === width) && e.y >= 0 && e.y < height;
}

/** Every edge around the outside of a rect, with the inside square and outward direction. */
export function perimeterEdges(r: Rect): { edge: Edge; inside: Cell; dir: Direction }[] {
  const out: { edge: Edge; inside: Cell; dir: Direction }[] = [];
  for (let x = r.x; x < r.x + r.w; x++) {
    const top = { x, y: r.y };
    const bottom = { x, y: r.y + r.h - 1 };
    out.push({ edge: cellEdge(top, 'N'), inside: top, dir: 'N' });
    out.push({ edge: cellEdge(bottom, 'S'), inside: bottom, dir: 'S' });
  }
  for (let y = r.y; y < r.y + r.h; y++) {
    const left = { x: r.x, y };
    const right = { x: r.x + r.w - 1, y };
    out.push({ edge: cellEdge(left, 'W'), inside: left, dir: 'W' });
    out.push({ edge: cellEdge(right, 'E'), inside: right, dir: 'E' });
  }
  return out;
}

export function step(c: Cell, dir: Direction): Cell {
  switch (dir) {
    case 'N':
      return { x: c.x, y: c.y - 1 };
    case 'S':
      return { x: c.x, y: c.y + 1 };
    case 'W':
      return { x: c.x - 1, y: c.y };
    case 'E':
      return { x: c.x + 1, y: c.y };
  }
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run tests/core/geometry.test.ts && npm run typecheck`
Expected: all tests in the file PASS; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/core/geometry.ts tests/core/geometry.test.ts
git commit -m "feat(core): grid geometry helpers"
```


### Task 4: Test fixtures and map queries (open exits, derived walls)

**Files:**
- Create: `tests/core/fixtures.ts`
- Create: `src/core/query.ts`
- Test: `tests/core/query.test.ts`

Create the fixtures file first (it is a test helper, not a test). Walls are **derived**: every room perimeter edge without a door, deduplicated so a wall shared by two butting rooms appears once.

- [ ] **Step 1: Write the failing test**

Create `tests/core/query.test.ts`:

```ts
import { deriveWalls, isOpenExit, nextRoomNumber, openExits, roomAt } from '../../src/core/query';
import { door, emptyMap, room, withContent } from './fixtures';

describe('roomAt', () => {
  it('finds the room covering a square', () => {
    const m = withContent(emptyMap(), [room('a', 2, 2, 3, 2)]);
    expect(roomAt(m, { x: 4, y: 3 })?.id).toBe('a');
    expect(roomAt(m, { x: 5, y: 3 })).toBeUndefined();
  });
});

describe('open exits', () => {
  it('a door with a room on one side is open', () => {
    const m = withContent(emptyMap(), [room('a', 2, 2, 3, 2)], [door('d', 3, 2, 'N')]);
    expect(isOpenExit(m, m.doors[0]!)).toBe(true);
    expect(openExits(m).map((d) => d.id)).toEqual(['d']);
  });
  it('a door between two rooms is not open', () => {
    const m = withContent(
      emptyMap(),
      [room('a', 2, 2, 3, 2), room('b', 2, 0, 3, 2)],
      [door('d', 3, 2, 'N')],
    );
    expect(openExits(m)).toEqual([]);
  });
});

describe('deriveWalls', () => {
  it('a lone 2x1 room has 6 wall edges', () => {
    const m = withContent(emptyMap(), [room('a', 1, 1, 2, 1)]);
    expect(deriveWalls(m)).toHaveLength(6);
  });
  it('a door removes its edge from the walls', () => {
    const m = withContent(emptyMap(), [room('a', 1, 1, 2, 1)], [door('d', 1, 1, 'N')]);
    expect(deriveWalls(m)).toHaveLength(5);
  });
  it('a wall shared by two butting rooms appears once', () => {
    // a: 1x1 at (1,1); b: 1x1 at (2,1). 4 + 4 - 1 shared = 7.
    const m = withContent(emptyMap(), [room('a', 1, 1, 1, 1), room('b', 2, 1, 1, 1)]);
    expect(deriveWalls(m)).toHaveLength(7);
  });
});

describe('nextRoomNumber', () => {
  it('ignores passages and the entrance', () => {
    const m = withContent(emptyMap(), [
      room('e', 4, 10, 1, 1, 'entrance'),
      room('a', 2, 2, 2, 2, 'room', 1),
      room('p', 4, 4, 1, 1, 'passage'),
      room('b', 6, 2, 2, 2, 'room', 2),
    ]);
    expect(nextRoomNumber(m)).toBe(3);
  });
  it('is 1 on an empty map', () => {
    expect(nextRoomNumber(emptyMap())).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/query.test.ts`
Expected: FAIL — cannot resolve `../../src/core/query`

- [ ] **Step 3: Implement `tests/core/fixtures.ts`**

```ts
import { createMap } from '../../src/core/campaign';
import { sequentialIds } from '../../src/core/ids';
import { dungeonSystem } from '../../src/systems/dungeon';
import type { Door, DungeonMap, Room, RoomKind } from '../../src/core/types';

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
  return { id, number, kind, x, y, w, h, label: { type: '', unique: false, narrative: '' } };
}

export function door(id: string, x: number, y: number, side: 'N' | 'W', type = 'archway'): Door {
  return { id, x, y, side, type, secret: false, lock: null };
}

export function withContent(map: DungeonMap, rooms: Room[], doors: Door[] = []): DungeonMap {
  return { ...map, rooms, doors };
}
```

- [ ] **Step 4: Implement `src/core/query.ts`**

```ts
import { edgeCells, edgeKey, perimeterEdges, rectContains, sameEdge } from './geometry';
import type { Cell, Door, DungeonMap, Edge, Room } from './types';

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
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run tests/core/query.test.ts && npm run typecheck`
Expected: all tests in the file PASS; `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add tests/core/fixtures.ts src/core/query.ts tests/core/query.test.ts
git commit -m "feat(core): map queries with derived walls and open exits"
```


### Task 5: Placement rules and map invariants

**Files:**
- Create: `src/core/rules.ts`
- Test: `tests/core/rules.test.ts`

Rules from the 2D6 Dungeon book enforced here: rooms cannot overlap; rooms may butt up; a room reaching the Outer Boundary is **clipped** (the boundary becomes its wall); exits cannot be on the Outer Boundary. A clipped room must still contain the square in front of its exit. `checkInvariants` is the single source of truth `History` uses to reject bad commands.

- [ ] **Step 1: Write the failing test**

Create `tests/core/rules.test.ts`:

```ts
import {
  checkInvariants,
  entranceCells,
  evaluatePlacement,
  exitDirection,
  exitTarget,
  ghostRect,
  validExitEdges,
} from '../../src/core/rules';
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
  it('clamps the slide offset', () => {
    const m = mapWithTopExit();
    expect(ghostRect(m, m.doors[0]!, 4, 3, 99)).toEqual({ x: 2, y: 1, w: 4, h: 3 });
  });
});

describe('evaluatePlacement', () => {
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
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/rules.test.ts`
Expected: FAIL — cannot resolve `../../src/core/rules`

- [ ] **Step 3: Implement `src/core/rules.ts`**

```ts
import {
  clipRect,
  edgeCells,
  inBounds,
  isBoundaryEdge,
  perimeterEdges,
  rectContains,
  rectsOverlap,
  step,
} from './geometry';
import { doorAt, roomAt, roomsAcross } from './query';
import type { Cell, Direction, Door, DungeonMap, Edge, Rect, Room } from './types';

export function describeRoom(r: Room): string {
  if (r.kind === 'room') return `Room ${r.number}`;
  return r.kind === 'passage' ? 'a passage' : 'the entrance';
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

/** Number of slide positions for a w×h room against an exit. */
export function slideRange(map: DungeonMap, door: Door, w: number, h: number): number {
  const dir = exitDirection(map, door);
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
    return { ok: false, rect, rolled, clipped: true, reason: 'The room must connect to the exit' };
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
  for (const d of map.doors) {
    const [a, b] = roomsAcross(map, d);
    if (!a && !b) return 'A door is not attached to any room';
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

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run tests/core/rules.test.ts && npm run typecheck`
Expected: all tests in the file PASS; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/core/rules.ts tests/core/rules.test.ts
git commit -m "feat(core): 2D6 placement rules and map invariants"
```


### Task 6: Reversible commands

**Files:**
- Create: `src/core/commands.ts`
- Test: `tests/core/commands.test.ts`

`removeItem` remembers the index at apply time so undo restores array order exactly (tests compare with `toEqual`).

- [ ] **Step 1: Write the failing test**

Create `tests/core/commands.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/commands.test.ts`
Expected: FAIL — cannot resolve `../../src/core/commands`

- [ ] **Step 3: Implement `src/core/commands.ts`**

```ts
import { edgeCells, rectContains } from './geometry';
import { roomAt } from './query';
import type { Door, DungeonMap, Feature, Room, Token } from './types';

/** A reversible change to a map. apply/undo are pure: they return a new map. */
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

/**
 * Delete a room plus everything that would be left dangling: doors with no room on
 * either side, features inside it, and the token if it stands there.
 */
export function deleteRoom(map: DungeonMap, roomId: string): Command | null {
  const room = map.rooms.find((r) => r.id === roomId);
  if (!room) return null;
  const without: DungeonMap = { ...map, rooms: map.rooms.filter((r) => r.id !== roomId) };
  const orphanDoors = map.doors.filter((d) => edgeCells(d).every((c) => !roomAt(without, c)));
  const features = map.features.filter((f) => rectContains(room, f));
  const cmds: Command[] = [
    ...orphanDoors.map(removeDoor),
    ...features.map(removeFeature),
  ];
  if (map.token && rectContains(room, map.token)) cmds.push(setToken(map.token, null));
  cmds.push(removeRoom(room));
  return compound('Delete room', cmds);
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run tests/core/commands.test.ts && npm run typecheck`
Expected: all tests in the file PASS; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/core/commands.ts tests/core/commands.test.ts
git commit -m "feat(core): reversible map commands"
```


### Task 7: Validated undo/redo history

**Files:**
- Create: `src/core/history.ts`
- Test: `tests/core/history.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/core/history.test.ts`:

```ts
import { addRoom } from '../../src/core/commands';
import { History } from '../../src/core/history';
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
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = h.execute(addRoom(room('b', 2, 2, 3, 3)));
    warn.mockRestore();
    expect(result.ok).toBe(false);
    expect(h.map).toBe(before);
    expect(h.canRedo).toBe(false);
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/history.test.ts`
Expected: FAIL — cannot resolve `../../src/core/history`

- [ ] **Step 3: Implement `src/core/history.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run tests/core/history.test.ts && npm run typecheck`
Expected: all tests in the file PASS; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/core/history.ts tests/core/history.test.ts
git commit -m "feat(core): validated undo/redo history"
```


### Task 8: Play-flow command builders

**Files:**
- Create: `src/core/playflow.ts`
- Test: `tests/core/playflow.test.ts`

The UI (Plan 3) will drive these: `placeEntrance` for step 1; `evaluatePlacement` + `newRoom` for steps 3–4; `validExitEdges` against a **draft** map (`addRoom(room).apply(map)`) for step 5; and `createRoomFromExit` to commit steps 3–6 as **one** undoable command.

- [ ] **Step 1: Write the failing test**

Create `tests/core/playflow.test.ts`:

```ts
import { History } from '../../src/core/history';
import { sequentialIds } from '../../src/core/ids';
import { createRoomFromExit, newRoom, placeEntrance } from '../../src/core/playflow';
import { openExits } from '../../src/core/query';
import { evaluatePlacement, validExitEdges } from '../../src/core/rules';
import { addRoom } from '../../src/core/commands';
import { dungeonSystem } from '../../src/systems/dungeon';
import { emptyMap } from './fixtures';

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
});

describe('full play-flow round', () => {
  it('entrance → room → exits with passages, as one undo step', () => {
    const h = new History(emptyMap(10, 10));
    const ids = sequentialIds('x');
    h.execute(placeEntrance(h.map, dungeonSystem, { x: 4, y: 10 }, ids));
    const exit = openExits(h.map)[0]!;

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
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/playflow.test.ts`
Expected: FAIL — cannot resolve `../../src/core/playflow`

- [ ] **Step 3: Implement `src/core/playflow.ts`**

```ts
import { addDoor, addRoom, compound, setToken, type Command } from './commands';
import { cellEdge, isBoundaryEdge, perimeterEdges, sameEdge, step } from './geometry';
import type { IdFn } from './ids';
import { nextRoomNumber } from './query';
import { entranceInwardDirection } from './rules';
import type { GameSystem } from './system';
import type { Cell, Door, DungeonMap, Edge, Rect, Room, RoomLabel } from './types';

const EMPTY_LABEL: RoomLabel = { type: '', unique: false, narrative: '' };

function makeDoor(newId: IdFn, edge: Edge, type: string): Door {
  return { id: newId(), x: edge.x, y: edge.y, side: edge.side, type, secret: false, lock: null };
}

/** Entrance room outside the boundary, its inward open exit, and the token on it. */
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
 * unless that far end is the Outer Boundary (corridors may end there; exits may not).
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
    if (!isBoundaryEdge(far, map.width, map.height)) {
      cmds.push(addDoor(makeDoor(newId, far, plan.exitType)));
    }
  }
  return compound(`Add Room ${plan.room.number}`, cmds);
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run tests/core/playflow.test.ts && npm run typecheck`
Expected: all tests in the file PASS; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/core/playflow.ts tests/core/playflow.test.ts
git commit -m "feat(core): play-flow builders for entrance and rooms"
```


### Task 9: Pathfinding and token movement

**Files:**
- Create: `src/core/pathfinding.ts`
- Create: `src/core/token.ts`
- Test: `tests/core/pathfinding.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/core/pathfinding.test.ts`:

```ts
import { canStep, findPath } from '../../src/core/pathfinding';
import { moveToken, TRAIL_CAP } from '../../src/core/token';
import { door, emptyMap, room, withContent } from './fixtures';

// Two 2x2 rooms side by side: a at (1,1), b at (3,1). Door between them at (3,2,W).
function twoRooms(secret = false) {
  const d = { ...door('d', 3, 2, 'W'), secret };
  return withContent(emptyMap(), [room('a', 1, 1, 2, 2), room('b', 3, 1, 2, 2)], [d]);
}

describe('canStep', () => {
  it('moves freely inside a room', () => {
    expect(canStep(twoRooms(), { x: 1, y: 1 }, 'E')).toBe(true);
  });
  it('is blocked by a wall between rooms', () => {
    expect(canStep(twoRooms(), { x: 2, y: 1 }, 'E')).toBe(false);
  });
  it('passes through a door', () => {
    expect(canStep(twoRooms(), { x: 2, y: 2 }, 'E')).toBe(true);
  });
  it('is blocked by a secret door', () => {
    expect(canStep(twoRooms(true), { x: 2, y: 2 }, 'E')).toBe(false);
  });
  it('cannot leave the floor', () => {
    expect(canStep(twoRooms(), { x: 1, y: 1 }, 'N')).toBe(false);
  });
});

describe('findPath', () => {
  it('routes through the door', () => {
    const path = findPath(twoRooms(), { x: 1, y: 1 }, { x: 4, y: 1 });
    expect(path).not.toBeNull();
    expect(path![0]).toEqual({ x: 1, y: 1 });
    expect(path![path!.length - 1]).toEqual({ x: 4, y: 1 });
    expect(path).toContainEqual({ x: 2, y: 2 });
    expect(path).toContainEqual({ x: 3, y: 2 });
    expect(path).toHaveLength(6);
  });
  it('returns null when only a secret door connects', () => {
    expect(findPath(twoRooms(true), { x: 1, y: 1 }, { x: 4, y: 1 })).toBeNull();
  });
  it('returns null for a target off the floor', () => {
    expect(findPath(twoRooms(), { x: 1, y: 1 }, { x: 8, y: 8 })).toBeNull();
  });
  it('returns a single square when already there', () => {
    expect(findPath(twoRooms(), { x: 1, y: 1 }, { x: 1, y: 1 })).toEqual([{ x: 1, y: 1 }]);
  });
});

describe('moveToken', () => {
  it('moves to the end and records the squares it left', () => {
    const m = { ...twoRooms(), token: { x: 1, y: 1, trail: [] } };
    const cmd = moveToken(m, [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ])!;
    expect(cmd.apply(m).token).toEqual({
      x: 2,
      y: 2,
      trail: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
      ],
    });
  });
  it('caps the trail', () => {
    const long = Array.from({ length: TRAIL_CAP }, () => ({ x: 1, y: 1 }));
    const m = { ...twoRooms(), token: { x: 1, y: 1, trail: long } };
    const after = moveToken(m, [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ])!.apply(m);
    expect(after.token!.trail).toHaveLength(TRAIL_CAP);
  });
  it('returns null for a path that goes nowhere', () => {
    const m = { ...twoRooms(), token: { x: 1, y: 1, trail: [] } };
    expect(moveToken(m, [{ x: 1, y: 1 }])).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/pathfinding.test.ts`
Expected: FAIL — cannot resolve `../../src/core/pathfinding`

- [ ] **Step 3: Implement `src/core/pathfinding.ts`**

```ts
import { cellEdge, step } from './geometry';
import { doorAt, roomAt } from './query';
import type { Cell, Direction, DungeonMap } from './types';

const DIRS: Direction[] = ['N', 'E', 'S', 'W'];

/** Can the token move one square from `from` in `dir`? Needs floor on both sides, and a non-secret door between different rooms. */
export function canStep(map: DungeonMap, from: Cell, dir: Direction): boolean {
  const to = step(from, dir);
  const a = roomAt(map, from);
  const b = roomAt(map, to);
  if (!a || !b) return false;
  if (a.id === b.id) return true;
  const door = doorAt(map, cellEdge(from, dir));
  return door !== undefined && !door.secret;
}

const key = (c: Cell) => `${c.x},${c.y}`;
const manhattan = (a: Cell, b: Cell) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/** A* shortest path from `from` to `to` (inclusive of both), or null if unreachable. */
export function findPath(map: DungeonMap, from: Cell, to: Cell): Cell[] | null {
  if (!roomAt(map, from) || !roomAt(map, to)) return null;
  const open: Cell[] = [from];
  const came = new Map<string, Cell>();
  const g = new Map<string, number>([[key(from), 0]]);
  const f = new Map<string, number>([[key(from), manhattan(from, to)]]);

  while (open.length > 0) {
    open.sort((a, b) => f.get(key(a))! - f.get(key(b))!);
    const current = open.shift()!;
    if (current.x === to.x && current.y === to.y) {
      const path = [current];
      let k = key(current);
      while (came.has(k)) {
        const prev = came.get(k)!;
        path.unshift(prev);
        k = key(prev);
      }
      return path;
    }
    for (const dir of DIRS) {
      if (!canStep(map, current, dir)) continue;
      const next = step(current, dir);
      const nk = key(next);
      const tentative = g.get(key(current))! + 1;
      if (tentative < (g.get(nk) ?? Infinity)) {
        came.set(nk, current);
        g.set(nk, tentative);
        f.set(nk, tentative + manhattan(next, to));
        if (!open.some((c) => c.x === next.x && c.y === next.y)) open.push(next);
      }
    }
  }
  return null;
}
```

- [ ] **Step 4: Implement `src/core/token.ts`**

```ts
import { setToken, type Command } from './commands';
import type { Cell, DungeonMap } from './types';

export const TRAIL_CAP = 200;

/**
 * Move the token along a path (as returned by findPath, starting at the token).
 * Every square it leaves is added to the footprint trail.
 */
export function moveToken(map: DungeonMap, path: Cell[]): Command | null {
  const before = map.token;
  const last = path[path.length - 1];
  if (!before || !last || path.length < 2) return null;
  const walked = path.slice(0, -1).map(({ x, y }) => ({ x, y }));
  const trail = [...before.trail, ...walked].slice(-TRAIL_CAP);
  return setToken(before, { x: last.x, y: last.y, trail });
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `npx vitest run tests/core/pathfinding.test.ts && npm run typecheck`
Expected: all tests in the file PASS; `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add src/core/pathfinding.ts src/core/token.ts tests/core/pathfinding.test.ts
git commit -m "feat(core): A* pathfinding and token movement"
```


### Task 10: Serialization with validation and migrations

**Files:**
- Create: `src/core/serialize.ts`
- Test: `tests/core/serialize.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/core/serialize.test.ts`:

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
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/core/serialize.test.ts`
Expected: FAIL — cannot resolve `../../src/core/serialize`

- [ ] **Step 3: Implement `src/core/serialize.ts`**

```ts
import { CURRENT_SCHEMA_VERSION } from './campaign';
import { checkInvariants } from './rules';
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

function shapeProblem(raw: Record<string, unknown>): string | null {
  for (const k of ['id', 'name', 'systemId', 'activeMapId']) if (!isStr(raw[k])) return `missing ${k}`;
  if (!Array.isArray(raw.maps) || raw.maps.length === 0) return 'no maps';
  for (const m of raw.maps) {
    if (!isObj(m)) return 'a map is not an object';
    for (const k of ['id', 'title', 'hero', 'level', 'themeId', 'defaultDoorType']) {
      if (!isStr(m[k])) return `map missing ${k}`;
    }
    for (const k of ['width', 'height', 'seed']) if (!isNum(m[k])) return `map missing ${k}`;
    for (const k of ['rooms', 'doors', 'features']) if (!Array.isArray(m[k])) return `map missing ${k}`;
    for (const r of m.rooms as unknown[]) {
      if (!isObj(r) || !isStr(r.id) || !isStr(r.kind) || !isObj(r.label)) return 'a room is malformed';
      for (const k of ['x', 'y', 'w', 'h', 'number']) if (!isNum(r[k])) return 'a room is malformed';
    }
    for (const d of m.doors as unknown[]) {
      if (!isObj(d) || !isStr(d.id) || !isStr(d.type) || !isNum(d.x) || !isNum(d.y)) return 'a door is malformed';
      if (d.side !== 'N' && d.side !== 'W') return 'a door is malformed';
    }
    for (const f of m.features as unknown[]) {
      if (!isObj(f) || !isStr(f.id) || !isNum(f.x) || !isNum(f.y)) return 'a feature is malformed';
      if (f.kind !== 'stairs' && f.kind !== 'note') return 'a feature is malformed';
    }
    if (m.token !== null && !(isObj(m.token) && isNum(m.token.x) && isNum(m.token.y) && Array.isArray(m.token.trail))) {
      return 'the token is malformed';
    }
  }
  if (!(raw.maps as Record<string, unknown>[]).some((m) => m.id === raw.activeMapId)) return 'active map not found';
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
    const migrate = migs[v];
    if (!migrate) return { ok: false, error: `Cannot upgrade this file from version ${v}.` };
    obj = { ...migrate(obj), schemaVersion: v + 1 };
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

- [ ] **Step 4: Run the tests and typecheck**

Run: `npx vitest run tests/core/serialize.test.ts && npm run typecheck`
Expected: all tests in the file PASS; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add src/core/serialize.ts tests/core/serialize.test.ts
git commit -m "feat(core): campaign serialization with validation and migrations"
```


### Task 11: Final verification

- [ ] **Step 1: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: 9 test files, **78 tests passed**; `tsc` prints nothing.

- [ ] **Step 2: Confirm the core has no UI dependencies**

Run: `grep -rnE "document|window|HTMLCanvas|svelte" src/core || echo CLEAN`
Expected: `CLEAN`

- [ ] **Step 3: Confirm nothing private is staged or tracked**

Run: `git ls-files | grep -E "^(pdf|local-data|reference|\.superpowers)/" || echo CLEAN`
Expected: `CLEAN`

- [ ] **Step 4: Commit (if anything remains)**

```bash
git status --short
```
Expected: clean working tree. If not, commit the remaining files with `git commit -m "chore: finish Plan 1"`.

