# 2D6 Map Maker: Hero Creation Wizard, Character Sheet, Creature Cards and Player-Supplied Tables (Design)

**Date:** 2026-11-01
**Status:** Agreed in conversation. Builder check done (§12). Pending user review.

**Builds on:** `master` after Plan 4a, with saving, undo persistence, export/import and the PWA (401 tests). Also builds on the deferred items in `docs/superpowers/plans/2026-10-31-plan-1-followups.md`, "Plan 4a deferred items".

**Rulebook references:** these are the user's own PDFs in the git-ignored `pdf/` folder.
- Core Rules pp. 8–11: creating an adventurer, levels, capacity, HP.
- Core Rules pp. 38–41: the four-page character sheet.
- Dungeon Tables Codex p. 12: Starting Armour list and Starting Scroll list.
- Codex p. 13: Weapon Manoeuvres list.
- Codex p. 10: the scroll table, which gives the scroll details.

## 1. Intent

The user is starting to play-test by bringing the game engine online one step at a time. The first step is creating the hero when a new game starts, then keeping their character sheet in the app during play instead of on paper.

The app is **public**, so it must not hand out the paid rulebooks' tables. Each player supplies their own table data in a file they load into the app. The user's own file is made from their PDFs and is never committed or published.

Success: the user taps New game on the iPad and walks through the book's creation steps. The hero sheet is filled in correctly from their tables. After each encounter they update HP, XP, coins and inventory in a few taps, and the hero survives reloads and Undo like the map does.

## 2. Goals

1. **Load a table file** on each device, with clear validation. The tables are stored on the device, separate from the game.
2. **A creation wizard** opens from New game and follows the book's order: name, weapon, manoeuvres, armour, scroll, then review.
3. **A character sheet** shows the four printed pages as tabs and is fully editable by hand.
4. **A quick strip** at the top of the sheet covers the four things changed after every encounter: HP, XP, coins (GC/SC/CC) and inventory.
5. **Rules on the sheet:**
   - the HP baseline
   - an offer to level up when XP reaches the threshold
   - capacity limits that warn and ask but never block
6. **The hero joins the game state:**
   - **saved:** autosaved with the game
   - **undoable:** on the same single undo timeline as the map ("Undo HP −3")
   - **exported:** included in export and import
7. **A documented table-file format,** so other players can make their own file from their books.

## 3. Non-goals

- Combat, encounters, monsters, room-content generation and any other engine rules. Those are later steps.
- An in-app editor for typing tables in. A documented file is enough for now (user decision).
- Tables beyond what creation and the sheet need: starting armour, starting scrolls, weapon manoeuvres, the levels table, starting values and kit, and the sheet's fixed labels. The file format must be able to grow.
- Automatically applying scroll or potion effects. The player edits values by hand.
- More than one hero, or more than one saved game.
- 2D6 Void. The design must not block it, because table files are per game system.

## 4. Anti-goals

These would count as failure even if everything technically worked:
- **Rulebook content in the public app:**
  - no real table values in `src/`, `dist/`, tests, fixtures, docs examples or git history
  - test fixtures and the format doc use made-up names and numbers
- **Losing the hero silently:**
  - every rule from Plan 4a applies to the hero (autosave, a damaged-save dialog, never overwriting without asking)
- **A sheet that fights the player:**
  - the limits warn but never stop a hand edit
  - the app never changes stats without the player seeing it
- **Breaking the map builder for players without tables:** the map-only flow still works with no table file.

## 5. Constraints

- **Stack and layering:**
  - The stack stays the same, and so do the layering and the rule about pinning dependency versions (each must be at least 14 days old).
  - `src/core` stays pure.
  - Game-specific rules live in `src/systems/dungeon`.
  - The UI lives in `src/ui`.
  - Browser storage lives in `src/persistence`.
- **Every change to the game state goes through `History.execute`,** and that now includes hero edits.
- **No backwards compatibility is needed** (user decision, 2026-11-01: the app isn't in use yet). Bump the versions, with no migrations. Older saves or files are refused through the existing damaged/can't-import handling. Fix the deferred "save format vs schema version" item here, because this plan is the first to change the saved shape:
  - tie the two versions together
  - run campaign validation on restore
  - validate `hero`
- **Target device:** iPad in landscape, so touch targets must be at least 44×44 CSS px.
- **Keep the user's table file in `local-data/`,** which is git-ignored. `scripts/check-dist.mjs` must keep it out of `dist/`.

## 6. The table file

- **The format:** one JSON file per game system, for example `{ "format": 1, "systemId": "dungeon", "name": "…", "tables": { … } }`.
  - It has a version number, so later engine steps can add tables without breaking older files.
  - Unknown extra tables are kept and ignored.
- **The format is documented** in `docs/table-file-format.md`.
  - The doc covers each table's fields, with **made-up example values only**.
  - It tells players where in their own books to find each table: book name, table name and page.
- **The first version's content,** with field shapes left to the builder:
  - **Starting values:** level, XP, Shift, Discipline, Precision and HP. Also the potion and kit list the hero starts with, including what the potion does (the table file says what it restores).
  - **Starting armour:** name, dice set and damage modifier for each piece. The dice sets are printed as dice pictures in the Codex, so the reader of the PDF transcribes them from the page image.
  - **Starting scrolls:** name and effect. Also the columns the sheet shows for a scroll (orbit, dispel doubles and effect modifier), taken from the scroll table for those scrolls.
  - **Weapon manoeuvres:** for each weapon, its manoeuvres at levels 1–3, each with a name, a two-dice set and its damage.
  - **Adventurer levels:** for each level, its title, number of manoeuvres, highest manoeuvre level, XP to level up, Shift, Discipline, Precision and HP baseline.
  - **Sheet labels that come from the books:** the god names for Favour of the Gods, and the condition names and their effects.
  - **Capacity limits:** a maximum for potions, scrolls, large items and armour, and manoeuvres from the levels table. These are kept in the file, not hard-coded, because they come from the book.
- **Loading:**
  - Use "Load table file…" in the menu.
  - The file is validated, with plain messages ("This isn't a 2D6 Dungeon table file", "The table file is missing Weapon Manoeuvres", "Made by a newer version").
  - The file is stored on the device in IndexedDB, **separately from the game save**, so New game, Import and the damaged-save choices never wipe it.
  - The menu shows which file is loaded, and lets you replace or remove it.
- **The user's own file:** the builder makes `local-data/dungeon-tables.json` from the user's PDFs by reading the page images. The user should check it against the books, because the dice sets are transcribed from pictures.

## 7. Creation wizard

The wizard **replaces today's New map dialog**. Its behaviour, as agreed with the user, is below.

- **Flow:** New game → "This replaces your current game" with Export first (unchanged) → the wizard.
- **Steps, in order:**
  1. **Game:** map size, as today. This step also offers "Start without a hero" (map only). That is the only path when no table file is loaded, and the step offers "Load table file…" too.
  2. **Name:** the hero's name. The fixed starting values come from the table file and are shown, not asked for.
  3. **Weapon:** one of the weapons the table file lists. Each choice shows its Level 1 manoeuvres so the player can compare.
  4. **Manoeuvres:** pick exactly the starting number (2) of your weapon's Level 1 manoeuvres. Each shows its dice pair as red and blue dice, as in room rolls, and its damage.
  5. **Armour:** pick one starting armour piece, showing its dice set and modifier.
  6. **Scroll:** pick one starting scroll, showing its effect.
  7. **Review:**
     - shows the starting potion and kit, and the whole sheet
     - **Begin** creates the game with the hero, as one undo step, and saves it
- **Back and Next on every step.** Nothing is saved until Begin, and cancelling leaves the current game untouched.
- **After Begin,** play goes on as now, with placing the entrance.

## 8. Character sheet

- **Opening it:** a **Hero** button on the toolbar opens the sheet as a panel. It is greyed out when the game has no hero.
- **Quick strip,** always at the top of the sheet:
  - **HP:** − and + buttons, or tap to type.
    - It shows current HP and the baseline, for example "14 / 10".
    - Healing back to the baseline is the normal case, but values above the baseline are allowed because the book allows them.
  - **XP:** an "add XP" box, the total, and the XP needed for the next level.
    - When XP reaches the level's threshold, the app **offers** to level up and waits for the player's confirmation.
    - Levelling up applies +10 HP, +10 to the baseline, the new level and title, and Shift, Discipline and Precision from the levels table.
    - Manoeuvre changes allowed by the new level are made by hand on the sheet. The choices offered are limited to the highest manoeuvre level allowed, from the table file.
  - **Coins:** GC, SC and CC, each with − and +.
  - **Inventory:** a quick "add item" box that asks whether the item is large or small.
- **Tabs** that follow the printed pages:
  - **Page 1:** name, level, HP, XP, Shift, Discipline, Precision, weapon, applied runes, manoeuvres (with dice set and modifier), armour pieces (with dice set and modifier), magic scrolls (with orbit, dispel doubles and effect modifier), and the legend status level tracker (1–10).
  - **Page 2:**
    - magic potions, with their effect or modifier
    - the Bloodied and Soaked trackers, and the Fever and Pneumonia conditions
    - coins and treasure
    - liberated prisoners and side quests
    - favour of the gods, with favour points for each god
  - **Page 3:** narrative moments, as free text.
  - **Page 4:** large and heavy items (10 slots), small items, loot lockup, rations and additional notes.
- **Editing:** everything is editable by hand. Each edit is one undoable step with a plain label, such as "Undo HP −3" or "Undo add Rope".
- **Limits:** when a list is full (10 large items, 5 potions, 3 scrolls, 3 armour pieces, manoeuvres for the level), the app says so and offers to drop or use something. It never blocks a hand edit.

## 9. Saving, undo and export

- **The hero becomes part of the game state on the single undo timeline.**
  - Today History holds map snapshots only. It must cover the hero as well, so map edits and hero edits share one timeline with the 20-step cap.
  - The builder chooses how to do this, for example snapshots of `{ map, hero }`.
- **Saved and exported:**
  - The autosave record and the exported game file include the hero.
  - The hero holds the player's choices **as written on their sheet**, such as the manoeuvre name, dice and damage. That is the player's own sheet, much like a filled-in paper copy, so it's acceptable.
  - The **table file itself is never included** in exports.
- **Versions:**
  - Bump the save format and the campaign schema version, with no migrations. An old save is refused through the damaged-save dialog.
  - Validate the hero on load and on import with the same "damaged" handling as the map.
- **Tables are only needed to create and level up a hero:** a game with a hero still loads and its sheet still works when no table file is loaded, for example on a second device.

## 10. Testing

- **Unit tests (Vitest), using a made-up fixture table file:**
  - table-file validation, including each refusal message
  - storing and removing the table file, and checking it survives New game and Import
  - the wizard's choices produce the right hero
  - HP baseline rules, the level-up offer and its effects, and limit warnings
  - hero edits are undoable and redoable and share the 20-step cap with map edits
  - refusing a format 1 save, and import with and without a hero
- **Visual and e2e checks (Playwright):**
  - load a fixture table file, run the wizard, check the sheet, reload, and check the hero and Undo
  - the quick strip changes HP, XP, coins and inventory
  - map-only start with no table file
  - load a bad table file and check the message
- **Check that `dist/` contains no table data.** The fixture is made up, so a grep for the user's real table names in `dist/` is a good guard.

## 11. Builder's calls (not discussed with the user)

These are my calls, flagged for the user:
- The JSON field shapes inside the table file.
- How History covers the hero.
- Where the Hero panel sits on the iPad layout.
- Including the fixed sheet labels (god names, condition names) in the table file, because they come from the book.
- Putting capacity limits in the table file, not in code.
- "Start without a hero" lives on the wizard's first step.
- The level-up offer changes stats but leaves manoeuvre swaps to the player.
- The wording of messages.

## 12. Builder-check answers

### Answered from the book or the conversation

- **Dice sets:**
  - A dice set is a list of specific die faces.
  - A manoeuvre has exactly two faces, a primary (red) and a secondary (blue), for example red 3 and blue 5.
  - An armour piece has one or two faces. Transcribe them as printed.
  - Show them as red and blue dice, using the existing dice visuals.
- **Number of starting manoeuvres:** this comes from the levels table, which says 2 at Level 1. The "(2)" in §7 is just that value.
- **Levelling up** (Core Rules p. 10–11):
  - XP is cumulative and is never reset. Each level's "XP to level up" figure is a running total.
  - On level-up, current HP goes up by 10. It is not set to the baseline.
  - The baseline becomes the levels table's HP baseline, which matches the book's "+10 per level".
  - Level, title, Shift, Discipline and Precision, the number of manoeuvres and the highest manoeuvre level all come from the levels table.
  - If one XP gain crosses several thresholds, offer each level in turn.
  - The book's HP rule: healing (a healing potion, for example) only restores up to the baseline. Other gains can go above it. The sheet lets you type any value.
- **Real-data guard for `dist/`:** `scripts/check-dist.mjs` reads the names from `local-data/dungeon-tables.json` when that file exists. It fails if any of those names appears in `dist/`, and it skips the check when the file is absent. `local-data/` is already git-ignored, so the list of real names is never committed.
- **The user's own table file:** making it is the **last task** of the plan. The builder reads the PDF page images, writes the file, and the user then checks it against the books.

### My calls (not discussed with the user; flagged for review)

- **Where the hero lives:**
  - `Campaign.hero` holds the current hero.
  - Core treats it as opaque (`unknown | null`). The game system supplies the hero type and its validation (`src/systems/dungeon`), which keeps 2D6 Void open.
  - History snapshots become `{ map, hero }`.
  - The save record and the export carry the hero through the campaign.
  - The schema version goes to 2 and the save format to 2, with tests that tie the two together.
- **Sheet fields:**
  - **Page 1:**
    - name, level and title, current HP and baseline, XP
    - Shift, Discipline and Precision
    - weapon, and applied runes (free text)
    - manoeuvres: up to 3 rows of name, dice set and modifier
    - armour: up to 3 rows of name, dice set and modifier
    - scrolls: up to 3 rows of name, orbit, dispel doubles and effect modifier
    - the legend status tracker: a number from 0 to 10
  - **Page 2:**
    - potions: up to 5 rows of name and effect or modifier
    - Bloodied and Soaked, each a count of ticked boxes (the box count comes from the table file)
    - Fever and Pneumonia, each on or off
    - coins: GC, SC and CC as whole numbers
    - treasure, liberated prisoners and side quests, each a list of text lines
    - favour points per god: a count of ticked boxes (the box count comes from the table file)
  - **Page 3:** narrative moments, as one free text area.
  - **Page 4:**
    - 10 large-item slots
    - small items, loot lockup (items left in storage), rations (a count plus a note) and additional notes, each a list of text lines or free text
- **Undo granularity:**
  - Each committed edit is one undo step: a typed field when it loses focus, an item added or removed, and so on.
  - Repeated − or + taps on the same field within about 1.5 seconds merge into one step, labelled for example "HP −3", so they don't push map history out of the 20-step cap.
- **No table file, or a different one, once a hero exists:**
  - At creation, the hero stores its capacity limits and the levels table rows it needs, copied from the table file. That way limits and level-up offers still work on a second device with no table file.
  - Changing manoeuvres needs the weapon manoeuvre table. When no table file is loaded, the sheet says "Load your table file to choose manoeuvres", and hand-typed rows still work.
  - Replacing the table file later doesn't change an existing hero.
- **Adding a hero later:**
  - A map-only game can add a hero later. The Hero button reads "Create hero" when the game has none, and it runs wizard steps 2–7 without touching the map.
  - Creating the hero is one undoable step.
- **Hero panel:**
  - The sheet opens in place of the right-hand step panel, made wider while it's open, and the map stays visible and usable beside it.
  - The quick strip sits at the top of that panel.
  - Closing the panel brings the step panel back.

## 13. Creature cards (added 2026-11-01, user request)

The user wants the **whole creature card image** from the Codex (pp. 102–127, four cards per page, Levels 1–10) to show in the sidebar during an encounter. They pick or search for the enemy they're facing.

### Making a card pack (agreed)

- **A script in the repo** (for example `scripts/make-creature-pack.mjs`), containing no rulebook content, takes the path to a player's own Tables Codex PDF.
- **It renders and crops:**
  - It renders the creature pages and crops each card out as its own image.
  - Use the local `pdftoppm` (poppler) and ImageMagick. These are CLI tools, not new npm dependencies.
  - The README says they're needed.
- **It names the cards:** names and levels come from the Codex's creature index, which is a text page. They're matched to card positions in reading order: top-left, top-right, bottom-left, bottom-right.
  - Pages with fewer than four cards must be handled.
  - The script prints a contact sheet or a list, so the result can be checked by eye.
- **The output is a card pack file:** `local-data/creature-cards.json`, holding `{ format, systemId, name, cards: [{ id, name, level, image }] }`.
  - Images are embedded as JPEG or WebP data, at a resolution readable on an iPad sidebar.
  - The script reports the pack's total size.
  - The file is git-ignored and never committed or published.

### Loading (agreed)

- Load the card pack from the menu, next to the table file. It's a separate file.
- It's stored on the device in IndexedDB, separately from the game save and the table file.
- It's never included in exports.
- Validate it with plain error messages.
- The size limit for this import is larger than for game files (builder's call, for example 60 MB).

### Encounter UI (agreed)

- An **Encounter** button opens a search: type part of a name, or filter by dungeon level, then pick a creature.
- The creature's card image replaces the right-hand step panel, sized to fit, while the map stays usable.
- Tap the card to view it larger.
- **End encounter** closes it and brings the step panel back.
- The open encounter isn't part of the undo timeline. My call is that it's remembered across a reload only if that's simple, for example a small field in the save record.
- No enemy HP tracking or combat rules yet; those are a later step.
- Without a card pack loaded, the Encounter button explains how to load one.

### Other players

The format doc (`docs/table-file-format.md`) explains how to run the script on your own PDF, and the script prints its own usage.

### My calls (flagged)

- The JSON-with-embedded-images format, so no zip dependency is needed.
- How the Hero sheet and an open encounter share the sidebar: switch between them with two tabs at the top of the panel, with the encounter shown first while it's open.
- Matching names to card positions using the index's page numbers.
- The `check-dist` guard also fails if `dist/` contains any embedded image data or creature names from `local-data/creature-cards.json`, when that file exists.
- Making the user's own card pack is a late plan task, run on the user's PDF and checked by eye against the book.
