# Plan 3: Interaction and UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the read-only viewer into the playable tool. It gets:
- a rules-aware guided play flow (rolls typed in or rolled by the app)
- Door, Stairs, Note and Select tools
- an auto-walking, tap-to-walk token
- labelled Undo/Redo
- a coverage badge and a New map dialog
- a landscape-tablet layout (top toolbar, map, right-hand step panel)

**Architecture:**
- **2D6 rule numbers** (dice, sizes, exit counts) live in `src/systems/dungeon/rules.ts`.
- **Generic geometry and commands** extend `src/core`: exit rules, shrink-to-fit, gap
  corridors, the door tool, lock- and secret-aware pathfinding, and coverage.
- **The play flow** is a pure-TS state machine in `src/interaction/`. It drafts steps and
  emits exactly one compound `Command` per room.
- **The renderer** gains an overlay hook, hit testing and touch camera helpers.
- **The Svelte UI** in `src/ui/` replaces the demo `App.svelte`.
- Every map change still goes through `History.execute`.

**Tech Stack:** TypeScript 6.0.3, Svelte 5.57 (runes), Vite 8.3, Vitest 5.0, Playwright 1.64 (visual checks), Canvas 2D.

**Spec:** `docs/superpowers/specs/2026-10-31-plan-3-interaction-design.md`. The earlier
`docs/superpowers/specs/2026-10-31-map-editor-core-design.md` and
`docs/superpowers/plans/2026-10-31-plan-1-followups.md` remain background.

**Deliberate deviation from the spec:** spec §10's "require a non-null `entryDoorId` for every
room except the entrance" is **deferred**. Every play-flow builder already sets it, and
enforcing it means rewriting most core test fixtures for no change in behaviour. It is
recorded in the follow-ups doc instead (Task 12).

## Global Constraints

- `src/core/` imports nothing from `src/render`, `src/ui`, `src/interaction`,
  `src/systems`, Svelte or the DOM. `src/systems/dungeon/rules.ts` may import `src/core`.
- **Every map change goes through `History.execute`.** UI drafts never mutate the map.
- **Rooms are never moved, resized or deleted** after placement. Mistakes are fixed with
  Undo. There is no move, resize or delete UI anywhere.
- **Primary (red) die = width (X); secondary (blue) die = height (Y).**
- **Exit count table:** D6 1 gives 0, 2–3 give 1, 4–5 give 2, 6 gives 3. The entrance room
  is fixed at 3.
- **Every exit gets a 1×1 exit square** (`kind: 'passage'`). There is no option to turn
  this off.
- **Small rooms, corridors and the entrance room get archway exits only.**
- **Locked doors (padlock closed) block the token.** Secret doors are one-way only when they
  are some room's `entryDoorId`.
- **Touch targets are ≥ 44×44 CSS px.** Landscape tablet first (reference viewport
  1180×820 at dpr 2).
- **Never copy rulebook text** into the repo. Rules are paraphrased in the spec only.
- **No saving or loading in this plan** (that's Plan 4).
- The schema stays version 1. Extend the file validator for every new field.
- Every commit message ends with a blank line, then the Co-Authored-By trailer for the
  committing model.

## Review Focus

1. **Typed dice that aren't 1–6** (blank, 0, 7, "a", 2.5) must be rejected with a message,
   never accepted or crash. *(Task 1 `parseDie`, Task 7.)*
2. **Undo or Redo while a room draft is open** cancels the draft first, then applies. No
   half-room is committed, and room numbers stay 1…N. *(Task 7.)*
3. **An open exit with no room for any room in front of it** (blocked, or 1 square deep).
   The flow must offer shrink-to-fit, or say "no space here", rather than leave a red ghost
   with no way out. *(Tasks 4 and 7.)*
4. **Tapping the map while the token is animating, or tapping an exit mid-flow.** The walk
   is cancelled and committed state is unchanged; mid-flow taps outside the current step
   are ignored. *(Task 10.)*
5. **Rotating or resizing the tablet mid-flow** (viewport changes). The camera re-clamps, the
   ghost and highlights stay aligned, and the draft survives. *(Tasks 8 and 9.)*

---

## File structure

| File | Responsibility |
|------|----------------|
| `src/systems/dungeon/rules.ts` | D66/D6 helpers, room-size resolution (doubles, corridor, entrance clamp), size class, exit-count table, clockwise first-wall pick |
| `src/core/types.ts` | + `RoomKind` `'corridor'`, `Room.sizeClass`, `DoorLock.quality` |
| `src/core/exits.ts` | Book exit rules: allowed exit edges, clockwise auto-placement (new) |
| `src/core/placement.ts` | + `shrinkToFit` |
| `src/core/playflow.ts` | Builders: room (kind/size class, always exit squares), entrance + entrance room, room + token walk, gap corridor |
| `src/core/doortool.ts` | Door-tool validation and the add-door builder (new) |
| `src/core/pathfinding.ts` | Lock- and one-way-secret-aware `canStep` |
| `src/core/query.ts` | + `coverage`, `roomCentre` |
| `src/core/invariants.ts`, `src/core/serialize.ts` | Validate the new fields |
| `src/interaction/playflow.ts` | `PlayFlow` state machine (new) |
| `src/render/hit.ts` | Screen → world → square / edge / door / room picking (new) |
| `src/render/camera.ts` | + `clampCamera`, `pinchCamera`, `wheelFactor` |
| `src/render/renderer.ts`, `src/render/draw.ts` | Overlay hook, exit stubs per frame, padlock open/closed + quality |
| `src/ui/*.svelte`, `src/ui/historyStore.ts` | App shell, toolbar, map canvas, step panel and steps, tool editors, dialogs |
| `src/App.svelte` | Mounts `src/ui/AppShell.svelte` |
| `scripts/visual.mjs` | Scripted Playwright walkthrough producing screenshots of each step |

---

### Task 1: 2D6 dice and room rules

**Files:**
- Create: `src/systems/dungeon/rules.ts`
- Test: `tests/systems/rules.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces:
  ```ts
  export type Rng = () => number;                       // [0,1)
  export interface D66 { primary: number; secondary: number }
  export type SizeClass = 'normal' | 'small' | 'large';
  export interface RoomSize { w: number; h: number; corridor: boolean; doubled: boolean }
  export function rollD6(rng: Rng): number;              // 1..6
  export function rollD66(rng: Rng): D66;
  export function parseDie(text: string): number | null; // "1".."6" → n, else null
  export function needsSecondRoll(first: D66, entrance: boolean): boolean;
  export function resolveRoomSize(first: D66, second: D66 | null, entrance: boolean): RoomSize;
  export function clampEntranceArea(w: number, h: number): { w: number; h: number };
  export function classify(rect: { w: number; h: number }, size: RoomSize): SizeClass | 'corridor';
  export function exitCountFor(d6: number): 0 | 1 | 2 | 3;
  export function firstWallIndex(d6: number): 0 | 1 | 2;   // 1–2→0, 3–4→1, 5–6→2
  ```

- [ ] **Step 1: Write the failing tests** in `tests/systems/rules.test.ts`:
  - `parseDie`: `'1'`→1, `' 6 '`→6, and `''`, `'0'`, `'7'`, `'a'`, `'2.5'` → `null`.
  - `rollD6` with a seeded rng (use `mulberry32` from `src/render/rng.ts` *only in the test*): 1000 rolls are all integers in 1..6, and each face appears.
  - `needsSecondRoll({4,4}, false)` → true. `({6,6}, false)` → false. `({1,1}, false)` → true. `({4,4}, true)` → false. `({3,5}, false)` → false.
  - `resolveRoomSize({4,4},{3,2},false)` → `{w:7,h:6,corridor:false,doubled:true}`.
  - `resolveRoomSize({1,4},null,false)` → `{w:1,h:4,corridor:true,doubled:false}`.
  - `resolveRoomSize({1,1},{2,5},false)` → `{w:3,h:6,corridor:false,doubled:true}`.
  - `resolveRoomSize({6,6},null,false)` → `{w:6,h:6,corridor:false,doubled:false}`.
  - Entrance: `resolveRoomSize({5,3},null,true)` → area within 6..12 with `doubled:false`, `corridor:false`. `({1,2},null,true)` → area ≥ 6. `({6,5},null,true)` → area ≤ 12. `({4,4},null,true)` stays 4×4 → clamped to area ≤ 12, i.e. `{w:3,h:4}`.
  - `clampEntranceArea(5,3)` → `{w:4,h:3}`. `clampEntranceArea(1,2)` → `{w:2,h:3}`.
  - Rule: while area > 12, shrink the longer side (shrink `w` when `w === h`); while area < 6, grow the shorter side (grow `h` when `w === h`).
  - `classify({w:1,h:5}, size{corridor:false})` → `'corridor'`. `classify({w:3,h:2}, normalSize)` → `'small'`. `classify({w:8,h:4}, {doubled:true})` → `'large'`. `classify({w:8,h:4}, {doubled:false})` → `'normal'`. `classify({w:3,h:4}, {corridor:true})` → `'corridor'`.
  - `exitCountFor`: 1→0, 2→1, 3→1, 4→2, 5→2, 6→3.
  - `firstWallIndex`: 1,2→0; 3,4→1; 5,6→2.
- [ ] **Step 2: Run** `npx vitest run tests/systems/rules.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `src/systems/dungeon/rules.ts` with the signatures above.
  - `resolveRoomSize` takes the corridor flag from the **first** roll only: a 1 present and not a double.
  - When `entrance` is true, the doubles rule is skipped and the result is passed through `clampEntranceArea`, with `corridor` forced to false.
  - `classify` applies, in order: corridor (flagged, or `min(w,h) === 1`); small (area ≤ 6); large (area ≥ 32 and `doubled`); otherwise normal.
- [ ] **Step 4: Run** the test file and `npm run typecheck` → PASS / clean.
- [ ] **Step 5: Commit** `feat(dungeon): dice and room-size rules`.

### Task 2: Model additions — corridors, size class, lock quality

**Files:**
- Modify: `src/core/types.ts`, `src/core/invariants.ts`, `src/core/serialize.ts`, `src/core/playflow.ts` (object literals only), `tests/core/fixtures.ts`
- Test: `tests/core/invariants.test.ts`, `tests/core/serialize.test.ts`, `tests/core/query.test.ts`

**Interfaces:**
- Produces:
  - `RoomKind = 'room' | 'corridor' | 'passage' | 'entrance'`
  - `Room.sizeClass: 'normal' | 'small' | 'large' | null`: set for `kind: 'room'`, and `null` for every other kind
  - `DoorLock { locked: boolean; note: string; quality: number | null }`
  - `describeRoom` returns `'a corridor'` for corridors
  - `fixtures.room(...)` gains a trailing optional `sizeClass` (default `'normal'` when kind is `'room'`, otherwise `null`)

- [ ] **Step 1: Write the failing tests:**
  - **invariants:** a `kind:'room'` with `sizeClass: null` is rejected. A `kind:'corridor'` with a non-null `sizeClass` is rejected. A valid corridor (1×4, `sizeClass:null`, number 0) is accepted.
  - **query:** `nextRoomNumber` ignores corridors (rooms 1 and 2 plus a corridor give 3).
  - **serialize** (corruption table): room `sizeClass: 'huge'` → `'a room is malformed'`. Door lock `{locked:true, note:'', quality:'x'}` → `'a door is malformed'`. A round-trip with a corridor and a lock with `quality: 7` still passes.
- [ ] **Step 2: Run** `npx vitest run tests/core` → the new tests FAIL.
- [ ] **Step 3: Implement.** Add the fields and types. Update the validator and invariants. Set `sizeClass` in `placeEntrance` (`null`), `newRoom` (`'normal'` for now), and passages (`null`). Update the fixtures. Fix any existing test that builds `DoorLock` without `quality`.
- [ ] **Step 4: Run** `npm test && npm run typecheck` → all PASS, clean.
- [ ] **Step 5: Commit** `feat(core): corridors, room size class, lock quality`.

### Task 3: Book exit rules

**Files:**
- Create: `src/core/exits.ts`
- Test: `tests/core/exits.test.ts`

**Interfaces:**
- Consumes: `perimeterEdges`, `isBoundaryEdge`, `step`, `inBounds` (geometry); `doorAt`, `roomAt` (query).
- Produces:
  ```ts
  /** Walls in clockwise order N → E → S → W. */
  export const CLOCKWISE: readonly Direction[];
  export function entryWall(map: DungeonMap, room: Room): Direction | null;
  /** Edges where a new exit may go, given exits already chosen this step (`chosen` are not yet in the map). */
  export function allowedExitEdges(map: DungeonMap, roomId: string, chosen: Edge[]): Edge[];
  /** Auto-place up to `count` exits clockwise from the entry wall, starting at wall `firstWallIndex` (0..2). */
  export function placeExitsClockwise(
    map: DungeonMap, roomId: string, count: number, firstWall: 0 | 1 | 2,
  ): { exits: Edge[]; dropped: number };
  ```
  The **rules for `allowedExitEdges`** (spec §6.4), in terms of a perimeter edge with inside square `i`, outward direction `d`, `s1 = step(i,d)` (the exit square) and `s2 = step(s1,d)`:
  - not a boundary edge
  - no door already on it
  - `s1` in bounds and not floor
  - `s2` in bounds and not floor (the 1-square-deep rule)
  - `d` is not the entry wall
  - no existing door on wall `d` of this room
  - no edge in `chosen` on wall `d`

- [ ] **Step 1: Write the failing tests** with fixtures. Use a 10×10 map and a room `a` at (3,3), 4×3, with an entry door on its south wall at (4,6,'N'):
  - `entryWall` → `'S'`.
  - No allowed edge is on the S wall.
  - With `chosen=[{x:4,y:3,side:'N'}]`, no other N-wall edge is allowed.
  - A room against the top boundary (y=0) has no N edges allowed.
  - **1-square-deep:** with room `b` at (3,1), 4×1, room `a`'s N edges are disallowed. (`s1` at y=2 is empty, but `s2` at y=1 is floor.) With `b` at (3,0) instead, they are allowed (`s1` and `s2` both empty).
  - An existing door on the E wall (connected to a neighbour) disables E.
  - `placeExitsClockwise(map,'a',3,0)` with entry wall S places exits on W, N, E in that order (the first wall clockwise from S is W), with `dropped: 0`. Each exit is the middle-most allowed edge of its wall.
  - `placeExitsClockwise(map,'a',3,1)` starts at N and continues to E, then wraps to W.
  - **Too few walls:** a room in a corner touching two boundaries with entry on S → at most 1 exit, and `dropped` = count − placed.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `src/core/exits.ts`. "Middle-most" means the allowed edge on that wall closest to the wall's midpoint; ties go to the lower x or y.
- [ ] **Step 4: Run** the tests and typecheck → PASS.
- [ ] **Step 5: Commit** `feat(core): book exit rules and clockwise placement`.

> Note: the old `validExitEdges(map, roomId, passages)` in `placement.ts` stays for now. Task 5 switches the play-flow builders to `allowedExitEdges`, and Task 12 removes `validExitEdges` if nothing uses it.

### Task 4: Shrink to fit

**Files:**
- Modify: `src/core/placement.ts`
- Test: `tests/core/placement.test.ts`

**Interfaces:**
- Consumes: `evaluatePlacement`, `slideRange`.
- Produces: `export function shrinkToFit(map: DungeonMap, door: Door, w: number, h: number, offset: number): { w: number; h: number; offset: number } | null`. It finds the largest-area `w' ≤ w`, `h' ≤ h` and an offset for which `evaluatePlacement(...).ok`.
  - Ties: larger `w'` first, then the offset closest to the requested one.
  - Returns `null` if even 1×1 doesn't fit.

- [ ] **Step 1: Write the failing tests:**
  - A rolled 5×4 fits unchanged → it is returned as is.
  - A room `b` blocks the right side, so 5×4 overlaps → the result is ok via `evaluatePlacement`, has area < 20, and is maximal (no strictly larger fitting size exists, checked by brute force in the test).
  - The square in front of the exit is floor → `null`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** by brute force over `w'` (w…1), `h'` (h…1) and every offset in `slideRange`. Sizes are ≤ 12, so this is cheap.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(core): shrink a room to fit in front of an exit`.

### Task 5: Play-flow builders and the door tool

**Files:**
- Modify: `src/core/playflow.ts`
- Create: `src/core/doortool.ts`
- Test: `tests/core/playflow.test.ts`, `tests/core/doortool.test.ts`

**Interfaces:**
- Consumes: Task 2 types; Task 3 `allowedExitEdges`; `findPath`, `moveToken`, `compound`.
- Produces (`playflow.ts`):
  ```ts
  export function newRoom(map: DungeonMap, rect: Rect, entryDoor: Door, newId: IdFn,
    kind?: 'room' | 'corridor', sizeClass?: 'normal' | 'small' | 'large' | null): Room;
  export interface RoomPlan { room: Room; exits: Edge[]; exitType: string }   // `passages` removed: exit squares always added
  export function createRoomFromExit(map: DungeonMap, plan: RoomPlan, newId: IdFn): Command;
  /** Room command plus the token walking from its current square to the room centre, as ONE command labelled like the room. */
  export function createRoomAndWalk(map: DungeonMap, plan: RoomPlan, newId: IdFn): { command: Command; path: Cell[] | null };
  /** Entrance square + entrance room (+ its exits and the token's walk) as ONE command labelled "Add entrance". */
  export function createEntranceAndRoom(map: DungeonMap, system: GameSystem, cell: Cell, rect: Rect,
    exits: Edge[], newId: IdFn): { command: Command; path: Cell[] | null };
  export function gapCorridorRect(map: DungeonMap, door: Door, length: number): Rect | null;
  export function createGapCorridor(map: DungeonMap, door: Door, length: number, newId: IdFn): Command | null;
  ```
  Rules:
  - The entrance room is `kind:'room'`, number 1, `label.type` `'Entrance Room'`, and its exits are archways.
  - `createRoomAndWalk` returns `path: null` and leaves the token alone when the centre is unreachable.
  - The label is `Add Room N` for rooms and `Add corridor` for corridors.
  - `gapCorridorRect` runs straight out from the exit: 1 wide, `length` long, clipped at the boundary, `null` on overlap.
  - `createGapCorridor` adds a `kind:'corridor'` room (`entryDoorId` = `door.id`, `sizeClass:null`). If its far edge faces floor and has no door, it adds an archway there. There is no exit square.
- Produces (`doortool.ts`):
  ```ts
  export type DoorCheck = { ok: true; facesOpenSpace: boolean } | { ok: false; reason: string };
  export function checkDoorTool(map: DungeonMap, edge: Edge): DoorCheck;
  /** Adds the door; when it faces open space it also adds the exit square (passage) and that square's far exit unless at the boundary. */
  export function addDoorWithTool(map: DungeonMap, edge: Edge, type: string, secret: boolean, newId: IdFn): Command | null;
  ```
  `checkDoorTool` refuses with these reasons:
  - on the Outer Boundary: `'Not on the Outer Boundary'`
  - existing door: `'There is already a door here'`
  - same room on both sides: `'That is inside a room'`
  - no floor either side: `'A door needs a room on at least one side'`

- [ ] **Step 1: Write the failing tests:**
  - Update the existing playflow tests to the new `RoomPlan` (no `passages`). They now always get exit squares.
  - `createRoomAndWalk` → after `History.execute`, the token is at the room centre, `h.undoLabel` is `'Add Room 1'`, and **one** `h.undo()` restores the map and token to before.
  - Unreachable (the entry door is locked) → `path === null` and the token is unchanged.
  - `createEntranceAndRoom` → the entrance, room 1 typed "Entrance Room", 3 archway exits with exit squares, and the token in the room. One undo clears everything.
  - Gap corridor:
    - straight out, length 3 → a corridor 1×3
    - its far end meets a room → an archway door is added there
    - no exit square
    - overlapping → `null`
  - Door tool:
    - each refusal reason
    - facing open space → door + passage
    - between two rooms → door only
    - the entry door can't be removed (via `removeDoor` + execute → rejected)
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** "Room centre" is `roomCentre(room)` from Task 6. Either implement it here and move it to `query.ts` in Task 6, or add it to `query.ts` now. Pick one and record it.
- [ ] **Step 4: Run** `npm test && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(core): play-flow builders with exit squares, token walk, gap corridors, door tool`.

### Task 6: Pathfinding rules and coverage

**Files:**
- Modify: `src/core/pathfinding.ts`, `src/core/query.ts`
- Test: `tests/core/pathfinding.test.ts`, `tests/core/query.test.ts`

**Interfaces:**
- Produces:
  - `canStep(map, from, dir)`: a door with `lock?.locked === true` is impassable. A secret door is passable only into room `b` when `b.entryDoorId === door.id`; a secret door that is nobody's entry door is passable both ways.
  - `export function coverage(map: DungeonMap): number` = floor squares of kinds `room`, `corridor` and `passage` ÷ (width × height), in [0,1].
  - `export function roomCentre(room: Room): Cell` = `{x: room.x + floor((w-1)/2), y: room.y + floor((h-1)/2)}`.

- [ ] **Step 1: Write the failing tests:**
  - **Locked:** locked blocks; `locked:false` passes.
  - **Secret one-way:** `b.entryDoorId = d` → you can step a→b but not b→a.
  - **Secret two-way:** with no `entryDoorId`, both directions pass.
  - **Coverage:** an empty map gives 0. One 5×4 room on a 10×10 map gives 0.2. The entrance square isn't counted.
  - **Room centre:** a 4×3 room at (2,2) → (3,3).
- [ ] **Step 2–4:** run → FAIL, implement, run → PASS.
- [ ] **Step 5: Commit** `feat(core): locks block the token, one-way secret doors, coverage`.

### Task 7: PlayFlow state machine

**Files:**
- Create: `src/interaction/playflow.ts`
- Test: `tests/interaction/playflow.test.ts`

**Interfaces:**
- Consumes: Tasks 1, 3, 4 and 5; `History`; `dungeonSystem`.
- Produces:
  ```ts
  export type Step =
    | { kind: 'idle' }
    | { kind: 'size'; source: Source; first: D66 | null; needsSecond: boolean; error: string | null }
    | { kind: 'position'; source: Source; size: RoomSize; w: number; h: number; offset: number; placement: PlacementResult; canShrink: boolean }
    | { kind: 'exitCount'; draft: Draft; error: string | null }
    | { kind: 'exitType'; draft: Draft; count: number }
    | { kind: 'exits'; draft: Draft; count: number; exitType: string; chosen: Edge[]; dropped: number }
    | { kind: 'label'; draft: Draft; chosen: Edge[]; exitType: string }
    | { kind: 'gap'; door: Door; length: number; rect: Rect | null };
  export type Source = { kind: 'entrance'; cell: Cell } | { kind: 'exit'; doorId: string };
  export interface Draft { source: Source; room: Room; kindOf: 'room' | 'corridor'; sizeClass: SizeClass | null }
  export class PlayFlow {
    constructor(history: History, rng: Rng, newId: IdFn);
    readonly step: Step;
    subscribe(fn: (s: Step) => void): () => void;
    startEntrance(cell: Cell): void;     // valid only on an empty map with no entrance
    startFromExit(doorId: string): void; // valid only for an open exit
    enterSize(primary: string, secondary: string): void;  // typed; uses parseDie; sets error on bad input
    rollSize(): void;
    swap(): void; slide(offset: number): void; shrink(): void; place(): void;
    enterExitCount(text: string): void; rollExitCount(): void;
    chooseExitType(type: string): void;
    toggleExit(edge: Edge): void;        // only edges from allowedExitEdges(draftMap, room.id, chosen)
    placeExitsForMe(firstWallD6: number | 'roll'): void;
    finish(label: RoomLabel | null): ExecResult;  // commits ONE command; returns the History result
    startGap(doorId: string): void; setGapLength(n: number): void; placeGap(): ExecResult;
    cancel(): void;
    /** The map as it would look with the draft room (for highlights / ghost); equals history.map when idle. */
    readonly draftMap: DungeonMap;
    /** Path the token should animate after the last commit (null if none). */
    readonly lastWalk: Cell[] | null;
  }
  ```
  Flow rules:
  - **Entrance:** skip the doubles rule, skip `exitCount` (fixed at 3) and skip `exitType` (archway). Exits are auto-placed with `placeExitsClockwise`, and the user can still toggle them in `exits`.
  - **Exit types:** small rooms and corridors skip `exitType` (archway). Corridors skip `label`.
  - **Count 0:** a count of 0 skips `exitType` and `exits`.
  - **Exit placement:** `toggleExit` respects the remaining count. `placeExitsForMe` fills the remaining exits clockwise and reports `dropped`.
  - **History changes:** a History change while not idle (undo, redo or execute from elsewhere) **cancels the draft**. Subscribe to History in the constructor.
  - **Corridors:** a `position` with `min(w,h) === 1` after placement, or a corridor roll, produces `kindOf: 'corridor'`. The entrance room is always `'room'`.

- [ ] **Step 1: Write the failing tests**, using a seeded rng and `sequentialIds`:
  - **Typed size `'7','2'`:** `step.error` is set and the step stays `size`. `'4','4'` → `needsSecond` is true. Then `'3','2'` → `position` with w 7, h 6.
  - **Full room path:** exit → size `'3','4'` → place → exit count `'4'` (2 exits) → wooden → place-for-me → finish → `history.undoLabel === 'Add Room 2'`. Room 2 has 2 wooden exits, each with an exit square. `lastWalk` ends at the room centre.
  - **Entrance path:** startEntrance → size → place → `exits` pre-filled with 3 → finish → one undo clears it.
  - **Small room** (`'2','3'`) skips `exitType`, and its exits are archways.
  - **Corridor roll** (`'1','4'`) skips `label`.
  - **Count `'1'`** gives 0 exits, then straight to `label`.
  - **Cancel at every step** leaves `history.map` unchanged (`toBe` the same object).
  - **Review Focus 2:** mid-flow `history.undo()` → `step.kind === 'idle'`, and the next room number is still contiguous.
  - **Review Focus 3:** an exit whose front square is 1 deep → `startFromExit` sets an error ("No space beyond this exit") and stays idle. A blocked rolled size → `position.canShrink` is true; `shrink()` yields an ok placement.
  - **Gap:** startGap → length 2 → placeGap → `undoLabel === 'Add corridor'`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `src/interaction/playflow.ts`. Keep it framework-free: no Svelte, no DOM.
- [ ] **Step 4: Run** `npm test && npm run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(interaction): play-flow state machine`.

### Task 8: Renderer and camera additions

**Files:**
- Create: `src/render/hit.ts`
- Modify: `src/render/camera.ts`, `src/render/renderer.ts`, `src/render/draw.ts`, `src/render/theme.ts`, `src/systems/dungeon/classic.ts`
- Test: `tests/render/hit.test.ts`, `tests/render/camera.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // hit.ts
  export interface Pick { cell: Cell; edge: Edge | null; door: Door | null; room: Room | null; exit: Door | null }
  export const EDGE_TOLERANCE = 0.3;   // squares; snaps to the nearest edge within this distance of it
  export function pick(map: DungeonMap, world: Point): Pick;
  // camera.ts
  export function clampCamera(c: Camera, bounds: Rect, viewW: number, viewH: number, margin?: number): Camera;
  export function pinchCamera(c: Camera, before: [Point, Point], after: [Point, Point]): Camera;
  export function wheelFactor(deltaY: number, deltaMode: number): number;  // 0=px,1=line,2=page
  // renderer.ts (MapRenderer)
  setOverlay(fn: ((ctx: CanvasRenderingContext2D, time: number) => void) | null): void;  // drawn in world units every frame after the token layer
  screenToWorldPoint(clientX: number, clientY: number): Point;  // accounts for canvas rect
  ```
  Behaviour:
  - Exit stubs move from `renderStatic` into the per-frame dynamic layer, so token moves don't rebuild the cache. `renderStatic` gains `options?: { exitStubs?: boolean }` (default true) so PNG export can include them.
  - Padlocks: a closed padlock when `locked`, an open shackle when not, and the `quality` number drawn beside it when present.
  - The theme gets `highlight`, `ghostOk` and `ghostBad` colours.

- [ ] **Step 1: Write the failing tests:**
  - `pick` at a square's centre gives that square with `edge: null`. Near the middle of a room's top wall it gives that N edge, plus the door if there is one. An open exit gives `exit` set. Points outside the world still return a cell (no throw).
  - `clampCamera` keeps at least `margin` px of the world bounds on screen at any pan.
  - `pinchCamera`: fingers spreading to double the distance doubles the scale, and the midpoint's world point stays fixed. A two-finger translate pans.
  - `wheelFactor(100,0) < 1`, `wheelFactor(-100,0) > 1`, and `wheelFactor(3,1)` ≈ `wheelFactor(48,0)`.
  - **Review Focus 5:** `clampCamera` after a viewport change from 1180×820 to 820×1180 still satisfies the margin.
- [ ] **Step 2–4:** FAIL → implement → PASS, plus a visual check: run the dev server and `node scripts/screenshot.mjs`. The demo map must look as before, apart from the padlock style.
- [ ] **Step 5: Commit** `feat(render): overlay hook, hit testing, touch camera, padlock states`.

### Task 9: App shell — layout, toolbar, undo/redo, coverage, new map

**Files:**
- Create: `src/ui/historyStore.ts`, `src/ui/AppShell.svelte`, `src/ui/Toolbar.svelte`, `src/ui/MapView.svelte`, `src/ui/StepPanel.svelte`, `src/ui/NewMapDialog.svelte`, `src/ui/Menu.svelte`, `scripts/visual.mjs`
- Modify: `src/App.svelte`. It becomes a one-liner mounting `AppShell`. `src/app/demo.ts` stays, reachable from the menu as "Load demo map".
- Test: `tests/ui/historyStore.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // historyStore.ts — Svelte store contract
  export function historyStore(h: History): { subscribe(run: (s: HistoryView) => void): () => void };
  export interface HistoryView { map: DungeonMap; canUndo: boolean; canRedo: boolean; undoLabel: string | null; redoLabel: string | null }
  export type Tool = 'play' | 'door' | 'stairs' | 'note' | 'select';
  ```
- **Layout A** (spec §7):
  - a top toolbar: menu, Undo "Undo <label>", Redo, the 5 tool buttons, and the coverage badge (`Math.round(coverage*100)%`)
  - `MapView` on the left
  - `StepPanel` on the right at ~30% width, collapsible to a 48 px strip, and a bottom sheet below 700 px width
- `MapView`:
  - owns the `MapRenderer`
  - ResizeObserver plus dpr handling, re-fitting on the first non-zero size
  - pointer tracking by pointerId: one primary pointer pans or taps (a tap = moved < 8 px), two pointers pinch
  - the wheel uses `wheelFactor`, and the camera is always passed through `clampCamera`
  - it emits `tap(pick: Pick)` to the shell
- `NewMapDialog`: width and height 20–100 (default 25), level, title. Confirms before discarding the current map ("This replaces the current map — there's no saving yet").

- [ ] **Step 1: Write the failing test** `tests/ui/historyStore.test.ts`: subscribe emits immediately with the current view; execute, undo and redo each emit a new view with the right `undoLabel`; unsubscribe stops emissions.
- [ ] **Step 2–4:** FAIL → implement the store → PASS. Then build the components.
- [ ] **Step 5: Visual check.** `scripts/visual.mjs <url> <outDir>` drives the app at 1180×820 with dpr 2 and `hasTouch: true`, and saves `01-empty.png` (the empty new map with the toolbar and the panel hint). Confirm:
  - every toolbar button's bounding box is ≥ 44×44 px (the script asserts this via `getBoundingClientRect`)
  - there are no page errors
  - the screenshot shows layout A
- [ ] **Step 6: Run** `npm test && npm run typecheck && npx vite build` → PASS.
- [ ] **Step 7: Commit** `feat(ui): app shell with toolbar, map view, step panel, new map`.

### Task 10: Play flow in the UI

**Files:**
- Create: `src/ui/steps/SizeStep.svelte`, `src/ui/steps/PositionStep.svelte`, `src/ui/steps/ExitCountStep.svelte`, `src/ui/steps/ExitTypeStep.svelte`, `src/ui/steps/ExitsStep.svelte`, `src/ui/steps/LabelStep.svelte`, `src/ui/steps/GapStep.svelte`, `src/ui/DiceEntry.svelte`, `src/ui/overlay.ts`
- Modify: `src/ui/AppShell.svelte`, `src/ui/StepPanel.svelte`, `scripts/visual.mjs`
- Test: `tests/ui/overlay.test.ts`

**Interfaces:**
- Consumes: `PlayFlow` (Task 7), `MapRenderer.setOverlay` / `walkToken` / `pick` (Task 8).
- Produces: `export function overlayFor(step: Step, map: DungeonMap): OverlayShape[]` (pure) with `OverlayShape = { kind: 'cell' | 'edge' | 'rect'; at: Cell | Edge | Rect; tone: 'highlight' | 'ok' | 'bad' }`, plus `drawOverlay(ctx, shapes, theme)`.
  - **idle** (Play tool): every open exit is a highlight. On an empty map, the entrance cells are highlighted.
  - **position:** the ghost rect, `ok` or `bad`.
  - **exits:** allowed edges are highlights; chosen edges are `ok`.
  - **gap:** the corridor rect.
- `DiceEntry`: two large inputs, red and blue (one for a D6), plus a "🎲 Roll for me" button. Shows `step.error`.
- After `finish()` or `placeGap()` succeeds, the shell calls `renderer.walkToken(flow.lastWalk, …)` purely to animate, because the model already contains the final token position. A map tap during the walk cancels the animation only.
- **With Play selected and idle,** tapping an open exit → `startFromExit`. Tapping floor → `findPath` + `moveToken` via History, then the walk is animated. Taps that match neither show a one-line hint. Taps during non-idle steps that don't belong to that step are ignored.

- [ ] **Step 1: Write the failing tests** `tests/ui/overlay.test.ts`:
  - idle on an empty map → one `cell` highlight per entrance cell (width count)
  - idle with exits → one `edge` highlight per open exit
  - position, ok and bad → tone `ok` / `bad`
  - exits → allowed edges are highlights and chosen edges are `ok`
- [ ] **Step 2–4:** FAIL → implement → PASS. Then build the step components.
- [ ] **Step 5: Visual check.** Extend `scripts/visual.mjs` to play an entrance plus two rooms by tapping. Typed dice: entrance `'3','4'`; room 2 `'4','4'` then `'2','1'`; and the exits. Save screenshots `02-entrance-size.png`, `03-position.png`, `04-exits.png`, `05-label.png`, `06-two-rooms.png`. Confirm in the images:
  - the ghost is green when valid
  - the highlights line up with walls
  - the step panel never covers the map area
  - the token is in the newest room
- [ ] **Step 6: Run** `npm test && npm run typecheck && npx vite build` → PASS.
- [ ] **Step 7: Commit** `feat(ui): guided play flow with dice entry and map overlays`.

### Task 11: Door, Stairs, Note and Select tools

**Files:**
- Create: `src/ui/tools/DoorEditor.svelte`, `src/ui/tools/StairsEditor.svelte`, `src/ui/tools/NoteEditor.svelte`, `src/ui/tools/RoomInspector.svelte`
- Modify: `src/ui/AppShell.svelte`, `scripts/visual.mjs`

**Interfaces:**
- Consumes: `checkDoorTool`, `addDoorWithTool` (Task 5); `updateDoor`, `removeDoor`, `addFeature`, `updateFeature`, `removeFeature`, `updateRoom` (commands); `pick` (Task 8).
- **Door:**
  - Tap a door to edit it: type buttons with symbols, a Secret toggle, Padlock (None / Locked / Opened), and a Quality number (1–12, optional).
  - **Remove** is hidden when the door is any room's `entryDoorId`, with the note "This is how Room N was entered".
  - Tap a bare wall edge: `checkDoorTool` → if ok, offer "Add door here" with a type (wooden default) and a Secret toggle. Otherwise show the reason.
- **Stairs:** tap floor to add stairs (Down/Up). Tap stairs to edit or remove them.
- **Note:** tap floor to add a note (a textarea). Tap a note to edit or remove it.
- **Select:**
  - Tap a room to show its number, type (editable), Unique, narrative (editable), size W×H, class, and exits count (read-only).
  - Corridors show "Corridor" with size only.
  - There are no move, resize or delete controls.
- Every change goes through `History.execute`, and any rejection reason is shown in the panel.

- [ ] **Step 1: Visual check (TDD at the component level isn't required; the logic is tested in Tasks 5–6).** Extend `scripts/visual.mjs` to:
  - lock a door, set quality 7, and screenshot `07-door-locked.png` (the closed padlock with a 7)
  - add stairs and a note
  - select a room and screenshot `08-inspector.png`
  - try to remove an entry door and assert the Remove button isn't present
- [ ] **Step 2: Run** `npm test && npm run typecheck && npx vite build` → PASS.
- [ ] **Step 3: Commit** `feat(ui): door, stairs, note and select tools`.

### Task 12: Clean-up and final verification

**Files:**
- Modify: `src/core/placement.ts` (remove `validExitEdges` if unused), `docs/superpowers/plans/2026-10-31-plan-1-followups.md` (tick off the items done here)

- [ ] **Step 1:** `grep -rn validExitEdges src` → if only its definition and tests remain, delete it and its tests.
- [ ] **Step 2: Run** `npm test && npm run typecheck && npx vite build` → all PASS.
- [ ] **Step 3: Layering:** `grep -rnE "from '\.\./(render|ui|interaction|systems)|svelte|document|window" src/core || echo CORE-CLEAN` → `CORE-CLEAN`. Then `grep -rnE "svelte|document|window" src/interaction || echo FLOW-CLEAN` → `FLOW-CLEAN`.
- [ ] **Step 4:** Run the full `scripts/visual.mjs` walkthrough once more. There should be no page errors, and all screenshots should be produced.
- [ ] **Step 5:** Update the follow-ups doc. Mark the Plan 3 items as done, leave the Plan 4 items, and add the deferred "non-null `entryDoorId`" invariant as an open item.
- [ ] **Step 6: Commit** `chore: finish Plan 3`.
