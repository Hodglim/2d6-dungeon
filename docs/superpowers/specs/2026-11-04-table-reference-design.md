# 2D6 Map Maker: Table Reference (Design)

**Date:** 2026-11-04
**Status:** Agreed in conversation. Builder check done (§9). Pending user review.
**Builds on:** branch `plan-7-encounters` (encounters, 689 tests).

**Source:** the user's own Tables Codex PDF (git-ignored `pdf/`). Its contents pages list the tables in four groups: generic, random lists, loot, and per-level tables, plus optional tables at the back. All examples in this document and in tracked files are made up.

## 1. Intent

The game often sends the player to a table ("roll on XX1 −1") for loot, events and more. The player may not have the book to hand. A **Table Reference** in the app shows any table as the app's own text, with a button to roll on it, so play continues without the PDF.

**Success:** the player taps a table name in an encounter text or a result, or searches for it, sees the table, rolls, and reads the highlighted result. Results that send them to another table open that table in one tap.

## 2. Goals

1. The table file gains **reference tables**: every table in the user's Codex, transcribed into the user's private file (subagent, local only, like the room and creature tables).
2. A **Tables** pane in the sidebar (a toolbar button, like Hero and Encounter): search by code or name, browse by group, open a table.
3. A table's page shows its code, name, Codex page, intro line, columns and rows (with their roll ranges), and notes.
4. A **Roll** button uses the table's dice (D6, 2D6, D66, or another the table states), with the existing animated dice or a typed roll, plus a modifier. The total follows the book's **Modified Ranges Rule** (off-table totals count as the nearest end), and the matching row is highlighted and shown as the result.
5. **Chaining:** any table code mentioned in a row, intro, note or result (for example "roll on XX2") is a button that opens that table ready to roll. The encounter text in rooms and the encounter pane also turns codes of reference tables into "Open XX1 −1" buttons (codes that are creature tables keep their existing roll behaviour).
6. Results are only shown. Nothing is written to the hero sheet or the map.

## 3. Non-goals

- Applying results automatically (loot to the sheet, conditions, gold).
- Rolling damage formulas inside results ("2D6 + 10 GC"); the existing dice roller covers those.
- Editing tables in the app (the later "bring your own books" editor).
- Replacing the typed tables that drive automation (room tables, exit types, creature tables, starting tables). They stay; the reference may hold its own copy of them (§5).

## 4. Anti-goals

- **No rulebook content** in `src/`, `tests/`, `docs/`, `dist/` or git history. Tracked examples are invented (codes like `XX1`, names like "Practice Crate Table"). `scripts/check-dist.mjs` keeps passing.
- **Never block play:** with no table file, or a file without reference tables, the Tables pane says so and the rest of the app works as before.
- **No wrong roll silently:** a table with no stated dice can't be rolled (the Roll button is absent), rather than guessing.

## 5. The data (table file)

Optional key `referenceTables`, keyed by a table id (the book's code where it has one, such as `XX1`; otherwise a short id made from the name, such as `practice-crate-list`). Each table:

- `name`: the printed name. `group`: `generic` | `random` | `loot` | `level` | `optional`. `level`: the dungeon level for level tables (optional). `page`: the Codex page number.
- `dice`: `"d3"` | `"d6"` | `"2d6"` | `"d66"` | `null` (a list, not rollable).
- `intro` (optional): the line printed above the rows ("You open the box…"). `notes` (optional): text printed below.
- `columns`: column headings, the first being the roll column when `dice` is not null (for example `["Roll", "Result"]` or `["Armour", "Dice set", "Modifier", "Cost"]`).
- `rows`: each `{ roll?: string, cells: string[] }`. `roll` is a single value or range as printed: `"3"`, `"1-2"`, `"7+"`, `"0 or less"` (normalised by the builder into a min/max at parse time). `cells` has one entry per column after the roll column. Dice pictures in cells are written as text ("3 & 4").

Validation: located messages as for other tables; every rollable table's rows have parseable, non-overlapping roll ranges; `cells` lengths match `columns`. Both the room/creature tables and the reference copy may exist; the reference is for display and rolling only.

The format doc gains a section with a made-up example, and the blank template gains one blank reference table.

## 6. The Tables pane

- Toolbar **Tables** button opens it in the sidebar (same tab mechanism as Hero/Encounter; the map stays visible).
- Top: a search box (code or name, case-insensitive) and group filters; a list of matching tables ("XX1 — Practice Crate Table · p. 21").
- A table view: header (code, name, page), intro, the rows as a table (roll column + cells), notes, then **Roll**: dice entry (roll for me / type), a modifier field (whole number, default 0), and the result: "4 − 1 = 3" with the matching row highlighted and its text repeated under the dice. Codes in any text are buttons that open that table (a small back button returns to the previous table).
- Opening a table from elsewhere (an encounter text button, a creature card's treasure line in the Victory panel) opens the pane on that table with the modifier pre-filled.

## 7. The user's own data (local only)

Subagents, with explicit permission to read `pdf/` and write `local-data/`, transcribe the whole Codex into `local-data/dungeon-tables.json` under `referenceTables`, one Codex group per batch, validating after each batch and reporting hard-to-read entries. Back up the file first. Nothing from it is committed.

## 8. Left to the builder

- The exact roll-range syntax accepted (within §5's examples) and how ranges are stored after parsing.
- Pane layout and styling within the existing look; how the back button and history of opened tables work.
- How the scanner distinguishes creature-table codes from reference codes (creature tables win).
- Splitting the work into tasks.

## 9. Settled after the builder check (builder's calls unless marked)

- **Recognising codes in text.** Only ids present in the loaded `referenceTables` (and creature tables, as now) are recognised, as whole words, with an optional modifier right after ("XX1 -1", "XX1−1", en dash too). Codes the file doesn't hold stay plain text, so "D6" or "2D6" are never links. Tables whose id is a name slug (no book code) are reached through the list and search only.
- **Dice and ranges.** Dice give these natural totals: d3 1–3 (a real D6 read in halves: 1-2 = 1, 3-4 = 2, 5-6 = 3; the result shows the face, e.g. "5 → 3"), d6 1–6, 2d6 2–12 (sum), d66 11–66 (red tens, blue units, each 1–6; typed rolls are validated that way). A modifier is added to the total for d3/d6/2d6. For d66 there is no modifier field (the book's d66 tables are lookups). Row ranges are numeric ranges over those totals; `"7+"` means 7 and above, `"0 or less"` means 0 and below. The **Modified Ranges Rule** clamps the modified total to the lowest and highest values that any row covers. Rows must not overlap; gaps are allowed, and a total landing in a gap shows "No row for N" rather than guessing.
- **Unusual shapes.** The model has one roll column. A Codex table that doesn't fit (two roll columns, a roll to pick a column, sub-tables) is stored as a list (`dice: null`, the roll text kept in its first cell) so it shows correctly but has no Roll button. The transcription report lists every such table for the user.
- **Columns.** When `dice` is set, `columns[0]` labels the roll column and each row's `cells` has `columns.length - 1` entries; when `dice` is null, rows have no `roll` and `cells` has `columns.length` entries.
- **Modifiers when chaining.** Opening a table from a button pre-fills the modifier from that button's text, otherwise 0. Back returns to the previous table with its modifier and last result as they were. Each table keeps its last result while the pane is open.
- **Victory treasure lines** go through the same scanner, so each code in them is a button.
- **Pane state** (open table, back stack, search, results) lives in the app shell like the Victory state, so it survives switching tabs. "Open table X" from elsewhere switches the sidebar to the Tables tab; an open fight is untouched and its tab is one tap away.
- **Dice.** The existing dice entry handles d6, 2d6 and d66; the builder extends it with d3 (a normal D6 is rolled or typed, 1–6, and read in halves).
- **The user's data** is the last task of the plan, run after the code is finished and tested on invented fixtures.
