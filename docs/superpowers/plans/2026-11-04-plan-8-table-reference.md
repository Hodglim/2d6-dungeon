# Plan 8: Table Reference Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Tables pane in the sidebar shows any table from the player's Codex as the app's own text and rolls on it. Table codes anywhere in the app's text become buttons that open that table.

**Architecture:**
- **Data:** the table file gains an optional `referenceTables` key.
- **Rules:** pure helpers in `src/systems/dungeon/`:
  - `referenceTables.ts`: types, range parsing, validation and rolling.
  - `encounterText.ts`: the scanner, extended with a `table` part.
- **UI:** a `TablesPane` in a new sidebar tab. Its state (open table, back stack, search, results) lives in AppShell so it survives switching tabs.
- **User data:** the whole Codex is transcribed into the user's private file at the end, by subagents, one Codex group per batch.

**Tech Stack:** TypeScript 6, Svelte 5 runes, Vite 8, Vitest 5, Playwright Firefox. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-04-table-reference-design.md`. §9 settles the details; section numbers below (§n) refer to it.

## Global Constraints

- **No rulebook content in `src/`, `tests/`, `docs/`, `dist/`, commit messages or git.**
  - Tracked examples use invented codes (`XX1`, `XX2`, `LOOT9`) and names ("Practice Crate Table").
  - The user's data lives only in `local-data/`.
  - Never open `pdf/` or `local-data/` except in Task 5.
  - `node scripts/check-dist.mjs` must pass after `npm run build`.
- **Results are only shown.** Rolling on a reference table changes no game state: no History step, nothing saved with the game.
- **Never block play:** with no table file, or no `referenceTables`, the Tables pane explains this and everything else works as before.
- **Never roll silently wrong:**
  - A table with `dice: null` has no Roll button.
  - A total in a gap shows "No row for N".
- **Layering:** `src/core` is untouched. The rules are pure, in `src/systems/dungeon`.
- **Device:** touch targets are at least 44 px, on an iPad in landscape.
- **Commits** end with a blank line, then the Co-Authored-By trailer and the Claude-Session line. Stage files by explicit path.
- **Process:** use your own dev server on a free port with `--strictPort`, and stop it by PID. Leave port 5173 alone. Branch `plan-8-table-reference`; never push.

## Review Focus

1. **d66 tables:**
   - Totals are tens and units (11–66), never a sum.
   - Typed rolls with a die outside 1–6 are refused.
   - There is no modifier field.
   - *(Task 2 tests.)*
2. **Modified Ranges Rule edges:**
   - A modified total below the lowest row lands on the lowest row; above the highest, on the highest.
   - "7+" and "0 or less" rows match totals beyond the dice's natural range.
   - A gap shows "No row for N".
   - *(Task 2 tests.)*
3. **Scanner priorities:**
   - Creature-table codes keep their Roll behaviour.
   - Reference codes become Open buttons.
   - "D6" and "2D6" are never links.
   - A code inside a reference table's own text opens that table.
   - *(Task 2 tests.)*
4. **State across tab switches:**
   - The open table, the back stack, each table's last result and its modifier survive leaving the Tables tab and coming back.
   - *(Task 3 visual.)*
5. **A file without `referenceTables`:**
   - The pane shows an explanation.
   - Encounter text keeps its creature buttons only.
   - *(Tasks 3 and 4.)*

---

### Task 1: The reference-table format

**Files:**
- Create: `src/systems/dungeon/referenceTables.ts`
- Modify: `src/systems/dungeon/tables.ts` (the optional key, and calling the validator), `src/systems/dungeon/template.ts`, `docs/table-file-format.md`, `tests/fixtures/dungeon-tables.fixture.json`
- Test: `tests/systems/referenceTables.test.ts`, `tests/systems/tables.test.ts`, `tests/systems/tableTemplate.test.ts`

**Interfaces (produces):**
```ts
export type RefDice = 'd3' | 'd6' | '2d6' | 'd66';
export type RefGroup = 'generic' | 'random' | 'loot' | 'level' | 'optional';
export interface RefRow { roll?: string; cells: string[] }
export interface RefTable { name: string; group: RefGroup; level?: number; page: number; dice: RefDice | null;
  intro?: string; notes?: string; columns: string[]; rows: RefRow[] }
// DungeonTables['tables'].referenceTables?: Record<string, RefTable>
export interface RollRange { min: number; max: number }          // -Infinity / Infinity for open ends
export function parseRange(s: string): RollRange | null;          // "3", "1-2", "1–2", "7+", "0 or less", "11-16"
export function referenceProblem(t: Record<string, unknown>): string | null; // located message, used by validateTableFile
```

- [ ] **Step 1: Write the failing tests.**
  - **`parseRange`:**
    - `"3"` gives 3..3.
    - `"1-2"` and `"1–2"` both give 1..2.
    - `"7+"` gives 7..∞.
    - `"0 or less"` gives −∞..0.
    - `"x"` gives null.
  - **Validation**, on a made-up fixture with three tables:
    1. a d6 table with a "7+" row
    2. a 2d6 table
    3. a `dice: null` list
  - Exact refusals:
    - `The table file is damaged: Reference Tables XX1 rows[2] roll` for an unparseable roll.
    - `… Reference Tables XX1 rows[3] roll (overlaps rows[2])`.
    - `… Reference Tables XX1 rows[0] cells (expected 1)` when a rollable table's cells don't equal `columns.length − 1`.
    - `… Reference Tables LIST1 rows[0] cells (expected 3)` for a list.
    - `… Reference Tables LIST1 rows[0] roll (a list has no roll)`.
    - Bad `group`, `dice` or `page` are refused at their own place.
  - **Accepted:**
    - A gap between rows.
    - A file without the key.
  - **Template:** one blank reference table, `XX1`, with `dice: null`, `columns: [""]` and one row `{ cells: [""] }`. It's refused until filled in. Add `XX1` to the allow-list in the template's "no text" test.
- [ ] **Step 2: Run the tests** with `npx vitest run tests/systems/referenceTables.test.ts tests/systems/tables.test.ts tests/systems/tableTemplate.test.ts`. They should fail.
- [ ] **Step 3: Implement.**
  - Names go through the existing `named` blank check.
  - Add a section "referenceTables (optional)" to `docs/table-file-format.md`. Include a made-up example, the shape rules from spec §5 and §9, the roll syntax, and "Where to find it: the Tables Codex contents pages".
  - Add the fixture's made-up tables, using codes `XX1`, `XX2` and `LIST1`.
  - One row of `XX1` must say "roll on XX2 +1", for the chaining tests.
- [ ] **Step 4: Run the full suite** with `npm test && npm run typecheck`. Everything should pass.
- [ ] **Step 5: Commit** with the message `feat: reference tables in the table file`.

### Task 2: Rolling on a reference table, and table codes in text

**Files:**
- Modify: `src/systems/dungeon/referenceTables.ts`, `src/systems/dungeon/encounterText.ts`
- Test: `tests/systems/referenceTables.test.ts`, `tests/systems/encounterText.test.ts`

**Interfaces (produces):**
```ts
export interface RefRoll { natural: number; modifier: number; total: number; clamped: number; row: number | null }
export function naturalTotal(dice: RefDice, faces: number[]): number | null; // d3: 1 face 1..3; d6: 1 face; 2d6: sum; d66: 10*red+blue; null if any face invalid
export function rollReference(t: RefTable, faces: number[], modifier: number): RefRoll | null; // null if dice null or faces invalid; d66 ignores modifier
export function findTable(t: DungeonTables | null, code: string): { code: string; table: RefTable } | null; // case-insensitive
// encounterText.ts — EncounterPart gains:
//   | { kind: 'table'; text: string; code: string; modifier: number }
// scanEncounter(text, tables) also recognises referenceTables codes (whole word, optional modifier, en dash too);
// a code that is both a creature table and a reference table stays kind 'roll'.
```
`clamped` follows the Modified Ranges Rule: the total is clamped to the lowest row `min` and the highest row `max` of the table's finite bounds. `row` is the index of the row containing `clamped`, or `null` when it falls in a gap.

- [ ] **Step 1: Write the failing tests.**
  - **d6 table:**
    - faces [4], modifier −1 gives total 3 and the row for 3.
    - [1], −2 gives total −1, clamped to the lowest row.
    - [6], +3 lands on the "7+" row.
  - **2d6:** [3,4] gives natural 7.
  - **d66:**
    - [2,5] gives 25.
    - The modifier is ignored.
    - [2,7] gives null.
  - **Gaps:** a total in a gap gives `row: null`.
  - **d3:** [3] gives 3; [4] gives null.
  - **List:** `rollReference` on a list gives null.
  - **Scanner:**
    - `"roll on XX2 +1"` gives a `table` part with modifier 1.
    - A creature code beside a reference code: each keeps its own kind.
    - `"Roll 2D6 or a D6"` gives a single text part.
    - Joining the parts' text rebuilds the input.
    - With no `referenceTables`, the existing creature behaviour is unchanged.
- [ ] **Step 2: Run the tests.** They should fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run the full suite** with `npm test && npm run typecheck`. Everything should pass.
- [ ] **Step 5: Commit** with the message `feat: roll on reference tables; table codes in text`.

### Task 3: The Tables pane

**Files:**
- Create: `src/ui/tables/TablesPane.svelte`, `src/ui/tables/TableView.svelte`, `src/ui/tables/RefText.svelte` (text with code buttons), `src/ui/tables/tablesState.ts`
- Modify: `src/ui/DiceEntry.svelte` (a `'d3'` mode), `src/ui/AppShell.svelte` (the sidebar tab `'tables'`, the toolbar button, state ownership), `src/ui/Toolbar.svelte`
- Test: `tests/ui/tablesState.test.ts`, `scripts/visual.mjs`

**Interfaces (produces):**
```ts
// tablesState.ts — pure, held in an AppShell $state.raw
export interface TablesState { open: string | null; back: { code: string; modifier: number }[];
  modifier: Record<string, number>; results: Record<string, RefRoll>; query: string; group: RefGroup | 'all' }
export const initialTablesState: TablesState;
export function openTable(s: TablesState, code: string, modifier?: number): TablesState; // pushes the current table (with its modifier) on back
export function goBack(s: TablesState): TablesState;
export function setResult(s: TablesState, code: string, r: RefRoll): TablesState;
export function searchTables(t: DungeonTables | null, query: string, group: RefGroup | 'all'): { code: string; table: RefTable }[]; // code or name, case-insensitive; sorted by group then page then code
```

- [ ] **Step 1: Write the failing tests** for `tablesState.ts`:
  - `openTable` pushes the previous table and its modifier, and sets the new modifier, which defaults to 0.
  - `goBack` restores the previous table and modifier, and keeps that table's result.
  - Opening the same table again doesn't push a duplicate.
  - `searchTables` matches by code and by name, filters by group, and orders by group, then page, then code.
- [ ] **Step 2: Run the tests.** They should fail.
- [ ] **Step 3: Implement.**
  - **Toolbar:** a **Tables** button opens the `tables` sidebar tab, alongside Room, Encounter and Hero.
  - **No reference tables:** the pane says "Your table file has no reference tables yet. Load a table file with referenceTables, or see the format guide."
  - **The list:** a search box, group chips (All, Generic, Random, Loot, Level, Optional), then rows reading "CODE — Name · p. N", or "Name · p. N" for slug ids.
  - **The table view:**
    1. a Back button, when the back stack isn't empty, and a List button
    2. a header with the code, name and page
    3. the intro, through `RefText`
    4. the table, with the roll column and cells (cells through `RefText`)
    5. the notes, through `RefText`
    6. when `dice` is set: `DiceEntry` in the table's mode (d3, d6, 2d6 or d66), then a modifier field with − and + buttons and typing (hidden for d66), then the result: "4 − 1 = 3", plus "counts as N" when clamped, the matching row highlighted and scrolled into view, and its cells repeated under the dice; or "No row for N"
  - **`RefText`:** renders `scanEncounter` parts. `table` parts are buttons ("XX2 +1") that call `openTable(code, modifier)`. `roll` and `fight` parts render as plain text here, because the reference is for reading.
  - **DiceEntry's d3 mode:** one die, typed values 1–3, and the animation settles on 1–3.
- [ ] **Step 4: Run the full suite** with `npm test && npm run typecheck`. Everything should pass. Then add a visual scenario, using only the fixture:
  1. Open Tables and search "practice".
  2. Open XX1 and roll a typed 2 with −1, and check the clamped row is highlighted.
  3. Tap "XX2 +1" in a row: XX2 opens with modifier 1.
  4. Back returns to XX1 with its result.
  5. Switch to the Hero tab and back: the state is kept.
  6. A d66 table has no modifier field.
  7. A list has no Roll button.
  8. Remove the table file: the explanation shows.

  Run the full visual script.
- [ ] **Step 5: Commit** with the message `feat(ui): Tables pane — browse, search and roll on reference tables`.

### Task 4: Opening tables from encounters and Victory

**Files:**
- Modify: `src/ui/encounter/EncounterText.svelte`, `src/ui/encounter/VictoryPanel.svelte`, `src/ui/encounter/EncounterPane.svelte` and `AppShell.svelte` (the `onopentable` plumbing)
- Test: `scripts/visual.mjs`

**Interfaces:** `EncounterText` gains `onopentable(code: string, modifier: number)`. It renders `table` parts as buttons labelled "📖 XX1 −1". AppShell wires them to `openTable` and switches the sidebar to the `tables` tab, leaving any fight untouched.

- [ ] **Step 1:** Add a visual scenario:
  1. A fixture room whose encounter text names a reference code.
  2. Tap its button: the Tables tab shows that table with the modifier filled in.
  3. The Encounter tab still holds the fight.
  4. A Victory treasure line naming a reference code shows a working button.
- [ ] **Step 2: Implement.** Treasure lines in `VictoryPanel` render through `EncounterText`, with only `onopentable` wired.
- [ ] **Step 3: Run** `npm test && npm run typecheck && npm run build && node scripts/check-dist.mjs` and the full visual script. Everything should pass.
- [ ] **Step 4: Commit** with the message `feat(ui): open reference tables from encounter text and treasure lines`.

### Task 5: The user's whole Codex (local only, in batches)

Subagents do this, explicitly allowed to read `pdf/` and write `local-data/`. Nothing from it is committed. Each batch is one subagent, run one after another:
1. Generic
2. Random lists
3. Loot
4. Level 1–2
5. Level 3–4
6. Level 5–6
7. Level 7–8
8. Level 9–10
9. Optional

Before the first batch, back up the file by copying `local-data/dungeon-tables.json` to `local-data/dungeon-tables.backup-plan8.json`.

Each batch:
- [ ] **Transcribe** every table in its group from the Codex contents pages, faithfully, into `referenceTables`.
  - Render the pages with `pdftoppm -r 200`, then rotate and crop with `magick` in the scratchpad.
  - Ids are the book's codes. "XX1 to 4" means four tables: XX1, XX2, XX3 and XX4. Tables with no code get a slug made from the name.
  - Dice pictures go in as text, "3 & 4".
  - A table whose shape doesn't fit (§9) goes in as a list, with its roll text kept in the first cell. List it in the report.
  - Level 1's room, creature and exit tables are transcribed too, because the reference is complete.
- [ ] **Validate** with `parseTableFile`, using a throwaway `vite-node` script in the scratchpad. Fix anything it reports.
- [ ] **Report** to `.superpowers/sdd/<plan>/task-5-<group>-report.md`:
  - the counts
  - the tables stored as lists
  - hard-to-read entries, by table and row
  - `git status`, showing nothing from `pdf/` or `local-data/` is tracked

After the last batch, smoke-test the app with the real file:
- Open three tables, one each from loot, random and level.
- Roll, and chain through a code.
- Check that a Level 1 encounter's loot code opens the right table.
- Save screenshots to `local-data/screenshots/plan8-*.png`.
