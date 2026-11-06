# Locked Doors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tapping a fresh lockable exit asks for a lock check first. A locked door can be picked, waited at for a patrol, or left alone, and each choice is fully handled.

**Architecture:** The rules are pure functions in `src/systems/dungeon/locks.ts`, and the door-state helpers are in `src/core/doorLock.ts`. Undo-step actions go in `src/ui/lockActions.ts`, in the style of `encounterActions.ts`. `PlayFlow` is **not** changed. A new Play selection `{ kind: 'lock' }` shows a `DoorLockPanel` in the step panel. When the door opens, `AppShell` starts the normal room or gap flow for that exit.

**Tech Stack:** TypeScript 6, Svelte 5, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-06-locked-doors-design.md`

## Global Constraints

- All table codes, item and creature names in tests, docs and commits are made up (`PAT1`, `PRAC1`, Grumbler, "Lock Pick +2 (3)"). No real Codex codes or names. Before merging, grep the branch diff for terms from `local-data/dungeon-tables.json`.
- Never commit `pdf/`, `local-data/` or `reference/`.
- Old saves and old table files must still load. Every new field is optional, and there's no save-format version bump.
- Secret doors are never locked or checked.
- Only `wooden`, `metal` and `reinforced` may appear in `doorLocks`. Archway, curtain, portcullis and stoneSlab are never checked.
- The lock-check D6, lock-quality 2D6 and pick 2D6 go through the floating roller as `DiceJob` requests (`RollCard`). No Shift.
- One undo step per roll result and per Wait.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `npm test` and `npm run typecheck` pass at the end of every task.

## Review Focus

1. **Undo across a lock action while the panel is open.** Undo must put the door back, and the panel must show the door's state as it now is (unchecked → the check roll again), not a stale stage. *Pinned in Task 7 (panel derives its stage from the door, not local state).*
2. **A table file reloaded or removed while the panel is open.** With `doorLocks` gone, an unchecked door's panel must not offer a check it can't do: it closes and the exit behaves as today. *Pinned in Task 6 (`lockGate` with `tables = null`) and Task 7.*
3. **A lock pick written with odd spacing or case** ("lock pick +1(4)", "LOCKPICK +0 (1)") must be found, and a used-up pick must vanish without touching neighbouring items. *Pinned in Task 3.*
4. **Waiting while a fight is already open.** This mustn't merge the patrol into the other fight or lose `waitingDoorId`. The Wait button is disabled with "Finish the fight first". *Pinned in Task 5 (refusal) and Task 7.*
5. **Winning a fight that wasn't a wait** must behave exactly as today (token's room gets the marks, no door changes). *Pinned in Task 4.*

---

### Task 1: Table file `doorLocks` and `patrolTable`

**Files:**
- Modify: `src/systems/dungeon/tables.ts` (types near `LevelTables` / `DungeonTables`; validation in `roomTablesProblem` / `roomLevelsProblem`)
- Modify: `src/systems/dungeon/template.ts`
- Modify: `docs/table-file-format.md`
- Modify: `tests/fixtures/dungeon-tables.fixture.json`
- Test: `tests/systems/tables.test.ts`

**Interfaces:**
- Produces: `export type LockableDoor = 'wooden' | 'metal' | 'reinforced'`; `DungeonTables['tables'].doorLocks?: Partial<Record<LockableDoor, number>>`; `LevelTables.patrolTable?: string`.

- [ ] **Step 1: Write the failing tests** (copy the fixture, change one thing, run `validateTableFile`):
  - `doorLocks: { wooden: 6, metal: 4, reinforced: 5 }` and `dungeonLevels[0].patrolTable: 'PRAC1'` → `ok: true`.
  - Neither present → `ok: true` (old files).
  - `doorLocks: { metal: 7 }` → error contains `Door Locks metal (a whole number from 1 to 6)`.
  - `doorLocks: { archway: 3 }` → error contains `Door Locks archway (only wooden, metal or reinforced)`.
  - `doorLocks: []` → error contains `Door Locks`.
  - `patrolTable: 'NOPE'` → error contains `Dungeon Levels[0] patrolTable (no table named NOPE in Creature Tables)`. Match the existing `at` format that `rows()` produces for this list.
  - `blankTableFile().tables.doorLocks` equals `{ wooden: null, metal: null, reinforced: null }`, and `blankTableFile().tables.dungeonLevels[0].patrolTable === ''`.

- [ ] **Step 2: Run** `npx vitest run tests/systems/tables.test.ts`. Expected: the new tests FAIL.

- [ ] **Step 3: Implement.** Add a `doorLocksProblem(t)` and chain it into `roomTablesProblem`. Check `patrolTable` inside `roomLevelsProblem`; it needs `t.creatureTables`, so pass it in. Also: add both fields to the template, add `"doorLocks"` plus a `patrolTable` on the level to the fixture (made-up values 6/4/5, `PRAC1`), and add a "Locked doors" section to `docs/table-file-format.md`. That section says: `doorLocks` maps a door type to the lowest D6 roll that locks it; `patrolTable` is the level's patrol creature table; both are optional. Use made-up numbers in its example.

- [ ] **Step 4: Run** `npx vitest run tests/systems` then `npm run typecheck`. Expected: PASS.

- [ ] **Step 5: Commit** `feat(tables): the table file may give door lock numbers and each level's patrol table`

### Task 2: Door state: `checked` and `damaged`

**Files:**
- Modify: `src/core/types.ts` (`Door`, `DoorLock`)
- Modify: `src/core/serialize.ts` (`doorOk`)
- Create: `src/core/doorLock.ts`
- Test: `tests/core/doorLock.test.ts`, `tests/core/serialize.test.ts`

**Interfaces:**
- Produces:
  - `Door.checked?: true`; `DoorLock.damaged?: true`
  - In `src/core/doorLock.ts` (all pure, all return a new `Door`):
    - `markChecked(d: Door): Door` (`checked: true`, lock untouched)
    - `lockDoor(d: Door): Door` (`checked: true`, `lock: { locked: true, note: d.lock?.note ?? '', quality: d.lock?.quality ?? null }`)
    - `setLockQuality(d: Door, q: number): Door` (requires `d.lock`; else returns `d`)
    - `damageLock(d: Door): Door` (`lock.damaged = true`, still locked)
    - `openLock(d: Door): Door` (`lock.locked = false`, `damaged` removed, `checked: true`)
    - `isChecked(d: Door): boolean` (`d.checked === true || d.lock !== null`)

- [ ] **Step 1: Write failing tests.** One per helper with the exact field results above, including that `openLock` drops `damaged` and keeps `quality`. Serialize tests: a save whose door lacks `checked`/`damaged` loads; `checked: false`, `checked: 'yes'` and `lock.damaged: 1` are refused (the existing refusal shape for bad doors).
- [ ] **Step 2: Run** `npx vitest run tests/core`. Expected: FAIL.
- [ ] **Step 3: Implement** the type fields, `doorOk` (`checked` absent or `true`; `damaged` absent or `true`) and `doorLock.ts`.
- [ ] **Step 4: Run** `npx vitest run tests/core && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(doors): a door remembers its lock check and a damaged lock`

### Task 3: Lock rules (pure)

**Files:**
- Create: `src/systems/dungeon/locks.ts`
- Test: `tests/systems/locks.test.ts`

**Interfaces:**
- Consumes: `isChecked` (Task 2), `DungeonTables.doorLocks`, `LevelTables.patrolTable` (Task 1), `Hero` from `hero.ts`.
- Produces:
  - `type LockGate = 'check' | 'locked' | null`
  - `lockGate(door: Door, tables: DungeonTables | null): LockGate`. `'locked'` when `door.lock?.locked`, whatever the tables. Otherwise `'check'` when not secret, the type is in `tables.tables.doorLocks`, and `!isChecked(door)`. Otherwise `null`. Secret doors with a lock still return `'locked'` (a hand-set lock), but are never `'check'`.
  - `lockThreshold(tables: DungeonTables | null, type: string): number | null`
  - `rollLocks(threshold: number, roll: number): boolean` (`roll >= threshold`)
  - `lockTableLines(tables: DungeonTables): string[]`, e.g. `["Wooden: locked on 6", "Reinforced: locked on 5–6", "Metal: locked on 4–6"]`. Sorted from highest threshold to lowest, with an en dash; "on 6" when the threshold is 6.
  - `interface LockPick { index: number; text: string; bonus: number; uses: number }`
  - `parseLockPick(item: string): { bonus: number; uses: number } | null`, with regex `/\block\s?pick\s*([+-−]\d+)\s*\((\d+)\)/i` (accept `−` as minus).
  - `findLockPicks(hero: Hero): LockPick[]` (over `hero.smallItems`)
  - `useLockPick(hero: Hero, index: number): Hero`. Rewrites that item's `(n)` to `(n−1)`, keeping the rest of its text; removes it at 0.
  - `waitFood(hero: Hero, eat: boolean): Hero`. Eat (only if `rations > 0`): rations − 1, `hp = max(hp, min(hpBaseline, hp + 2 × level))`. Otherwise: `hp = max(0, hp − 2 × level)`.
  - `patrolTableFor(tables: DungeonTables | null, level: number): string | null`

- [ ] **Step 1: Write failing tests:**
  - `lockGate`:
    - With made-up `doorLocks { wooden: 6, metal: 4, reinforced: 5 }`: an unchecked metal door → `'check'`.
    - The same door when secret → `null`.
    - An archway, curtain, portcullis or stoneSlab → `null`.
    - `checked: true` → `null`.
    - `lock: { locked: false }` → `null`.
    - `lock.locked: true` → `'locked'`, also with `tables = null`.
    - `tables = null` and unchecked → `null`.
  - `rollLocks(4, 3) === false`, `rollLocks(4, 4) === true`.
  - `lockTableLines` gives the exact three lines above.
  - `parseLockPick`:
    - These each parse: "Lock Pick +2 (3)" → `{ bonus: 2, uses: 3 }`; "lock pick +1(4)"; "LOCKPICK +0 (1)"; "Lock Pick −1 (2)" → bonus −1; "Rusty Lock Pick +2 (3)".
    - These each return `null`: "Lock Pick", "Lock Pick +2", "Lock Box +2 (3)".
  - `useLockPick`:
    - "Lock Pick +2 (3)" → "Lock Pick +2 (2)".
    - At "(1)" the item is removed, and the other items keep their order.
  - `waitFood`:
    - Level-2 hero, hp 5, baseline 12, 1 ration, eat → hp 9, rations 0.
    - Eat at hp 11 → 12 (capped).
    - Eat at hp 15 (above baseline) → stays 15.
    - Go hungry at hp 3, level 2 → 0.
    - Eat with 0 rations → treated as hungry.
  - `patrolTableFor`:
    - Level 1 → `'PRAC1'` with the fixture.
    - Level 2 → `null`.
    - `tables = null` → `null`.
- [ ] **Step 2: Run** `npx vitest run tests/systems/locks.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `locks.ts` to those signatures.
- [ ] **Step 4: Run** the same command, then `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(locks): rules for lock checks, lock picks and waiting for a patrol`

### Task 4: Waiting fights open their door when won

**Files:**
- Modify: `src/systems/dungeon/combat.ts` (`Encounter`, the validation near the `throws` block)
- Modify: `src/ui/encounter/encounterActions.ts` (`winFight`)
- Test: `tests/systems/combat.test.ts`, `tests/ui/encounterActions.test.ts`

**Interfaces:**
- Consumes: `openLock` (Task 2), `roomsAcross` (`src/core/query.ts`).
- Produces: `Encounter.waitingDoorId?: string` (kept by `copy` through its spread).

- [ ] **Step 1: Write failing tests:**
  - Validation: an encounter with `waitingDoorId: 'd1'` is valid; `waitingDoorId: 3` fails with `waitingDoorId`.
  - `winFight` with `waitingDoorId`:
    - Set up a map with room A (the exit's room), locked door `d1` on A's wall, and the token in a *different* room B.
    - Win → `d1` has `lock.locked === false` and no `damaged`.
    - Room A gets the defeated line and `battles: 1`; room B is unchanged.
    - `h.undoLabel === 'Win the fight'`.
    - One `h.undo()` restores the door locked, the encounter and both rooms.
  - With `d1` between rooms A and B and the token in B → B gets the marks (the token's room wins when it's on either side).
  - `winFight` without `waitingDoorId` → exactly today's behaviour (the existing tests still pass, and no door changes).
  - `waitingDoorId` naming a door no longer on the map → the fight still closes, nothing else changes.
- [ ] **Step 2: Run** `npx vitest run tests/systems/combat.test.ts tests/ui/encounterActions.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Marks room = the token's room if it is one of `roomsAcross(map, door)`, else the first defined room of `roomsAcross`. Without `waitingDoorId`, keep the token's room as today. The door change and the room change go in the same `cmd.apply`.
- [ ] **Step 4: Run** the same command, then `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(encounter): winning a patrol fight at a locked door opens it`

### Task 5: Lock actions as undo steps

**Files:**
- Create: `src/ui/lockActions.ts`
- Test: `tests/ui/lockActions.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4; `History`, `compound`, `updateDoor`, `setPlay` from core; `commitEncounter`/`queueRoll`/`newEncounter` from combat and encounter actions.
- Produces (each returns `ExecResult`, one undo step, with the label shown):
  - `checkLock(history: History, tables: DungeonTables, doorId: string, roll: number): ExecResult`. Label `Lock check: unlocked` or `Lock check: locked`. Applies `markChecked` or `lockDoor`. Refuses (`ok: false`) unless `lockGate(...) === 'check'`.
  - `rollLockQuality(history: History, doorId: string, total: number): ExecResult`. Label `Lock quality ${total}`. Refuses if the door isn't locked, already has a quality, or `total` isn't 2–12.
  - `pickLock(history: History, doorId: string, pickIndex: number, total: number): ExecResult`. Requires a locked, undamaged door with a quality, and a hero with a lock pick at `pickIndex`. `total` is the dice total **including** Precision and the pick bonus. If `total >= quality`, `openLock`; else `damageLock`. Either way, `useLockPick`. Door and hero in one `PlayCommand` (`setPlay` with `apply`). Label `Pick the lock: opened` or `Pick the lock: failed`.
  - `waitForPatrol(history: History, tables: DungeonTables | null, doorId: string, eat: boolean): ExecResult`:
    - Refuses with reason `Finish the fight first` when `history.encounter` is not null.
    - Hero (if any) gets `waitFood`.
    - If the hero then has `hp === 0`: hero only, label `Wait at the door: went hungry`, no encounter.
    - Otherwise: encounter = `newEncounter()`, then `waitingDoorId: doorId`, then, when `patrolTableFor(tables, map.level)` is non-null, `queueRoll` of that code with modifier 0. Label `Wait for a patrol`.
    - With no hero: no food, encounter as above.

- [ ] **Step 1: Write failing tests**, using `History`, `emptyMap`, `room`, `door`, `withContent` and the fixture tables (with Task 1's made-up `doorLocks`):
  - `checkLock` with roll 3 on a metal door → `checked: true`, `lock: null`, label `Lock check: unlocked`.
  - Roll 4 → `lock.locked: true`.
  - A second `checkLock` on the same door → `ok: false`.
  - `undo` → the door is back to unchecked.
  - `rollLockQuality(…, 8)` → `lock.quality === 8`; a second call → `ok: false`.
  - `pickLock` with hero items `['Rope', 'Lock Pick +2 (1)', 'Chalk']`, quality 8:
    - total 8 → door open, items `['Rope', 'Chalk']`, one undo step restores both.
    - total 7 → `damaged: true`, still locked, pick removed.
    - On a damaged door → `ok: false`.
    - Without a quality → `ok: false`.
  - `waitForPatrol`:
    - Eat → rations − 1, encounter has `waitingDoorId` and `pending: [{ code: 'PRAC1', modifier: 0 }]`, label `Wait for a patrol`, one undo step restores hero and encounter.
    - Hungry to 0 HP → no encounter.
    - With an open encounter → `{ ok: false, reason: 'Finish the fight first' }`.
    - At level 2 (no patrol table) → encounter with `waitingDoorId` and empty `pending`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/lockActions.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `lockActions.ts`.
- [ ] **Step 4: Run** the same command, then `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(locks): lock check, lock quality, picking and waiting as undo steps`

### Task 6: Tap routing to the lock panel

**Files:**
- Modify: `src/ui/tapRouting.ts` (`Selection`, `PlayTap`, `routePlayTap`, `resolveSelection`)
- Modify: `src/ui/AppShell.svelte` (`onTap` cases `startExit`/`startGap`, and the new `lockedDoor` case)
- Test: `tests/ui/tapRouting.test.ts`

**Interfaces:**
- Consumes: `lockGate` (Task 3).
- Produces:
  - `Selection` gains `{ kind: 'lock'; doorId: string; then: 'exit' | 'gap' | null }`. `resolveSelection` keeps it while the door exists, else `null`. `selectionKey` in `StepPanel` gives `lock:${doorId}`.
  - `PlayTap` gains `{ kind: 'lockedDoor'; doorId: string }`. In the `idle` case, after the open-exit check and before features and rooms, a tap within `EDGE_SNAP` of a door with `lock?.locked === true` that is **not** an open exit returns it.
  - `export function exitTapAction(map: DungeonMap, tables: DungeonTables | null, doorId: string, then: 'exit' | 'gap'): { kind: 'flow' } | { kind: 'lock'; selection: Selection }` (in `tapRouting.ts`). Returns the lock selection when `lockGate` is `'check'` or `'locked'`, else `{ kind: 'flow' }`.
  - AppShell: on `startExit`/`startGap`, call `exitTapAction`. `flow` → today's call. `lock` → `selection = …; sidebar = 'steps'`. On `lockedDoor` → `selection = { kind: 'lock', doorId, then: null }`.
- [ ] **Step 1: Write failing tests:**
  - `exitTapAction`:
    - An unchecked metal exit with the made-up `doorLocks` → lock selection with `then: 'exit'`.
    - The same with `'gap'` → `then: 'gap'`.
    - With `tables = null` → `flow`.
    - An exit-table-locked door with `tables = null` → lock.
    - A secret metal door → `flow`.
  - `routePlayTap` idle:
    - A tap near a locked door between two rooms → `{ kind: 'lockedDoor', doorId }`.
    - Near an unlocked door between rooms → falls through to the room select, as today.
  - `resolveSelection` drops a lock selection whose door is gone.
- [ ] **Step 2: Run** `npx vitest run tests/ui/tapRouting.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the routing and the AppShell cases. Until Task 7 lands, the panel renders nothing for `lock`.
- [ ] **Step 4: Run** `npx vitest run tests/ui && npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(play): tapping a lockable or locked door goes to the lock panel first`

### Task 7: The lock panel, and the Door editor

**Files:**
- Create: `src/ui/steps/DoorLockPanel.svelte`
- Modify: `src/ui/StepPanel.svelte` (render it for `playSelection.kind === 'lock'`; new prop `onlockopen`)
- Modify: `src/ui/AppShell.svelte` (pass `tables`, hero and `onlockopen`; show the encounter pane after a Wait)
- Modify: `src/ui/tools/DoorEditor.svelte`
- Test: `tests/ui/lockPanel.test.ts` for the pure stage helper; component behaviour checked by hand in Step 5

**Interfaces:**
- Consumes: Tasks 3, 5, 6.
- Produces: `export function lockStage(door: Door, tables: DungeonTables | null): 'check' | 'choices' | 'open' | 'gone'` in `src/ui/lockPanel.ts`:
  - `'check'` when `lockGate === 'check'`
  - `'open'` when `isChecked && !door.lock?.locked`
  - `'choices'` for any locked door. The lock-quality roll is shown inside Pick when the quality is still null.
  - `'gone'` when `lockGate` is `null` and the door is unchecked, which happens if the tables were removed.

  The panel derives everything from the current door (Review Focus 1–2). It never stores a stage in local state, apart from "which pick is chosen" and "Pick / Wait sub-view open".

**Panel content** (headings and copy exactly as given):
- **check**: `<h2>Check the door</h2>`, the door type ("Metal door"), and the `lockTableLines` as a list. Then a `RollCard` job: id `lock-check`, label `Lock check: ${type} door`, dice `d6`, modifier null; `rolled`/`enter` call `checkLock`. Typed values are 1–6, error `Enter a whole number from 1 to 6`.
- **choices**: `<h2>Locked</h2>`, "Lock quality N" when known, "The lock is damaged" when damaged. Then three buttons: `Pick the lock`, `Wait for a patrol`, `Leave it`.
  - **Pick the lock** is disabled when damaged (no hint) or when there are no lock picks. With no picks, the hint is the exact text `Add a lock pick to Small Items, e.g. "Lock Pick +1 (3)"`. With more than one pick, it shows a radio list `+2 · 3 uses left`.
    - When quality is null, first a `RollCard`: id `lock-quality`, label `Lock quality`, dice `2d6`, modifier null → `rollLockQuality`.
    - Then a `RollCard`: id `lock-pick`, label `Pick the lock`, dice `2d6`, modifier `hero.precision + pick.bonus` → `pickLock(history, doorId, pick.index, sum + modifier)`.
  - **Wait for a patrol** is disabled while a fight is open, with the hint `Finish the fight first`. It shows `Eat a ration (+2 × level HP)` (disabled at 0 rations, or with no hero) and `Go hungry (−2 × level HP)`; both call `waitForPatrol`. After success, show the encounter pane the way the encounter text's "Roll on CODE" button does. When the level has no patrol table, the panel's notice says `Roll on your level's patrol table`.
  - **Leave it**: `onselect(null)`.
- **open**: when `then` is not null, call `onlockopen(doorId, then)` once. AppShell clears the selection and calls `flow.startFromExit` or `flow.startGap`. When `then` is null (a door between rooms), show `<h2>Unlocked</h2>` with a Close button.
- **gone**: `onselect(null)`.

**Door editor:** setting the padlock to `none` also removes `checked`. Show `Lock damaged` under the padlock when `lock.damaged`. Setting it to `opened` or `none` removes `damaged`.

- [ ] **Step 1: Write failing tests** for `lockStage`, one per stage, including:
  - A `tables` swap to `null` on an unchecked door → `'gone'`.
  - A locked door with `tables = null` → `'choices'`.
  - An opened door → `'open'`.
- [ ] **Step 2: Run** `npx vitest run tests/ui/lockPanel.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `lockPanel.ts`, `DoorLockPanel.svelte`, the wiring, and the Door editor change.
- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: PASS, with no svelte-check warnings.
- [ ] **Step 5: Check by hand** with `npm run dev` and the user's table file plus made-up `doorLocks` added to the local copy. Use the `run` skill to drive it. Confirm each of these:
  1. A metal exit asks for the check. A low roll goes straight to the size step.
  2. A high roll shows "L" on the map and the three choices. Leave it, then tap it again → choices again, with no re-roll.
  3. Pick with "Lock Pick +2 (1)" in Small Items: a quality roll, then a pick roll. Success → size step, and the pick is gone. Failure → "damaged", and Pick is disabled.
  4. Wait → a ration is used, the patrol roll is pending in the encounter pane. Win → the door shows opened, and tapping it starts the size step with no check.
  5. A secret door and an archway never ask.
  6. Undo after each step puts the panel back to the earlier stage.
  7. "Playing with real dice" lets you type each roll.
- [ ] **Step 6: Commit** `feat(locks): the lock panel: check, pick, wait or leave a locked door`

### Task 8: Finish

- [ ] **Step 1: Run** `npm test && npm run typecheck && npm run build`. Expected: all pass.
- [ ] **Step 2:** grep the branch diff (`git diff master...HEAD`) for creature names and table codes from `local-data/dungeon-tables.json` (the method from Plan 8). Expected: no hits beyond generic words.
- [ ] **Step 3:** Hand over to superpowers:finishing-a-development-branch.
