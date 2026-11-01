# Plan 5: Hero Creation, Character Sheet and Creature Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** New game runs a book-order hero creation wizard. The hero's character sheet lives in the app, on the same undo timeline as the map. Creature card images can be shown in the sidebar during an encounter. All rulebook data comes from files the player loads.

**Architecture:**
- `History` snapshots grow from a map to a map plus an opaque hero. Core stays system-neutral, and the hero's type, validation and rules live in `src/systems/dungeon`.
- The table file and the card pack are validated JSON files. They are stored in IndexedDB under their own keys, separately from the game save.
- The UI adds a wizard (replacing NewMapDialog), a Hero panel and an Encounter panel. Both panels share the right-hand sidebar.
- A Node script crops creature cards out of a player's own Codex PDF.

**Tech Stack:** TypeScript 6, Svelte 5 (runes), Vite 8, Vitest 5, Playwright 1.64 (Firefox), fake-indexeddb, and the CLI tools poppler `pdftoppm` and ImageMagick for the card script only.

**Spec:** `docs/superpowers/specs/2026-11-01-hero-creation-and-sheet-design.md` (read §12 and §13; they settle most details).

## Global Constraints

- **No rulebook content in `src/`, `tests/`, `docs/`, `dist/` or git.**
  - Fixtures and doc examples use made-up names and numbers.
  - The user's real data lives only in `local-data/`, which is git-ignored.
  - Never commit anything from `pdf/` or `local-data/`.
- **Every change to the game state goes through `History.execute`.** Hero edits included. There is one undo timeline, with `HISTORY_CAP = 20`.
- **Layering:**
  - `src/core` has no DOM, Svelte, render, persistence or systems imports.
  - The hero is `unknown | null` in core. The dungeon system supplies the hero type and `heroProblem`.
- **Plan 4a saves must load:** `SAVE_FORMAT` 1 and schema version 1 load as a game with no hero.
  - Bump to `SAVE_FORMAT = 2` and `CURRENT_SCHEMA_VERSION = 2`, with migrations.
  - A test asserts the two versions are bumped together.
- **Never lose the game silently.** Every Plan 4a rule applies to the hero: autosave, the damaged-save dialog, and asking before replacing anything.
- **The table file and the card pack:**
  - are stored separately from the game
  - survive New game, Import and the damaged-save choices
  - are never included in exports
- **The map-only flow must keep working with no table file.**
- **Sheet limits warn but never block a hand edit.** Stats change only through something the player sees and confirms.
- **Touch targets are ≥ 44×44 CSS px.** The target is an iPad in landscape.
- **New npm dependencies:** none expected. Any that are added must be pinned exact and published ≥14 days before 2026-11-01.
- **Commits** end with a blank line and then the Co-Authored-By trailer (plus the Claude-Session line).
- **Servers** in scripts are stopped by PID. Never use `pkill -f`.

## Review Focus

1. **Editing the hero while a room is half-placed must not cancel the placement.** PlayFlow should only react to *map* changes. *(Task 1 test.)*
2. **Old saves still load:**
   - A Plan 4a save (format 1, with `meta.hero` present or absent) restores as a game with no hero, with Undo intact.
   - An exported file from Plan 4a (schema version 1) imports.

   *(Task 2 tests.)*
3. **Rapid HP or coin taps must not wipe the map's undo history.** Taps on the same field within 1.5 s merge into one step. *(Task 1 merge test; Task 7 UI test.)*
4. **Bad data files** must be refused with a plain message, leaving whatever was loaded before untouched:
   - a table file for the wrong system or with a missing table
   - a card pack that is too large or isn't JSON

   *(Task 3 and Task 5 tests.)*
5. **A hero must work on a device with no table file.** Limits, the level-up offer and the sheet all work from the copies stored in the hero; only choosing manoeuvres needs the table file. *(Task 4 test; Task 7 visual check.)*

---

### Task 1: History carries the hero

**Files:**
- Modify: `src/core/history.ts`, `src/core/commands.ts`, `src/interaction/playflow.ts`, `src/ui/historyStore.ts`
- Test: `tests/core/history.test.ts`, `tests/interaction/playflow.test.ts`

**Interfaces:**
- **Produces:**
  ```ts
  // history.ts
  export interface GameState { map: DungeonMap; hero: unknown | null }
  export interface HistoryEntry { label: string; map: DungeonMap; hero: unknown | null }
  export interface HistoryState { current: DungeonMap; hero: unknown | null; past: HistoryEntry[]; future: HistoryEntry[] }
  export type Listener = (map: DungeonMap) => void;            // unchanged signature, still fired on every change
  export const MERGE_WINDOW_MS = 1500;
  class History {
    constructor(current: DungeonMap, cap?: number, hero?: unknown | null, now?: () => number);
    get hero(): unknown | null;
    execute(cmd: Command | HeroCommand, opts?: { mergeKey?: string }): ExecResult;
    reset(map: DungeonMap, hero?: unknown | null): void;
    /** The hero as it was before the newest undo step (for building merged labels like "HP −3"). */
    get heroBeforeLast(): unknown | null;
  }
  // commands.ts
  export interface HeroCommand { label: string; applyHero(hero: unknown | null): unknown | null }
  export function setHero(after: unknown | null, label: string): HeroCommand;
  ```
- **Merge rule:** an `execute` with a `mergeKey` replaces the current state *without* pushing a new past entry, and updates the top entry's label. It does this only when all of these hold:
  - the previous `execute` had the same key
  - the previous `execute` was less than `MERGE_WINDOW_MS` ago, according to the injected `now`
  - nothing (undo, redo, reset, restore or another execute) has happened in between

  `checkInvariants` still runs only for map changes.

- [ ] **Step 1: Write the failing tests**
  - `execute(setHero(h1,'Create hero'))` → `history.hero === h1` and `undoLabel === 'Create hero'`. `undo()` → `hero === null` with the map unchanged. `redo()` → `h1`.
  - A map command after a hero command keeps the hero. Undoing it restores the map and keeps the hero.
  - Merge:
    - Three hero executes with `mergeKey:'hp'` at t = 0, 500 and 1000 ms → `past.length` grows by 1, and `undoLabel` is the last label.
    - A fourth at t = 3000 → a new step.
    - An undo in between, or a different key, → a new step.
  - The 20-step cap counts hero and map steps together.
  - `exportState()` / `restore()` round-trip `hero` in `current` and in every entry.
  - **PlayFlow (Review Focus 1):** with a draft open, a `setHero` execute leaves the draft open. A map execute still cancels it.
- [ ] **Step 2: Run** `npx vitest run tests/core/history.test.ts tests/interaction/playflow.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
  - Existing map `Command`s keep the hero.
  - `HeroCommand`s keep the map, so the map reference is unchanged.
  - PlayFlow compares the map reference it last saw with the emitted map, and ignores emits where the map is unchanged.
  - `historyStore` exposes `hero` alongside `map`.
- [ ] **Step 4: Run** `npm test && npm run typecheck` → PASS. Existing tests may need `hero: null` added to hand-built `HistoryState`s.
- [ ] **Step 5: Commit** `feat(core): history snapshots carry an opaque hero, with merged quick edits`

### Task 2: Save format 2, schema version 2, hero validation on load

**Files:**
- Modify: `src/core/serialize.ts`, `src/core/campaign.ts`, `src/core/system.ts`, `src/persistence/record.ts`, `src/persistence/startup.ts`, `src/persistence/files.ts`, `src/ui/AppShell.svelte` (only where meta and hero are wired)
- Test: `tests/core/serialize.test.ts`, `tests/persistence/record.test.ts`, `tests/ui/startup.test.ts`, `tests/persistence/files.test.ts`

**Interfaces:**
- **Consumes:** Task 1 `HistoryState`.
- **Produces:**
  ```ts
  // core/system.ts — GameSystem gains:
  heroProblem?: (hero: unknown) => string | null;          // null = valid; called only for non-null heroes
  // core/serialize.ts
  export function parseHistoryState(raw: unknown, heroProblem?: (h: unknown) => string | null): HistoryParse;  // accepts v1 shape (no hero fields → null)
  export function parseCampaign(text: string, heroProblem?: (h: unknown) => string | null): ParseResult;        // migrates schema 1 → 2
  // persistence/record.ts
  export const SAVE_FORMAT = 2;
  export interface CampaignMeta { id: string; name: string; systemId: string }   // hero moves into history
  export function decodeSave(raw: unknown, heroProblem?: (h: unknown) => string | null): SaveDecode;  // format 1 → 2
  export function campaignFrom(meta: CampaignMeta, map: DungeonMap, hero: unknown | null): Campaign;
  // persistence/startup.ts
  export function decideStartup(raw: unknown | null, heroProblem?: (h: unknown) => string | null): StartupDecision;
  ```
- **Behaviour:**
  - `CURRENT_SCHEMA_VERSION = 2`. Schema 2 adds nothing structural: `hero` is validated with `heroProblem` when it isn't null.
  - The 1 → 2 migration keeps `hero: null`.
  - A format 1 record's `meta.hero` is ignored, because it was always null in Plan 4a.
  - `decideStartup` also runs `parseCampaign(serializeCampaign(campaignFrom(...)))` on the restored current state. This closes the deferred item "start-up doesn't run parseCampaign".
  - A hero problem reads "The saved hero is damaged: …".
  - Export and import carry `campaign.hero`.
  - On import, `history.reset(map, campaign.hero)`.

- [ ] **Step 1: Write the failing tests (Review Focus 2)**
  - A Plan 4a-shaped record (format 1, `meta.hero: null`, history without hero fields) → `decideStartup` → `restore`, with `history.hero === null` and labels intact.
  - The same record without `meta.hero` → `restore`.
  - A schema 1 campaign JSON → `parseCampaign` ok, with `hero === null`.
  - A version-coupling test: `expect(SAVE_FORMAT).toBe(2)` and `expect(CURRENT_SCHEMA_VERSION).toBe(2)`. Its comment says to bump both together and add migrations.
  - A record whose `history.past[0].hero` fails `heroProblem` → `error` starting "The saved hero is damaged".
  - A format 3 record → the "newer version" error.
  - An export → import round trip keeps a (fixture) hero object.
- [ ] **Step 2: Run them** → FAIL.
- [ ] **Step 3: Implement.** Wire `dungeonSystem.heroProblem` (a stub returning null until Task 4) into the AppShell's `decideStartup` / `readImportText` calls.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npm run e2e:persistence` → PASS.
- [ ] **Step 5: Commit** `feat(persistence): save format 2 and schema 2 with hero, validated on load and import`

### Task 3: The dungeon table file: types, validation, fixture and format doc

**Files:**
- Create: `src/systems/dungeon/tables.ts`, `tests/fixtures/dungeon-tables.fixture.json`, `docs/table-file-format.md`
- Test: `tests/systems/tables.test.ts`

**Interfaces:**
- **Produces:**
  ```ts
  export const TABLE_FILE_FORMAT = 1;
  export const MAX_TABLE_FILE_BYTES = 2_000_000;
  export type Dice = number[];                       // die faces 1–6, in printed order; primary (red) first
  export interface LevelRow { level: number; title: string; manoeuvres: number; maxManoeuvreLevel: number;
    xpToLevelUp: number | null; shift: number; discipline: number; precision: number; hpBaseline: number }
  export interface Limits { potions: number; scrolls: number; largeItems: number; armour: number }
  export interface DungeonTables {
    format: 1; systemId: 'dungeon'; name: string;
    tables: {
      starting: { level: number; xp: number; shift: number; discipline: number; precision: number; hp: number;
                  rations: number; potions: { name: string; effect: string }[]; kit: string[] };
      startingArmour: { name: string; dice: Dice; modifier: string }[];
      startingScrolls: { name: string; effect: string; orbit: string; dispelDoubles: string; effectModifier: string }[];
      weapons: { name: string; manoeuvres: { level: number; name: string; dice: Dice; damage: string }[] }[];
      levels: LevelRow[];
      gods: string[];
      conditions: { bloodied: { label: string; boxes: number }; soaked: { label: string; boxes: number };
                    fever: { label: string; effect: string }; pneumonia: { label: string; effect: string } };
      favourBoxes: number;
      limits: Limits;
    };
  }
  export type TablesParse = { ok: true; tables: DungeonTables } | { ok: false; error: string };
  export function parseTableFile(text: string, byteLength: number): TablesParse;
  ```
- **Validation rules:**
  - Dice faces are integers 1–6. A manoeuvre's dice length is exactly 2. Armour dice length is 1–2.
  - `levels` is sorted by level, with at least one row.
  - Every weapon has at least `levels[0].manoeuvres` level-1 manoeuvres.
  - Unknown extra keys under `tables` are kept.
- **Messages:**
  - "This isn't a 2D6 Dungeon table file"
  - "The table file is missing <Table Name>"
  - "The table file is damaged: <detail>"
  - "Made by a newer version of the app"
  - "This file is too large to be a table file."

- [ ] **Step 1: Write the fixture.** The fixture is made up: for example the weapons "Practice Sword" and "Training Club", the armour "Sackcloth Vest", and invented gods, all with invented numbers. It is a valid, complete file with 3 levels. Then write the failing tests:
  - the fixture parses
  - each refusal message, including the wrong `systemId`, a missing `weapons`, a die face of 7 and format 2 (Review Focus 4)
  - an unknown extra table is kept
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** **Step 4: Run** → PASS.
- [ ] **Step 5: Write `docs/table-file-format.md`.**
  - Cover every field, with an example taken from the made-up fixture.
  - For each table, say where to find it in your own books, by book name, table name and page:
    - starting values: Core Rules pp. 8–9
    - starting armour and scrolls: Codex p. 12
    - scroll columns: Codex p. 10, the scroll table
    - weapon manoeuvres: Codex p. 13
    - levels: Core Rules p. 10
    - gods and conditions: Core Rules p. 39, the sheet
  - Include a "Creature cards" section, to be completed in Task 9.
- [ ] **Step 6: Commit** `feat(dungeon): table file format, validation and documentation`

### Task 4: The dungeon hero: model, creation and sheet rules

**Files:**
- Create: `src/systems/dungeon/hero.ts`
- Modify: `src/systems/dungeon/index.ts` (wire `heroProblem`)
- Test: `tests/systems/hero.test.ts`

**Interfaces:**
- **Consumes:** Task 3 `DungeonTables`, `LevelRow`, `Limits`, `Dice`; Task 1 `setHero`.
- **Produces:**
  ```ts
  export interface HeroRules { limits: Limits; levels: LevelRow[]; gods: string[];
    conditions: DungeonTables['tables']['conditions']; favourBoxes: number }   // copied from the table file at creation (spec §12)
  export interface Hero {
    version: 1; name: string; weapon: string; level: number; title: string; xp: number; hp: number; hpBaseline: number;
    shift: number; discipline: number; precision: number; appliedRunes: string;
    manoeuvres: { name: string; dice: Dice; modifier: string }[];
    armour: { name: string; dice: Dice; modifier: string }[];
    scrolls: { name: string; orbit: string; dispelDoubles: string; effectModifier: string }[];
    potions: { name: string; effect: string }[];
    legendLevel: number; bloodied: number; soaked: number; fever: boolean; pneumonia: boolean;
    coins: { gc: number; sc: number; cc: number };
    treasure: string[]; prisoners: string[]; sideQuests: string[];
    favour: { god: string; points: number }[];
    narrative: string; largeItems: string[]; smallItems: string[]; lootLockup: string[];
    rations: number; notes: string; rules: HeroRules;
  }
  export interface CreationChoices { name: string; weapon: string; manoeuvres: string[]; armour: string; scroll: string }
  export function creationProblem(t: DungeonTables, c: CreationChoices): string | null;
  export function createHero(t: DungeonTables, c: CreationChoices): Hero;
  export function heroProblem(raw: unknown): string | null;
  export function nextLevelRow(h: Hero): LevelRow | null;          // null at max level
  export function levelUpAvailable(h: Hero): boolean;              // xp >= current row's xpToLevelUp
  export function levelUp(h: Hero): Hero;                          // hp += 10, baseline/stats/title/level from next row
  export type ListKey = 'potions' | 'scrolls' | 'largeItems' | 'armour' | 'manoeuvres';
  export function listLimit(h: Hero, key: ListKey): number;        // manoeuvres = current level row's count
  export function overLimit(h: Hero, key: ListKey): boolean;
  export function heroEdit(before: Hero, after: Hero): string;     // plain undo label, e.g. "HP −3", "XP +50", "GC +12", "Add Rope", "Edit hero"
  ```
- **Behaviour (spec §8 and §12):**
  - `createHero` uses the starting values. HP equals the baseline equals `starting.hp`.
  - The chosen manoeuvres get `modifier = damage`. The chosen armour and scroll are copied in.
  - Potions come from `starting.potions`, the kit becomes `smallItems`, and rations from `starting.rations`.
  - `favour` has one entry per god, with points 0.
  - `rules` is copied from the table file.
  - XP is cumulative and is never reset.

- [ ] **Step 1: Write the failing tests, using the Task 3 fixture:**
  - `createHero` gives the fixture's starting stats and exactly the 2 chosen manoeuvres, with their dice and damage.
  - `creationProblem` refuses 1 or 3 manoeuvres, a manoeuvre from another weapon, a level 2 manoeuvre, and an unknown armour or scroll.
  - `heroProblem(createHero(...)) === null`. It returns a message for a missing `rules`, a negative coin, or a dice face of 0.
  - **Level-up:**
    - At XP just below the threshold, `levelUpAvailable` is false; at the threshold, true.
    - `levelUp` gives hp +10, the next row's baseline and stats, and keeps XP.
    - At max level, `levelUpAvailable` is false.
  - `listLimit(hero,'largeItems')` comes from `rules.limits`. `overLimit` is true at limit + 1.
  - **Review Focus 5:** a hero made from the fixture, then serialised and parsed back with no tables in scope, still answers `levelUpAvailable`, `levelUp` and `listLimit`.
  - `heroEdit` labels: HP down by 3 → "HP −3" (use the minus sign U+2212), and XP up by 50 → "XP +50".
- [ ] **Step 2–4:** FAIL → implement → PASS (`npm test && npm run typecheck`).
- [ ] **Step 5: Commit** `feat(dungeon): hero model, creation from table file, level-up and limit rules`

### Task 5: Store the table file and card pack; menu loading

**Files:**
- Modify: `src/persistence/store.ts`, `src/ui/Menu.svelte`, `src/ui/AppShell.svelte`
- Create: `src/systems/dungeon/cards.ts`
- Test: `tests/persistence/store.test.ts`, `tests/systems/cards.test.ts`

**Interfaces:**
- **Consumes:** Task 3 `parseTableFile`.
- **Produces:**
  ```ts
  // store.ts — on SaveStore, IdbSaveStore and MemorySaveStore:
  loadExtra(key: string): Promise<unknown | null>;
  saveExtra(key: string, value: unknown): Promise<void>;
  removeExtra(key: string): Promise<void>;
  export const TABLES_KEY = 'tables:dungeon';
  export const CARDS_KEY = 'cards:dungeon';
  // cards.ts
  export const CARD_PACK_FORMAT = 1;
  export const MAX_CARD_PACK_BYTES = 60_000_000;
  export interface CreatureCard { id: string; name: string; level: number; image: string }   // image: data:image/(jpeg|webp|png);base64,…
  export interface CardPack { format: 1; systemId: 'dungeon'; name: string; cards: CreatureCard[] }
  export type CardsParse = { ok: true; pack: CardPack } | { ok: false; error: string };
  export function parseCardPack(text: string, byteLength: number): CardsParse;
  export function searchCards(pack: CardPack, query: string, level: number | null): CreatureCard[];  // case-insensitive substring, then level filter, sorted by level then name
  ```
- **Behaviour:**
  - Extras live in the same IndexedDB object store under their own keys, using the same `run()` failure handling.
  - The game save key `current` is never touched by extras.
  - The Menu gains:
    - "Load table file…" and "Load creature cards…" (file inputs accepting `.json`)
    - a status line naming each loaded file
    - "Remove" for each

  A bad file shows its message in the existing import-error dialog and keeps the previously loaded file. AppShell loads both extras at start-up, after the game decision, and holds them in `$state`.
- **Card pack messages:**
  - "This isn't a 2D6 Dungeon creature card pack"
  - "The card pack is damaged: <detail>"
  - "Made by a newer version of the app"
  - "This file is too large to be a card pack."

- [ ] **Step 1: Write the failing tests:**
  - **Extras:** `saveExtra` → `loadExtra` round-trips, and `removeExtra` → null. `save(record)` followed by `saveExtra` doesn't change `load()`.
  - **Card pack (Review Focus 4):**
    - A made-up 3-card fixture parses (build it in the test with tiny 1×1 PNG data URLs).
    - Each refusal is checked: not JSON, the wrong system, an image that isn't a `data:image/` URL, a missing name, and a byte length over the limit.
  - **`searchCards`:** "gob" finds "Goblin Thing" (a made-up name) whatever the case, and the level filter works.
- [ ] **Step 2–4:** FAIL → implement → PASS.
- [ ] **Step 5: Visual check.** Extend `scripts/visual.mjs` to:
  - load `tests/fixtures/dungeon-tables.fixture.json` through the menu, then reload, and see that the status line still names it
  - load a corrupt table file, see the message, and confirm the status line is unchanged
- [ ] **Step 6: Commit** `feat: load and store player table file and creature card pack`

### Task 6: Creation wizard (replaces NewMapDialog)

**Files:**
- Create: `src/ui/wizard/HeroWizard.svelte`, `src/ui/DicePair.svelte` (red/blue dice faces, reusing DiceEntry's look)
- Delete or replace: `src/ui/NewMapDialog.svelte`
- Modify: `src/ui/AppShell.svelte`
- Test: `tests/ui/wizard.test.ts` (pure step logic, if extracted), plus visual checks

**Interfaces:**
- **Consumes:** Task 4 `createHero`, `creationProblem`, `CreationChoices`; Task 5 tables in AppShell state; Task 1 `history.reset(map, hero)` and `setHero`.
- **Produces:** `HeroWizard` with props `{ tables: DungeonTables | null; mode: 'new-game' | 'add-hero'; onbegin(result: { width; height; hero: Hero | null }); oncancel(); onloadtables() }`.
- **Behaviour (spec §7):**
  - **Steps:** Game (map size, plus "Start without a hero", plus "Load table file…" when no tables are loaded) → Name → Weapon (showing each weapon's level-1 manoeuvres) → Manoeuvres (pick exactly `levels[0].manoeuvres`) → Armour → Scroll → Review.
  - **Navigation:** Back and Next on every step. Next stays disabled until the step is valid.
  - **Begin in `new-game` mode:**
    - It goes through the existing `ReplaceGameDialog` confirmation first, as New game does today.
    - It creates a fresh game whose history starts already holding the hero, via `history.reset(map, hero)` and flush. Undo is empty.
  - **Begin in `add-hero` mode** (from Hero "Create hero" on a map-only game): it skips the Game step and runs `history.execute(setHero(hero, 'Create hero'))`, so creating the hero is undoable and the map is untouched.
  - **Cancel** at any point leaves the current game untouched.

- [ ] **Step 1: Pure logic.** If step validity is extracted into a helper, test it. A good shape is `wizardStepValid(step, draft, tables): boolean`.
- [ ] **Step 2: Build the wizard.**
- [ ] **Step 3: Visual check.**
  - **With the fixture tables:** New game → Replace → walk every step, with screenshots `30-wizard-weapon.png`, `31-wizard-manoeuvres.png` and `32-wizard-review.png` → Begin. Check `history.hero` through the UI (the Hero button is enabled), then reload and check the hero persists.
  - **With no tables:** New game → "Start without a hero" → the map works as before.
  - **Cancel mid-wizard:** the previous game is unchanged.
  - **The table file survives:** after New game, Import and the damaged-save choice "Start new game", the menu status line still names the table file.
- [ ] **Step 4: Run** `npm test && npm run typecheck && npx vite build && node scripts/visual.mjs && npm run e2e:persistence` → PASS. Update `e2e-persistence` if New game now opens the wizard.
- [ ] **Step 5: Commit** `feat(ui): book-order hero creation wizard on New game`

### Task 7: Hero panel: quick strip, sheet tabs, limits, level-up

**Files:**
- Create: `src/ui/hero/HeroPanel.svelte`, `src/ui/hero/QuickStrip.svelte`, `src/ui/hero/SheetStats.svelte` (page 1), `SheetPotions.svelte` (page 2), `SheetNarrative.svelte` (page 3), `SheetItems.svelte` (page 4), `src/ui/hero/heroActions.ts`
- Modify: `src/ui/Toolbar.svelte` (Hero button), `src/ui/AppShell.svelte` (sidebar switching)
- Test: `tests/ui/heroActions.test.ts`

**Interfaces:**
- **Consumes:** Task 4 rules and `heroEdit`; Task 1 `execute(..., { mergeKey })`, `heroBeforeLast`.
- **Produces:**
  - **`heroActions.ts`:** pure helpers that return the next Hero for each quick-strip action:
    - `adjustHp(h, d)`, `addXp(h, n)`, `adjustCoin(h, 'gc'|'sc'|'cc', d)` (clamped at 0)
    - `addItem(h, 'large'|'small', text)`, `removeItem(h, list, index)`

    The panel then calls `history.execute(setHero(next, label), { mergeKey })`. The `mergeKey` is `'hp'`, `'xp'`, `'gc'`, `'sc'` or `'cc'` for tap buttons, and absent for typed and committed edits. The label comes from `heroEdit(heroBeforeLast ?? before, next)` when merging, so five −1 taps read "HP −5".
- **Behaviour (spec §8 and §12):**
  - **Hero button:** the toolbar gets a Hero button. It reads "Create hero" when `history.hero` is null; that opens the wizard in add-hero mode, and needs tables.
  - **Panel layout:** the panel replaces the step panel at a wider width, the map stays usable beside it, and closing the panel restores the step panel.
  - **Quick strip:**
    - HP − and + with typing, and "current / baseline" shown.
    - XP add-box, total and the next threshold.
    - GC, SC and CC each with − and +.
    - An "Add item" box with a Large/Small choice.
  - **Level-up offer:** when `levelUpAvailable`, a "Level up to <title>?" offer appears. Confirming runs `levelUp` as one step labelled "Level up to <title>". If it's still available, the next offer appears.
  - **Tabs:**
    - Page 1: stats, manoeuvres, armour and scrolls. Changing manoeuvres offers that weapon's manoeuvres up to `maxManoeuvreLevel` when tables are loaded. Without tables, it shows "Load your table file to choose manoeuvres" and allows typed rows.
    - Page 2: potions, the condition trackers using `rules.conditions` labels and box counts, coins, treasure, prisoners, side quests, and favour per god (boxes = `rules.favourBoxes`).
    - Page 3: narrative.
    - Page 4: 10 large slots, small items, loot lockup, rations and notes.
  - **Limits:** adding past a limit shows a warning ("Your backpack holds 10 large items — drop or use one?") with "Add anyway" and "Cancel". It never hard-blocks.

- [ ] **Step 1: Write the failing tests for `heroActions`:**
  - `adjustHp` allows values above the baseline.
  - `adjustCoin` never goes below 0.
  - `addItem` adds to the right list.
  - **Merge (Review Focus 3):** a History with fake `now` gets 5 quick `adjustHp(-1)` executes with `mergeKey:'hp'` → one step labelled "HP −5". A map step made before them is still undoable afterwards.
- [ ] **Step 2–3:** Implement the helpers, then the panel.
- [ ] **Step 4: Visual check.**
  - Open Hero, tap HP − three times, add 50 XP, add GC, add a large item. Screenshot `33-hero-strip.png`.
  - Undo once → HP is back up by 3.
  - Reload → the values persist.
  - Fill the large items to 10 and add one more → the warning shows.
  - XP to the threshold → the offer appears, then level up.
  - Screenshots `34`–`36` of the tabs.
- [ ] **Step 5: Run** the full checks as in Task 6. Then **commit** `feat(ui): hero panel with quick strip, sheet tabs, limits and level-up`

### Task 8: Encounter panel

**Files:**
- Create: `src/ui/encounter/EncounterPicker.svelte`, `src/ui/encounter/EncounterCard.svelte`
- Modify: `src/ui/Toolbar.svelte`, `src/ui/AppShell.svelte`

**Interfaces:**
- **Consumes:** Task 5 `CardPack`, `searchCards`; the sidebar switching from Task 7.

**Behaviour (spec §13):**
- **Toolbar Encounter button:**
  - With no card pack, it shows a short message explaining how to load one (Menu → Load creature cards…).
  - Otherwise it opens the picker: a search box, a level filter and a result list of name and level.
- **Picking a card:** the card image shows in the sidebar, fitted to the panel width, and the map stays usable.
  - Tapping the image opens a full-screen view, which closes on tap.
  - **End encounter** closes the card.
- **Sharing the sidebar with the Hero sheet:** tabs ("Encounter" | "Hero") at the top of the panel when both are open, with Encounter selected first.
- **The encounter is not saved and not in History.**
- **Images** use the data URL directly (`<img src>`) with `alt` = the creature's name.

- [ ] **Step 1: Visual check with a made-up 3-card pack.** Generate it in the script with ImageMagick-free placeholders, for example canvas-drawn PNG data URLs.
  1. Load the pack. Open Encounter and search for a name, then pick it. The card shows: screenshot `37-encounter.png`.
  2. Open Hero. Both tabs show and switching works.
  3. Tap the card to see it full screen, then End encounter.
- [ ] **Step 2: Run** the full checks. Then **commit** `feat(ui): encounter search and creature card in the sidebar`

### Task 9: Card pack script, dist guards, docs

**Files:**
- Create: `scripts/make-creature-pack.mjs`
- Modify: `scripts/check-dist.mjs`, `docs/table-file-format.md`, `README.md`, `package.json` (an `"creature-pack"` script)

**Interfaces:**
- **Usage:** `node scripts/make-creature-pack.mjs <codex.pdf> [--first 102 --last 127] [--index-page N] [--out local-data/creature-cards.json]`
- **Tools:** it checks that `pdftoppm` and `magick` (or `convert`) exist, with a clear message if they're missing.

**Behaviour:**
1. **Render** each page with `pdftoppm` at 150–200 dpi, into a temporary folder in the OS temp dir. Delete the folder afterwards.
2. **Split** each page into its four card areas.
   - Find the gutters by looking for the white rows and columns that separate the cards. Don't use fixed pixel offsets.
   - Skip areas that are nearly blank, which handles pages with fewer than four cards.
3. **Read names and levels** from the Codex's creature index text, using `pdftotext`.
   - Find the index page by its "Creature Index" heading.
   - Each index entry gives a name and page. Assign the cards on a page in reading order: top-left, top-right, bottom-left, bottom-right.
   - The level comes from the page's "LEVEL n - CREATURE CARDS" heading.
   - If the index and the card count disagree for a page, name the cards "Page P card K" and warn. Don't fail.
4. **Encode** each card as a JPEG (quality about 80, about 700 px wide).
5. **Write** the pack JSON, then print the card count, a per-page summary of names and the total size.

**`check-dist.mjs`:** additionally fail if `dist/` contains `data:image/jpeg;base64` chunks longer than 10 kB, or any of these names, when their files exist:
- weapon, armour or scroll names from `local-data/dungeon-tables.json`
- card names from `local-data/creature-cards.json`

**Docs:**
- The format doc gets a "Creature cards" section: the pack format, plus how to run the script on your own PDF and what it needs.
- The README gets a "Your rulebook data" section: the app ships no rulebook content, you load your own table file and card pack, and links to the format doc.

- [ ] **Step 1: Test the guard.**
  - Build, then put a temporary `local-data/dungeon-tables.json` containing a made-up weapon name.
  - Inject that name into a dummy `dist/assets/x.js` → exit 1.
  - Remove the dummy → exit 0.
  - Restore `local-data/` exactly as it was. Don't touch any real file there: back it up first and put it back.
- [ ] **Step 2: Test the script on a synthetic PDF.**
  - Build a tiny PDF in a temporary folder with ImageMagick: two pages with four labelled grey boxes each, and an index page.
  - Run the script on it and check it finds 8 cards.
  - This proves the splitting without the real book.
- [ ] **Step 3: Run** `npm test && npm run typecheck && npx vite build && node scripts/check-dist.mjs` → PASS. Then **commit** `feat: creature card pack script, rulebook-data guards in check-dist, docs`

### Task 10: The user's own data files (local only, never committed)

The controller does this, or a subagent that is allowed to read `pdf/`. It produces no commit.

- [ ] **Step 1: Run the card script on the user's Codex.**
  - Run `npm run creature-pack -- "pdf/Dungeon Tables Codex.pdf"` → `local-data/creature-cards.json`.
  - Inspect a sample of the crops, at least one per level, by viewing them.
  - Fix the script's splitting if needed (that fix *is* committed: it's code only).
- [ ] **Step 2: Write `local-data/dungeon-tables.json` by reading the page images.**
  - Core Rules pp. 8–10 and 39. Codex pp. 10, 12 and 13.
  - Transcribe the dice faces from the dice pictures.
  - Validate the file with `parseTableFile` through a small one-off `npx tsx` or vitest run that doesn't get committed, or by loading it in the app.
- [ ] **Step 3: Load both files in the app, using the dev server and Playwright.**
  - Create a hero with them, open an encounter, and take screenshots for the user.
  - Run `git status` to confirm nothing under `local-data/` or `pdf/` is staged.
- [ ] **Step 4: Report to the user.** The manoeuvre dice and armour dice are transcribed from pictures and need checking against the book.
