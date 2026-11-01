# Plan 6: Room Tables and Dungeon Levels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Once a room is placed, roll on the right room table for the map's dungeon level. Each level gets its own map, and the player goes down the stairs (with the ration rule) to start the next one.

**Architecture:**
- **Room data:** the table file gains per-level room tables and Exit Type tables. Lookup rules live in `src/systems/dungeon/roomTables.ts`.
- **Placement flow:** the existing label step, which comes before the room is committed, becomes the Room step. Rolling fills the room's label and the exit type, so placement stays one undo step. A room that was skipped can be rolled later as its own undo step.
- **Levels:** maps carry a numeric level. Earlier levels are kept in the campaign meta, read-only and outside History. Going down is a confirmed reset to a fresh map.

**Tech Stack:** TypeScript 6, Svelte 5 runes, Vite 8, Vitest 5, Playwright Firefox. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-02-room-tables-and-levels-design.md`. §12 settles most of the details.

**Plan ruling, refining the spec's §12 "second undo step":**
- In the normal flow the roll happens in the existing pre-commit label step. The room is then committed once, with the rolled label, contents and exit type.
- This gives the order the spec requires: exits placed, then the roll, then the exit type applied. It also avoids rewriting doors.
- The separate undo step is used only when rolling later for a room that was skipped.

## Global Constraints

- **No rulebook content in `src/`, `tests/`, `docs/`, `dist/` or git.**
  - Fixtures and doc examples use invented names and values.
  - The user's real data lives only in `local-data/`, which is git-ignored.
  - Never open `pdf/` except in Task 7.
- **History:** every game-state change goes through `History.execute`. Placing a room with its roll is one step, and rolling later is one step.
- **Layering:** `src/core` stays free of DOM, Svelte, persistence and systems imports.
- **Versions:** there is no backwards compatibility (user decision, 2026-11-01). If the saved shape changes, bump `SAVE_FORMAT` and `CURRENT_SCHEMA_VERSION` together, from 2 to 3, with no migration.
- **Map-only play** still works with no table file: there is no roll, and the existing manual exit-type step and label step are unchanged.
- **Device:** touch targets are at least 44 px, on an iPad in landscape.
- **Commits** end with a blank line, then the Co-Authored-By trailer and the Claude-Session line.
- **Process:** stop servers by PID, never with `pkill -f`. Stage files by explicit path.

## Review Focus

1. **Unique rooms:**
   - "Roll for me" must never loop forever: it is capped at 50 attempts, or stops once every remaining entry is a unique type already used.
   - A typed duplicate is refused with "Already on this level — roll again".
   - *(Task 2 tests; Task 4 visual check.)*
2. **A level with no room tables, or no table file at all:** placement still works, and the Room step offers Skip or manual entry. It never stalls. *(Task 4.)*
3. **Going down never loses data:** after going down and reloading, the game is on Level 2 with the hero changed by the ration rule, and Level 1 can still be viewed and is included in the export. *(Task 6.)*
4. **Rolling later for a skipped room** changes only that room's own exits. It leaves the door the player came in through, and any neighbouring room's doors, untouched. *(Task 2 command test; Task 5 visual check.)*
5. **A table file with an unknown exit id or a missing D66 entry** is refused with a located message, and any table file already loaded is kept. *(Task 1.)*

---

### Task 1: Room tables and Exit Type tables in the table file

**Files:**
- Modify: `src/systems/dungeon/tables.ts`, `tests/fixtures/dungeon-tables.fixture.json`, `docs/table-file-format.md`
- Test: `tests/systems/tables.test.ts`

**Interfaces — Produces** (in `tables.ts`):

```ts
export type ExitSpec = { door: 'archway'|'wooden'|'metal'|'reinforced'|'curtain'|'portcullis'|'stoneSlab'; locked?: boolean } | 'random';
export interface RoomEntry { type: string; description: string; encounter: string; exit: ExitSpec; unique: boolean }
export interface SmallRoomEntry { type: string; description: string; unique: boolean }   // exits always archway
export interface LevelTables {
  level: number; name: string; exitTable: string;               // key into exitTables, e.g. "EXT1"
  rooms: Record<string, RoomEntry>;                              // keys "11".."66" (36)
  smallRooms: Record<string, SmallRoomEntry>;                    // keys "2".."12"
  largeRooms: Record<string, RoomEntry>;                         // keys "2".."12"
}
// DungeonTables.tables gains (both optional so older test files still parse):
levels?: LevelTables[];
exitTables?: Record<string, Record<string, Exclude<ExitSpec, 'random'>>>;  // each keyed "11".."66"
```

**Validation rules:**
- `rooms` and every exit table have exactly the 36 D66 keys.
- `smallRooms` and `largeRooms` have the keys `2`–`12`.
- Every `exit.door` is one of the allowed ids. An unknown id gives `The table file is damaged: Levels[0] rooms 23 exit — use one of archway, wooden, …`.
- `exitTable` must name a key in `exitTables`.
- `level` values are unique integers from 1 to 10.

- [ ] **Step 1: Extend the fixture and write the failing tests.**
  - Fixture: add one invented level (level 1, name "Test Halls", exitTable "EXT1") with full invented tables, plus an invented EXT1.
  - Tests:
    - the fixture parses
    - a missing D66 key (delete `"34"`) is refused with a message naming `rooms 34`
    - an unknown door id is refused, listing the allowed ids
    - an `exitTable` that names no table is refused
    - a duplicate `level` is refused
    - a file with no `levels` still parses (Review Focus 5)
- [ ] **Step 2–4:** FAIL → implement → PASS (`npx vitest run tests/systems/tables.test.ts`, then `npm test && npm run typecheck`).
- [ ] **Step 5: Document it in the format doc.**
  - Cover the new tables with an invented example.
  - Give a mapping list from book wording to door ids: Archways→archway, Wooden Doors→wooden, Reinforced Doors→reinforced, Metal Doors→metal, Curtains→curtain, Portcullises→portcullis, "… all locked"→`locked: true`.
  - List the source pages: Core Rules p. 13; Codex p. 35, 40, 42–43 and 46 for Level 1. Deeper levels are listed in the Codex contents.
- [ ] **Step 6: Commit** `feat(dungeon): room and exit-type tables in the table file`

### Task 2: Room roll rules and the "roll later" command

**Files:**
- Create: `src/systems/dungeon/roomTables.ts`
- Modify: `src/core/types.ts` (Room gains `contents`), `src/core/commands.ts` (a generic command if needed)
- Test: `tests/systems/roomTables.test.ts`

**Interfaces — Consumes:** Task 1 types, and `classify` from `rules.ts`.

**Interfaces — Produces:**

```ts
// core/types.ts
export interface RoomContents { table: 'rooms' | 'small' | 'large'; roll: string; type: string; description: string; encounter: string; door: string; locked: boolean }
// Room gains: contents?: RoomContents
// roomTables.ts
export type RoomTableKind = RoomContents['table'];
export function tableKindFor(rect: Rect, size: RoomSize): RoomTableKind | null;   // null for corridor; small/large/normal→rooms via classify
export function levelTables(t: DungeonTables | null, level: number): LevelTables | null;
export function lookupRoom(lv: LevelTables, kind: RoomTableKind, dice: number[]): RoomEntry | SmallRoomEntry;  // rooms: [red, blue] → key `${red}${blue}`; small/large: sum of 2 dice
export function resolveExit(lv: LevelTables, t: DungeonTables, spec: ExitSpec, exitDice?: number[]): { door: string; locked: boolean };  // 'random' needs exitDice (D66)
export function uniqueTaken(map: DungeonMap, type: string): boolean;   // case-insensitive, trimmed, over rooms' contents.type
export function rollRoom(lv, t, kind, map, rng): { dice: number[]; entry; rerolls: number; capped: boolean };  // up to 50 attempts; stops when all remaining unique entries are taken
export function contentsFrom(kind, dice, entry, exit): RoomContents;
export function applyRoomRoll(room: Room, contents: RoomContents): Command;   // label.type=contents.type, label.unique=entry.unique, label.narrative=description; sets room.contents; rewrites doors on this room's perimeter except entryDoorId and except doors shared with another room's interior, to door/locked
```

- [ ] **Step 1: Write the failing tests, using the fixture.**
  - `tableKindFor`:
    - an area of 6 gives `small`
    - a doubled 6×6 gives `large`
    - a non-doubled area of 32 gives `rooms`
    - a 1-wide room gives null
  - Lookup:
    - red 3, blue 4 → entry `"34"`
    - a small-room roll of 5 and 6 → entry `"11"`
  - Exits:
    - `resolveExit('random')` with dice [2,5] → the EXT1 `"25"` door
    - a fixed spec returns its door and `locked`
    - small rooms always give archway
  - Unique rooms:
    - `uniqueTaken` ignores case and surrounding spaces
    - `rollRoom` re-rolls a taken unique entry using a scripted rng
    - with every unique entry taken and a scripted rng that only hits them, it stops at 50 with `capped: true` (Review Focus 1)
  - **`applyRoomRoll` (Review Focus 4):** on a map with two rooms where room B was entered from room A, applying it to B:
    - changes B's own exit doors to the rolled type
    - leaves the shared entry door, and A's other doors, unchanged
    - sets the label and contents
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Commit** `feat(dungeon): room-table lookup, unique re-rolls and roll-later command`

### Task 3: Numeric levels, earlier levels kept, and save format 3

**Files:**
- Modify: `src/core/types.ts` (`DungeonMap.level: number`), `src/core/campaign.ts`, `src/core/serialize.ts`, `src/persistence/record.ts`, `src/persistence/startup.ts`, `src/persistence/files.ts`, `src/ui/AppShell.svelte` (meta wiring only)
- Test: `tests/core/serialize.test.ts`, `tests/persistence/record.test.ts`, `tests/ui/startup.test.ts`, `tests/persistence/files.test.ts`

**Interfaces — Produces:**
- `DungeonMap.level: number`. `createMap` defaults it to 1. Validation requires an integer from 1 to 10. `Room.contents` is validated when present.
- `CURRENT_SCHEMA_VERSION = 3` and `SAVE_FORMAT = 3`. Update the coupling test.
- `CampaignMeta` gains `earlierLevels: DungeonMap[]` (each validated like a map, plus `checkInvariants`).
- `campaignFrom(meta, map, hero)` returns `maps: [...earlierLevels, map]`, with `activeMapId = map.id`.
- `metaFrom(c)` puts every map except the active one into `earlierLevels`.
- Import of a campaign with several maps restores `earlierLevels`.

- [ ] **Step 1: Write the failing tests.**
  - A new map has `level === 1`.
  - `level: "1"` (a string) is refused.
  - A record holding two earlier levels round-trips through `encodeSave`, `decodeSave` and `decideStartup`.
  - An exported campaign with two maps imports with `earlierLevels.length === 1`.
  - A format 2 record is refused with the "older test version" message.
  - A damaged earlier-level map leads to the damaged-save path.
- [ ] **Step 2–4:** FAIL → implement → PASS (`npm test && npm run typecheck && npm run e2e:persistence`).
- [ ] **Step 5: Commit** `feat(core): numeric dungeon levels and earlier levels kept in the save (format 3)`

### Task 4: The Room step in the placement flow

**Files:**
- Modify: `src/interaction/playflow.ts`, `src/core/playflow.ts`, `src/ui/steps/LabelStep.svelte` (becomes the Room step UI), `src/ui/steps/ExitTypeStep.svelte` (unchanged, but skipped when tables are loaded), `src/ui/StepPanel.svelte`, `src/ui/AppShell.svelte`, `src/ui/DiceEntry.svelte` (add a `2d6` mode if needed)
- Test: `tests/interaction/playflow.test.ts`, plus visual checks

**Interfaces — Consumes:** Task 2 functions and Task 1 tables.

**Interfaces — Produces:**

```ts
// PlayFlow
setTables(t: DungeonTables | null): void;      // AppShell calls it whenever tables change
// 'label' step gains: roll: { kind: RoomTableKind; level: number; available: boolean } | null   (null for corridors/entrance)
rollRoomTable(): { dice: number[]; entry; rerolls: number; capped: boolean } | null;  // for the animated "Roll for me"
applyRoomTableResult(dice: number[]): void;    // validates typed or rolled dice; refuses taken unique with error "Already on this level — roll again"
rollExitTable(): number[]; applyExitTableResult(dice: number[]): void;   // when the entry's exit is 'random'
skipRoomTable(): void;                          // fall back to the manual label form
```

**Behaviour:**
- **Exit type when tables are loaded:** when `levelTables(tables, map.level)` is present and the room is not a corridor or the entrance, the `exitType` step is skipped and exits are placed with a temporary `archway`.
- **The label step:**
  - shows the Room roll with the right dice: red/blue for a D66, or two dice summed for 2D6
  - shows the result (type, description, encounter, exit)
  - on a "random" exit, follows up with an Exit Type roll
  - then commits, via `createRoomAndWalk` with the rolled label, `contents`, and door type and locked flag
- **Small rooms** always use archway.
- **Skip** gives the existing manual label form, with an exit type chooser (today's `exitType` choices), so a skipped room still gets the player's chosen door type.
- **No tables for this level:** show "Your table file has no Level N room tables" with Skip.
- **The UI:** reuse the `DiceEntry` animation and sound. Results show `DieFace`s.

- [ ] **Step 1: Write the failing flow tests, with the fixture tables and a scripted rng.**
  - A normal room places through to the label step with no `exitType` step.
  - Rolling and applying [3,4] commits the room with `label.type` = fixture `"34"`.type, sets its `contents`, and gives every exit door the fixture's door and locked values. It is one undo step labelled as today's "Add room".
  - A small room uses the small table and archways.
  - A "random" exit makes `applyExitTableResult([2,5])` apply the EXT1 door.
  - A typed duplicate unique result is refused (Review Focus 1).
  - With no tables, the flow is identical to today (the `exitType` step appears).
  - A level with no tables offers Skip, and Skip then commits with a manual label (Review Focus 2).
- [ ] **Step 2–4:** FAIL → implement the flow → PASS. Then build the UI.
- [ ] **Step 5: Visual check.** Using the fixture tables:
  1. Place a room, roll it, check the label on the map and the exit door types, then undo once to remove the whole room.
  2. Check a level with no tables using a fixture copy with no levels.
  3. Take screenshot `45-room-roll.png`.
- [ ] **Step 6: Run** `npm test && npm run typecheck && npx vite build && node scripts/visual.mjs && npm run e2e:persistence`. **Commit** `feat: roll on the room tables when a room is placed`

### Task 5: Level indicator, room inspector roll-later, encounter text

**Files:**
- Modify: `src/ui/AppShell.svelte` and/or `src/ui/Toolbar.svelte` (level indicator), the room inspector under `src/ui/tools/` (find it), `src/ui/StepPanel.svelte`
- Test: visual checks; unit-test any helper

**Behaviour:**
- **Level indicator:** "Level N · <name>" in the toolbar or step-panel header. The name comes from `levelTables(...).name`, and is left out when there are no tables.
- **Room inspector** (Select tool on a room):
  - shows `contents`: type, description, encounter and roll
  - a room without `contents` that is not a corridor or the entrance shows **Roll for this room**. This runs the Room roll UI (the same dice component), then `history.execute(applyRoomRoll(room, contents))` as one undo step labelled "Roll room N".

- [ ] **Step 1: Visual check.**
  1. Skip a room's roll, select it, choose Roll for this room, then check its label, exit types and that the entry door is unchanged (Review Focus 4).
  2. Check the inspector shows the encounter text and the level indicator shows "Level 1 · Test Halls".
- [ ] **Step 2: Run** the full checks. **Commit** `feat(ui): level indicator and roll-later from the room inspector`

### Task 6: Going down a level

**Files:**
- Modify: `src/systems/dungeon/hero.ts` (ration rule), `src/ui/AppShell.svelte`
- Create: `src/ui/StairsDialog.svelte`, `src/ui/LevelViewer.svelte`
- Test: `tests/systems/hero.test.ts`, plus visual checks

**Interfaces — Produces:**

```ts
// hero.ts
export function restOnStairs(h: Hero, opts: { eat: boolean; bandage: boolean }): Hero;
// eat (requires rations>0): rations-1, hp = min(hpBaseline, hp + 2*level + (bandage?2:0)) but never below current hp;
// not eating or no rations: hp = hp - min(20, floor(hp/2)) (no change if hp <= 0)
export function canEat(h: Hero): boolean;   // rations > 0
```

**Behaviour:**
- **When it's offered:** when the active map has a stairs-down feature, a **Go down to Level N+1** button appears in the step panel's idle view. At 75% coverage or more, with no stairs down placed, a gentle hint reads "Ready to finish this level? Place the stairs down in the final room."
- **`StairsDialog`:**
  - **With a hero:** "Eat a ration" (disabled when there are none) with a "Cloth or bandage" tick box, or "Don't eat". Each shows the resulting HP.
  - **Without a hero:** just "Go down".
  - **Confirm:**
    1. Blur the focused field.
    2. `meta.earlierLevels = [...meta.earlierLevels, history.map]`.
    3. Create a new map with `level + 1` and the same size settings.
    4. `history.reset(newMap, restedHero)`, then flush.
  - The new level starts with the normal entrance flow. The existing entrance rules already give 3 archways and no doubles; check this.
- **Level viewer:** the Menu gains **Earlier levels**, listing them by level. Choosing one opens `LevelViewer`, a full-screen read-only MapView of that map with a Close button, and no editing.

- [ ] **Step 1: Write the failing `restOnStairs` tests:**
  - eat: level 2, HP 5, baseline 20, bandage → 11, rations −1
  - eat when already at or above the baseline → no HP change, rations −1
  - don't eat, HP 50 → 30 (the loss capped at 20)
  - don't eat, HP 7 → 4
  - HP 0 → 0
  - `canEat` is false at 0 rations
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Visual check (Review Focus 3).**
  1. Place stairs down with the Stairs tool, choose Go down, eat a ration, then check the hero's HP and rations and that the toolbar shows Level 2 on a fresh map.
  2. Reload: still on Level 2.
  3. Open Earlier levels → Level 1 shows read-only.
  4. Export, and check the file holds 2 maps.
  5. Take screenshots `46-stairs.png` and `47-earlier-level.png`.
- [ ] **Step 6: Run** the full checks. **Commit** `feat: go down to the next dungeon level with the ration rule`

### Task 7: The user's own Level 1 room tables (local only)

This is done by a subagent explicitly allowed to read `pdf/` and write `local-data/`. Nothing it produces is committed except script fixes.

- [ ] **Step 1: Add the Level 1 tables to `local-data/dungeon-tables.json`.**
  - Read Codex p. 35 (EXT1, EXQ2), p. 40 (XX1L), p. 42–43 (Level 1 Rooms) and p. 46 (XX1S) from page images at high resolution.
  - Add `levels[0]` for level 1 with its name, and `exitTables`.
  - Use the door ids from Task 1's mapping, with `locked: true` for "all locked".
  - Transcribe the D66 dice keys from the dice pictures.
  - Validate the file with `parseTableFile`.
- [ ] **Step 2: Smoke-test in the app** with the real file: place several rooms of each size, then take screenshots to `local-data/screenshots/`.
- [ ] **Step 3: Report.** Note any entries that were hard to read, and confirm with `git status` that nothing is tracked.
