# Plan 7: Encounters and Combat Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A room's encounter text turns into "Roll on XX1 −1" and "Fight Grumbler" buttons. These fill an encounter pane holding the creature cards, HP trackers, a dice roller, the Fatigue Die and the round count. A fight ends in a confirmed win (with treasure reminders and XP) or a confirmed death (Game Over).

**Architecture:**
- **Data:** the table file gains `creatureTables` and `creatures`.
- **Rules:** pure helpers in `src/systems/dungeon/`:
  - `creatures.ts`: lookups and the creature-table roll.
  - `encounterText.ts`: the scanner.
  - `combat.ts`: the encounter model, fatigue and momentum.
- **History:** core's History gains a third opaque slot, `encounter`, next to `hero`. A new `PlayCommand` changes the hero and the encounter together, so every fight change is one undo step.
- **Game Over** lives in the campaign meta, outside History, like `earlierLevels`. It can't be undone.

**Tech Stack:** TypeScript 6, Svelte 5 runes, Vite 8, Vitest 5, Playwright Firefox. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-02-encounters-design.md` (approved). Section numbers below (§n) refer to it.

## Global Constraints

- **No rulebook content in `src/`, `tests/`, `docs/`, `dist/` or git.**
  - Fixtures and doc examples use invented names and values.
  - The real data lives only in `local-data/`, which is git-ignored.
  - Never open `pdf/` except in Task 8.
  - `node scripts/check-dist.mjs` must pass after `npm run build`.
- **History:** every game-state change goes through `History.execute`, including HP, next round, adding creatures and ending a fight.
- **Game Over** is set only in the campaign meta, never on the undo timeline.
- **Layering:** `src/core` stays free of DOM, Svelte, persistence and systems imports. Core treats the encounter as opaque, exactly like the hero.
- **Versions:** there is no backwards compatibility. Bump `SAVE_FORMAT` (`src/persistence/record.ts`) and `CURRENT_SCHEMA_VERSION` (`src/core/campaign.ts`) together, from 3 to 4, with no migration.
- **Missing data degrades and never blocks:**
  - Map-only play with no table file still works.
  - With no card pack, the pane still works, without card images.
  - With no hero, there's no hero tracker and no Game Over.
- **Device:** touch targets are at least 44 px, on an iPad in landscape. The HP − and + buttons are at least 56 px.
- **Commits** end with a blank line, then the Co-Authored-By trailer and the Claude-Session line from the session.
- **Process:** stop servers by PID, never with `pkill -f`. Stage files by explicit path. Use your own dev server on a free port with `--strictPort`, and leave port 5173 alone.

## Review Focus

1. **Typed HP values:**
   - Blank, non-numeric or fractional input is ignored, and the old value stays.
   - A negative value is allowed and counts as 0 or below.
   - Raising a defeated creature above 0 brings it back and clears its round of defeat.
   - *(Task 3 tests; Task 5 component check.)*
2. **Undo across endings:**
   - Undoing the step that ended a fight reopens it.
   - Cancelling the death question, then undoing and redoing, asks again only when a change leaves HP at 0 or below.
   - The question never loops on its own.
   - *(Task 7 tests.)*
3. **Reload mid-fight** restores the creatures, their HP, the round, the Fatigue Die, the hero and the pending roll exactly. *(Task 4 round trip; Task 5 visual check.)*
4. **Scanner false positives:**
   - Capitals that aren't creatures ("FP", "D6", "HP") make no button.
   - Unknown codes ("LOOT9") make no button.
   - "XX1-1" with no space and "XX1 -1" with a space both work.
   - *(Task 2 tests.)*
5. **Data missing mid-fight:**
   - Removing the card pack only drops the images.
   - A creature with no stats asks for its HP, with no XP or Treasure.
   - A creature name with no card shows no image.
   - *(Task 5.)*

---

### Task 1: Creature tables and creature stats in the table file

**Files:**
- Modify: `src/systems/dungeon/tables.ts`, `src/systems/dungeon/template.ts`, `docs/table-file-format.md`, `tests/fixtures/dungeon-tables.fixture.json`
- Test: `tests/systems/tables.test.ts`, `tests/systems/tableTemplate.test.ts`

**Interfaces:**
- Produces (in `tables.ts`):
  ```ts
  export type CreatureTableEntry = { creatures: string[] } | { text: string };
  export interface CreatureStats { level: number; hp: number; xp: number; shift: number; treasure: string }
  // DungeonTables['tables'] gains (both optional):
  creatureTables?: Record<string, Record<string, CreatureTableEntry>>; // keys "1".."6"
  creatures?: Record<string, CreatureStats>;                           // keyed by printed name
  ```

- [ ] **Step 1: Write the failing tests** in `tables.test.ts`. Each one starts from the fixture, after Step 3 adds made-up `creatureTables` and `creatures` to it:
  - `parses the fixture's creature tables`: the result is ok, and a table such as `PRAC1` has keys 1–6.
  - Refusals, each a mutated clone. The error texts are exact:
    - a missing key `"4"` → `The table file is damaged: Creature Tables PRAC1 4`
    - an extra key `"7"` → `… Creature Tables PRAC1 7 (not a valid key)`
    - an entry with neither `creatures` nor `text` → `… Creature Tables PRAC1 2`
    - `creatures: []` → `… Creature Tables PRAC1 2 creatures (empty)`
    - a creature name missing from `creatures` → `… Creature Tables PRAC1 2 (no creature named Grumbler in Creatures)`. The match ignores case.
    - `hp: -1` → `… Creatures Grumbler hp`
    - `shift: -1` is accepted.
    - `level: 11` → `… Creatures Grumbler level (must be a whole number from 1 to 10)`
    - `treasure: 3` → `… Creatures Grumbler treasure`
  - A file with neither key still parses.

  In `tableTemplate.test.ts`:
  - Update the expected key list to include `creatureTables` and `creatures`.
  - The template's `creatureTables` has one table under the made-up code `"L1X"`. Its keys are `1`–`6`, each `{ creatures: [""] }`.
  - `creatures` has one row keyed `""` with `level: null, hp: null, xp: null, shift: null, treasure: ""`.
  - Add `L1X` to the "no text" allow-list.
  - The "filled in" test fills these blanks too.

- [ ] **Step 2: Run the tests** with `npx vitest run tests/systems/tables.test.ts tests/systems/tableTemplate.test.ts`. They should fail.
- [ ] **Step 3: Implement the change.**
  - Add the validation to `roomTablesProblem`, or to a sibling called from it, after the room checks.
  - `creatures` is checked before `creatureTables`, so name lookups have something to match against.
  - Creature names inside `creatures` arrays go through the existing `named` blank check.
  - Shift is `isInt`, and the other numbers are `isCount`.
  - Add made-up `PRAC1` and `PRAC2` tables and three made-up creatures to the fixture. One `PRAC1` entry must have two creatures and one must be a `text` entry.
  - Extend `blankTableFile()`.
  - Document both keys in `table-file-format.md`, under a new "creatureTables and creatures (optional)" section:
    - say they're optional
    - give the book pages as "Codex p. 38 for Level 1; the creature cards for the stats"
    - include a made-up example and the shape rules from spec §6
- [ ] **Step 4: Run the full suite** with `npm test && npm run typecheck`. Everything should pass.
- [ ] **Step 5: Commit** with the message `feat: creature tables and creature stats in the table file`.

### Task 2: Creature lookups, the creature-table roll and the encounter-text scanner

**Files:**
- Create: `src/systems/dungeon/creatures.ts`, `src/systems/dungeon/encounterText.ts`
- Test: `tests/systems/creatures.test.ts`, `tests/systems/encounterText.test.ts`

**Interfaces:**
- Consumes: Task 1's types, and `CardPack`/`CreatureCard` from `cards.ts`.
- Produces:
  ```ts
  // creatures.ts
  export function findCreature(t: DungeonTables | null, name: string): { name: string; stats: CreatureStats } | null; // case-insensitive; returns the table's spelling
  export function findCard(pack: CardPack | null, name: string): CreatureCard | null;                                  // case-insensitive
  export interface CreatureRoll { die: number; modifier: number; total: number; entry: CreatureTableEntry }
  export function rollCreatureTable(t: DungeonTables, code: string, die: number, modifier: number): CreatureRoll | null; // total clamped to 1..6; null if no such table
  // encounterText.ts
  export type EncounterPart =
    | { kind: 'text'; text: string }
    | { kind: 'roll'; text: string; code: string; modifier: number }
    | { kind: 'fight'; text: string; name: string };   // name = findCreature spelling
  export function scanEncounter(text: string, t: DungeonTables | null): EncounterPart[];
  ```

- [ ] **Step 1: Write the failing tests.**
  - `rollCreatureTable`:
    - die 4, modifier −1 gives total 3
    - die 1, modifier −1 gives total 1, clamped
    - die 6, modifier +2 gives total 6
    - an unknown code gives `null`
  - `findCreature` and `findCard` ignore case, and return `null` for an unknown name or a null table or pack.
  - `scanEncounter`, using the fixture's made-up codes and creatures:
    - `"Roll on PRAC1 -1. If you survive roll on LOOT9."` gives text, a `roll` with modifier −1 and text `"PRAC1 -1"`, then text with LOOT9 left as plain text.
    - `"PRAC1-1 and PRAC2 +2"` gives two rolls, with modifiers −1 and +2.
    - `"PRAC1"` on its own has modifier 0.
    - `"You must fight the GRUMBLER."` gives a `fight` named with the table's spelling.
    - A two-word name in capitals, `"MOSS LURKER"`, is one fight.
    - `"Gain 1 FP. Roll a D6."` gives a single text part.
    - With `t = null`, any text gives a single text part.
    - Joining every part's `text` gives back the original string exactly. This is a property check over all the fixture strings above.
- [ ] **Step 2: Run the tests.** They should fail.
- [ ] **Step 3: Implement.**
  - Build a single regex from the loaded table codes, longest first, each followed by an optional `\s*[+-−]\s*\d+`.
  - Treat runs of capitalised words (`[A-Z][A-Z'-]+(?:\s+[A-Z][A-Z'-]+)*`) as fights only when `findCreature` matches the whole run. Otherwise try the longest sub-run that matches, and leave the rest as text.
  - Codes take priority over capitals.
- [ ] **Step 4: Run the full suite** with `npm test && npm run typecheck`. Everything should pass.
- [ ] **Step 5: Commit** with the message `feat: creature lookups, creature-table roll and encounter-text scanner`.

### Task 3: The encounter model and combat rules (pure)

**Files:**
- Create: `src/systems/dungeon/combat.ts`
- Test: `tests/systems/combat.test.ts`

**Interfaces:**
- Consumes: `CreatureStats` and `CreatureRoll` (Tasks 1 and 2).
- Produces:
  ```ts
  export interface Foe {
    id: string; name: string; hp: number; startHp: number;
    xp: number | null; shift: number | null; treasure: string | null;   // null = no stats in the table file
    defeatedInRound: number | null;
  }
  export interface PendingRoll { code: string; modifier: number }
  export interface Encounter { version: 1; round: number; foes: Foe[]; pending: PendingRoll[] }
  export const newEncounter: () => Encounter;                 // round 1, no foes, no pending
  export function addFoe(e: Encounter, name: string, stats: CreatureStats | null, startHp: number, id: string): Encounter;
  export function setFoeHp(e: Encounter, id: string, hp: number): Encounter;   // sets/clears defeatedInRound
  export function nextRound(e: Encounter): Encounter;
  export function queueRoll(e: Encounter, r: PendingRoll): Encounter;
  export function resolveRoll(e: Encounter, index: number): Encounter;         // removes pending[index]
  export const fatigueDie: (round: number) => number;         // min(round, 6)
  export const fatigueShift: (round: number) => number;       // die 1-3: 0, 4: 1, 5: 2, 6: 3
  export function momentumShift(e: Encounter): number;        // 2 in round 2 if ≥2 foes and one fell in round 1, else 0
  export const allDefeated: (e: Encounter) => boolean;        // ≥1 foe and every hp ≤ 0
  export const totalXp: (e: Encounter) => number;             // sum of known xp
  export function treasureLines(e: Encounter): string[];      // "Name: treasure" for non-empty treasure
  export const interruptReminder: (round: number) => boolean; // round ≥ 7
  export function encounterProblem(raw: unknown): string | null;               // save validation, like heroProblem
  ```

- [ ] **Step 1: Write the failing tests.**
  - Fatigue:
    - `fatigueDie` for rounds 1–8 gives 1, 2, 3, 4, 5, 6, 6, 6.
    - `fatigueShift` gives 0, 0, 0, 1, 2, 3, 3, 3.
  - `setFoeHp`:
    - Setting HP to 0 in round 1 sets `defeatedInRound: 1`.
    - Setting it back to 5 clears it.
    - Setting it to −3 is allowed and counts as defeated.
  - Momentum:
    - Two foes, one killed in round 1, then `nextRound` gives `momentumShift` 2 in round 2 and 0 in round 3.
    - With one foe, it's always 0.
    - A kill in round 2 gives 0.
  - `allDefeated`:
    - false with no foes
    - true when every foe has HP of 0 or below
  - `totalXp` skips `null`.
  - `treasureLines` skips empty treasure.
  - `interruptReminder` is false in round 6 and true in round 7.
  - Every function returns a new object, and the input is unchanged.
  - `encounterProblem`:
    - `null` for valid output from `newEncounter`, `addFoe` and `queueRoll`
    - a located message for a wrong `version`, a non-integer `round` or a foe missing `hp`
- [ ] **Step 2: Run the tests.** They should fail.
- [ ] **Step 3: Implement** in `combat.ts`. No UI or core imports beyond types.
- [ ] **Step 4: Run the full suite** with `npm test && npm run typecheck`. Everything should pass.
- [ ] **Step 5: Commit** with the message `feat: encounter model, fatigue die and fearful momentum rules`.

### Task 4: The encounter on the undo timeline and in the save (format 4)

**Files:**
- Modify:
  - `src/core/history.ts`, `src/core/commands.ts`, `src/core/system.ts`, `src/core/types.ts` (`Campaign.encounter`), `src/core/campaign.ts`, `src/core/serialize.ts`
  - `src/persistence/record.ts`, `src/persistence/startup.ts`, `src/persistence/files.ts`
  - `src/systems/dungeon/index.ts`, plus every `heroProblem` call site in `AppShell.svelte`
- Test: `tests/core/history.test.ts`, `tests/core/serialize.test.ts`, and the persistence tests that round-trip saves.

**Interfaces:**
- Consumes: `encounterProblem` (Task 3).
- Produces:
  ```ts
  // commands.ts
  export interface PlayState { hero: unknown | null; encounter: unknown | null }
  export interface PlayCommand { label: string; applyPlay(s: PlayState): PlayState }
  export const setPlay: (after: PlayState, label: string) => PlayCommand;
  // history.ts: GameState, HistoryEntry, HistoryState gain `encounter: unknown | null`;
  // History gains `get encounter()`, constructor/reset/fromState take it; execute accepts PlayCommand.
  // system.ts: GameSystem gains `encounterProblem?: (e: unknown) => string | null`.
  // Campaign gains `encounter: unknown | null`; CURRENT_SCHEMA_VERSION = 4; SAVE_FORMAT = 4.
  ```

- [ ] **Step 1: Write the failing tests.**
  - History:
    - Executing a `PlayCommand` that changes the encounter is one undo step. Undo restores both hero and encounter, and redo reapplies them.
    - Merging by `mergeKey` works for play commands, as it does for hero commands.
    - `HeroCommand` and map `Command` leave the encounter untouched.
    - `reset(map, hero, encounter)` clears the past and future.
    - `dropLast` restores the encounter.
  - Serialize:
    - `parseHistoryState` accepts snapshots with an encounter.
    - It refuses a damaged one with `The saved encounter is damaged: …`, passing `encounterProblem` alongside `heroProblem`.
    - A missing `encounter` field on a format-4 entry is refused, the same as hero.
  - Campaign and export:
    - The export round-trip keeps `encounter`.
    - An old schema 3 file is refused by the existing "older version" path. This is the no-migration rule.
- [ ] **Step 2: Run the tests.** They should fail.
- [ ] **Step 3: Implement the change.**
  - Mirror the hero handling everywhere: the field, the `norm()`-style rule that a missing field is refused (format 4 always writes it), and the validation hook.
  - The dungeon system registers `encounterProblem`.
  - `campaignFrom` and `metaFrom` carry the encounter.
  - `goDown`'s `history.reset` passes `null`. Task 5 guards it.
- [ ] **Step 4: Run the full suite** with `npm test && npm run typecheck && npm run build`. Everything should pass.
- [ ] **Step 5: Commit** with the message `feat: encounter on the undo timeline and in saves (format 4)`.

### Task 5: The encounter pane

**Files:**
- Create: `src/ui/encounter/EncounterPane.svelte`, `src/ui/encounter/HpTracker.svelte`, `src/ui/encounter/CombatDice.svelte`, `src/ui/encounter/encounterActions.ts`
- Modify: `src/ui/AppShell.svelte` (the encounter state, the toolbar Encounter button, the sidebar branch and the stairs guard), `src/ui/StepPanel.svelte` (the Go down guard). Retire `EncounterCard.svelte`. Keep `EncounterPicker.svelte` as the "Add creature" search.
- Test: `tests/ui/encounterActions.test.ts`, and new visual scenarios in `scripts/visual.mjs`.

**Interfaces:**
- Consumes: Tasks 2–4. Use `commitHero` from `heroActions.ts` as the pattern for running edits through History.
- Produces (`encounterActions.ts`, pure apart from the `History` argument):
  ```ts
  export function commitEncounter(history: History, next: Encounter | null, label: string, opts?: { mergeKey?: string; hero?: Hero }): ExecResult;
  export function startOrJoin(history: History, tables: DungeonTables | null, names: string[], newId: () => string, askHp: (name: string) => number | null): ExecResult;
  ```
  `startOrJoin` creates the encounter if there is none and adds a foe for each name. For a name with no stats, it calls `askHp`, and skips the name if that returns `null`.

- [ ] **Step 1: Write the failing tests** in `encounterActions.test.ts`:
  - `startOrJoin` with two names makes one undo step with two foes.
  - A second call adds to the same encounter.
  - A no-stats name uses the HP from `askHp`, and is skipped when `askHp` returns `null`.
  - `commitEncounter` with `mergeKey: 'foe-hp:<id>'` folds five −1 taps into one step labelled `Guard HP −5`.
  - `commitEncounter(history, null, 'End encounter')` clears it, and Undo restores it.
- [ ] **Step 2: Run the tests.** They should fail.
- [ ] **Step 3: Implement `encounterActions.ts`,** then the components.
  - **Layout** follows spec §8, from top to bottom:
    1. pending rolls: Task 6 fills these in, and this task shows nothing for them
    2. the foe list, with the card image from `findCard` when there is one, the name, an `HpTracker`, "SH n (+f)", and small XP and Treasure text; a defeated foe is greyed out with "Defeated"
    3. the hero `HpTracker`, only when there's a hero, with Shift shown as base + fatigue + momentum
    4. "Round N", a `DieFace` showing `fatigueDie`, the "+n Shift" bonus, and a **Next round** button
    5. the round-7 reminder, in the app's own words: "From round 7, creatures can't use Interrupts that move them or an item. Armour Interrupts still count."
    6. `CombatDice`
    7. **Add creature**, which opens `EncounterPicker`
    8. **End encounter**
  - **`HpTracker`:** − and + buttons, at least 56 px, that merge with key `foe-hp:<id>` or `hero-hp`, and the number, which is tappable to type a value.
    - Typed values must be whole numbers, otherwise they're ignored.
    - Hero HP changes go through `commitHero(history, adjustHp(...), { mergeKey: 'hero-hp' })`.
  - **`CombatDice`:**
    - Two dice by default, with a "One die" toggle.
    - Use the existing roll animation and sound via `DiceEntry` in 2d6 mode, which shows both faces, or d6 mode.
    - A 1-1 shows "Double 1: a miss for you, a Mishap for a creature".
    - A 6-6 shows "Double 6: Prime Attack".
  - **End encounter** asks "Creatures are still standing. End the encounter anyway?" when any foe has HP above 0. It then commits `null`.
  - **AppShell:**
    - The pane shows whenever `history.encounter` is non-null, or when the player opened it from the toolbar. A card pack is not required.
    - The toolbar button no longer toasts when there is no pack.
    - The "Add creature" search shows "Load creature cards to search by picture" without a pack. Its picks go through `startOrJoin`.
    - Removing the pack keeps the encounter.
  - **The Go down guard:** while `history.encounter` is non-null, the Go down button is disabled, with the note "Finish or end the encounter first."
- [ ] **Step 4: Run the full suite** with `npm test && npm run typecheck`. Everything should pass. Then add visual scenarios to `scripts/visual.mjs`:
  1. Start a fight with the fixture's two-creature entry by adding the creatures by hand. Tap HP down, use Next round to round 4, and check "+1 Shift".
  2. Reload mid-fight and check that the round, HP and foes are restored.
  3. Remove the card pack mid-fight and check the fight stays, with no images.
  4. Check Go down is disabled during a fight.

  Run them on your own port and save screenshots. Then run the existing visual scenarios and confirm they still pass.
- [ ] **Step 5: Commit** with the message `feat(ui): encounter pane with HP trackers, fatigue die, rounds and dice`.

### Task 6: Encounter-text buttons and the creature-table roll

**Files:**
- Create: `src/ui/encounter/EncounterText.svelte`, `src/ui/encounter/PendingRoll.svelte`
- Modify: `src/ui/steps/LabelStep.svelte:84`, `src/ui/tools/RoomInspector.svelte:77-79`, `src/ui/RoomRoll.svelte` (where it shows the encounter), `src/ui/encounter/EncounterPane.svelte`, `src/ui/AppShell.svelte`
- Test: `tests/ui/encounterActions.test.ts`, `scripts/visual.mjs`

**Interfaces:**
- Consumes: `scanEncounter` and `rollCreatureTable` (Task 2), `queueRoll` and `resolveRoll` (Task 3), and `startOrJoin` and `commitEncounter` (Task 5).
- Produces:
  - `EncounterText` takes `{ text: string; tables: DungeonTables | null; onroll(code: string, modifier: number): void; onfight(name: string): void }`. It renders text, plus a button for each part: "Roll on CODE ±n" or "Fight Name".
  - `encounterActions.ts` gains:
    ```ts
    export function applyCreatureRoll(history: History, tables: DungeonTables, index: number, die: number, newId: () => string, askHp: (name: string) => number | null): { ok: true; roll: CreatureRoll } | { ok: false; reason: string };
    ```
    It resolves `pending[index]`. A `creatures` entry adds those foes in the same undo step. A `text` entry only removes the pending roll, and the result is shown with `EncounterText`, so names in it become Fight buttons.

- [ ] **Step 1: Write the failing tests.**
  - Tapping Roll (`queueRoll` through `commitEncounter`) with no open encounter creates one with the pending roll, in one step.
  - `applyCreatureRoll` with die 2, modifier −1 on the fixture's two-creature row adds both foes and removes the pending roll, in one step.
  - A `text` row adds no foes and removes the pending roll.
  - Undo after `applyCreatureRoll` brings back the pending roll and removes the foes.
- [ ] **Step 2: Run the tests.** They should fail.
- [ ] **Step 3: Implement.**
  - Wherever an encounter text is shown (the label step result, the room inspector and `RoomRoll`'s result), use `EncounterText`.
  - **Fight:** calls `startOrJoin` with that name, and opens the pane.
  - **Roll:** queues a pending roll and opens the pane.
  - **`PendingRoll`** shows at the top of the pane:
    - "Roll on PRAC1 −1", with `DiceEntry` in d6 mode, for rolling for me or typing a value.
    - Then "4 − 1 = 3: Grumbler", after the animation settles.
    - A × removes an unrolled pending roll, through `commitEncounter`.
  - **`askHp`** is a small inline prompt in the pane ("Starting HP for Name") rather than `window.prompt`. Make `askHp` asynchronous if needed, or add the foe with `startHp` 0 and the HP field focused. Either way, document the choice in the report.
- [ ] **Step 4: Run the full suite** with `npm test && npm run typecheck`. Everything should pass. Then add a visual scenario:
  1. A fixture room whose encounter text names `PRAC1 -1` and a creature in capitals.
  2. Tap Roll, roll, and check the right foes appear.
  3. Tap Fight, and check the foe joins the same fight.
  4. Check that "LOOT9" and "FP" stay as plain text.
- [ ] **Step 5: Commit** with the message `feat(ui): encounter-text buttons and the creature-table roll`.

### Task 7: Winning, death from any cause, and Game Over

**Files:**
- Create: `src/ui/encounter/VictoryPanel.svelte`, `src/ui/GameOver.svelte`, `src/ui/DeathDialog.svelte`, `src/ui/endings.ts`
- Modify: `src/persistence/record.ts` (`CampaignMeta.gameOver`), `src/ui/AppShell.svelte`, `src/ui/encounter/EncounterPane.svelte`
- Test: `tests/ui/endings.test.ts`, the persistence tests, and `scripts/visual.mjs`

**Interfaces:**
- Consumes: `allDefeated`, `totalXp` and `treasureLines` (Task 3), `commitEncounter` (Task 5), and `addXp` from `heroActions.ts`.
- Produces:
  ```ts
  // record.ts: CampaignMeta gains
  gameOver: { heroName: string; heroLevel: number } | null;   // default null; persisted
  // endings.ts: decides when to ask, without loops
  export function shouldAskDeath(hero: Hero | null, gameOver: boolean, dismissed: Hero | null): boolean;      // hero.hp <= 0 && !gameOver && hero !== dismissed
  export function shouldAskWin(enc: Encounter | null, dismissed: Encounter | null): boolean;                  // allDefeated(enc) && enc !== dismissed
  ```
  `dismissed` holds the exact state object that was cancelled. Any later change makes a new object, so the question comes back only after a change, as spec §9 requires.

- [ ] **Step 1: Write the failing tests** in `endings.test.ts`:
  - `shouldAskDeath`:
    - true for a hero at 0 HP, and at −2 HP
    - false once that same object has been dismissed
    - true again for a new object that still has 0 HP or less
    - false when `gameOver`, or when there's no hero
  - `shouldAskWin`:
    - true only when every foe is defeated
    - false for the dismissed object
  - In the persistence tests, `gameOver` round-trips through save and load.
- [ ] **Step 2: Run the tests.** They should fail.
- [ ] **Step 3: Implement.**
  - **Win:**
    - Ask "All creatures defeated: win the fight?". Cancel keeps the fight open.
    - Confirm shows `VictoryPanel` in the pane:
      - one treasure line per creature
      - "No treasure to roll for" when there are none
      - **Add N XP**: one hero step labelled "XP +N", shown only when there's a hero and N > 0; disabled after use
      - **Done**: `commitEncounter(null, 'Win the fight')`
  - **Death, from any cause:**
    - `AppShell` watches `history.hero` after every change: any execute, undo, redo or load. When `shouldAskDeath` is true, it shows `DeathDialog`: "Your hero has fallen: confirm their death?"
    - Cancel stores the dismissed hero object.
    - Confirm sets `meta.gameOver`, saves straight away with `saver.flush()`, and shows `GameOver`.
  - **`GameOver`:**
    - A full-screen cover showing the hero's name and level.
    - **Export game**, which reuses `exportGame`.
    - **New game**, which opens the existing new-game wizard. Starting a new game clears `gameOver`.
    - While it's showing, Undo, Redo and the keyboard shortcuts are off. Add it to `modalOpen`.
    - On startup, a save with `gameOver` set opens straight to `GameOver`.
- [ ] **Step 4: Run the full suite** with `npm test && npm run typecheck && npm run build && node scripts/check-dist.mjs`. Everything should pass. Then add visual scenarios:
  1. Win a fight and check the treasure lines, then Add XP and check the hero's XP on the sheet.
  2. Take the hero to 0 HP from the **sheet's** − button. Cancel, check there's no loop, and tap − again to see the question come back. Confirm, and check Game Over. Reload, and check Game Over is still shown. Then New game.
  3. Tap Export game on the Game Over screen and check a file is produced.
- [ ] **Step 5: Commit** with the message `feat: win the fight, death from any cause, and Game Over`.

### Task 8: The user's own creature data (local only)

A subagent does this, explicitly allowed to read `pdf/` and write `local-data/`. Nothing from it is committed, except fixes to scripts.

- [ ] **Step 1: Back up the table file** by copying `local-data/dungeon-tables.json` to `local-data/dungeon-tables.backup-plan7.json`.
- [ ] **Step 2: Add the Level 1 creature tables** from Codex p. 38 (all eleven Level 1 creature tables) to `creatureTables`.
  - "X AND Y" means two creatures.
  - Every entry of the described-encounters table is a `text` entry, copied faithfully.
- [ ] **Step 3: Add `creatures`** for every card in `local-data/creature-cards.json`, all 90.
  - Read the HP, XP, SH and Treasure lines from the card images, rendering them from the Codex creature pages at high resolution.
  - Use the card's `name` and `level`.
  - "No Treasure" becomes `""`.
- [ ] **Step 4: Validate the file** with `parseTableFile`, using a throwaway `vite-node` script in the scratchpad. Also run `scanEncounter` over all 36 + 11 Level 1 encounter texts, and list each one's buttons, for the user to check.
- [ ] **Step 5: Smoke-test in the app** with the real file and pack.
  - Roll on XX1 −1, fight with the HP trackers, win, and check the treasure line and XP.
  - Save screenshots to `local-data/screenshots/plan7-*.png`.
- [ ] **Step 6: Write the report.** List:
  - the counts
  - hard-to-read values, by creature
  - the scanner's button list
  - any encounter text where a creature name in capitals has no stats
  - `git status`, showing nothing from `pdf/` or `local-data/` is tracked
