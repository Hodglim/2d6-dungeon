# 2D6 Map Maker: Room Tables and Dungeon Levels (Design)

**Date:** 2026-11-02
**Status:** Agreed in conversation. Builder check done (§12). Pending user review.
**Builds on:** `master` after Plan 5 and the wizard layout changes (501 tests).

**Rulebook references** (the user's own PDFs, in git-ignored `pdf/`):
- **Core Rules p. 12–13:** small, large and corridor rooms; the exit count; the exit type from the room table.
- **Core Rules p. 18:** the next level, rations on the stairs, the entrance to the next level, and the room-creation quick reference.
- **Codex p. 35:** Exit Type Tables (EXT1, EXQ2).
- **Codex p. 40:** Level 1 Large Rooms (XX1L).
- **Codex p. 42–43:** Level 1 Rooms, parts 1 and 2.
- **Codex p. 46:** Level 1 Small Rooms (XX1S).
- Deeper levels have their own sets of tables, listed in the Codex contents and index.

## 1. Intent

The next step in bringing the game engine online for play-testing: when a room is placed, the player rolls on the right room table for the dungeon level, and the result names the room, records its description and encounter, and sets its exit type. Each dungeon level is its own map. When a level is finished, the player goes down the stairs, deals with the ration, and starts the next level on a fresh map.

The app is public, so these tables come from the player's own table file, like the earlier tables. The public app ships none of them.

**Success:** the user plays Level 1 from the entrance to the stairs down. Every room is rolled from their own tables, with the right table chosen for its size. They then go down to Level 2 with the ration handled, and carry on.

## 2. Goals

1. The table file gains the room tables for each level (Rooms D66, Small Rooms 2D6, Large Rooms 2D6) and the Exit Type tables. These are documented in the format doc with made-up examples.
2. Each map knows its dungeon level. A new game starts on Level 1.
3. After a room's exits are rolled and placed, a **Room** step rolls on the correct table. It uses the same animated dice and the same choice between "roll for me" and typing a result.
4. The result names the room, saves the description and encounter text as the room's note, and sets all of the room's exits to the table's exit type. "Random" means a roll on the level's Exit Type table.
5. Unique rooms already on this level are re-rolled.
6. Once stairs down have been placed, the player can **go down to the next level** through an "On the stairs" step (the ration rule), which starts a fresh map for that level.
7. Earlier levels' maps are kept in the game, viewable read-only, and included in exports.

## 3. Non-goals

- Resolving encounters: monster tables, combat, and the Encounter column's follow-up rolls. The encounter text is shown and saved as a reminder only.
- Treasure tables, the patrol, lock and portcullis rules, and other room-content rules.
- Deciding automatically that a level is finished. The player decides, and places the stairs down.
- Backtracking between levels. It isn't allowed by the rules, and earlier maps are read-only.
- Transcribing every level's tables now. The user's file starts with Level 1 and EXT1/EXQ2, and grows as they reach deeper levels.

## 4. Anti-goals

- **No rulebook content** in `src/`, `tests/`, `docs/`, `dist/` or git history. Fixtures use invented tables.
- **No silent loss:** going down a level must never lose the current level's map, the hero or the save. Every Plan 4a and Plan 5 rule still applies.
- **The map builder keeps working with no table file.** Without tables there is no Room step, or it offers to load tables, and the player can continue.
- **No forced placement:** a room roll never moves, resizes or deletes a room. Rooms are still only fixed with Undo.

## 5. Constraints

- **Stack and layering:**
  - The stack, layering and dependency-pinning rules stay the same.
  - `src/core` stays pure.
  - Table lookups and the room-roll rules live in `src/systems/dungeon`.
- **History:** every game-state change goes through `History.execute`. The room roll is one undoable step.
- **Saves:** there is no backwards-compatibility requirement yet (user decision, 2026-11-01). The save format and schema versions are bumped together if the saved shape changes.
- **Device:** iPad landscape, with touch targets of at least 44 px.

## 6. Table file additions

- **Per level** (keyed by the dungeon level number):
  - **Rooms:** a D66 table. Each of the 36 entries (11–66, red die then blue) has a room type, description, encounter text, exit type and a unique flag.
  - **Small Rooms:** a 2D6 table (2–12). Each entry has a room type, description and unique flag. The exits are always archways, so the table holds no exit column.
  - **Large Rooms:** a 2D6 table (2–12). Each entry has a room type, description, exit type and unique flag. It may also have encounter text, if the book's table has it.
  - The level's name, for example "The Front Hall", if the book gives one.
- **Exit Type tables** (EXT1, EXQ2, Codex p. 35): each level says which Exit Type table it uses for "Random".
- **Exit types:** these are text that must map to the app's door types. The builder defines the mapping, for example Archways→archway, Wooden Doors→wooden door, Reinforced Doors, Curtains, Portcullis and so on. Add door types to the dungeon system and Classic theme as needed, drawn simply and originally.
- **Validation:** the existing style applies. Every 2D6 table has entries 2–12 and every D66 table has all 36 entries. Error messages name where the problem is.
- **Format doc:** the tables are documented with made-up examples, and the doc says which book pages they come from.

## 7. Dungeon level per map

- The map's `level` field becomes the dungeon level number. A new game is Level 1.
- The current level is shown in the UI (the toolbar or step panel), for example "Level 1 · The Front Hall".
- Room rolls use the current map's level. If the table file has no tables for that level, the Room step says so ("Your table file has no Level 3 room tables"), and the player can skip it or type the details by hand.

## 8. The Room step

This follows the book's quick reference (p. 18).

- **Order:** roll the size → place the room → roll the exit count → place the exits → **Room step** → apply the exit type.
- **Skipped for:** corridors and the entrance room, which have no encounters.
- **Which table** (Core Rules p. 13, using the room's final area after placement and clipping):
  - 6 squares or fewer: Small Rooms.
  - 32 or more from a doubled roll: Large Rooms.
  - Otherwise: Rooms.
- **Rolling:** a D66 for Rooms, or 2D6 for Small and Large Rooms. The player can roll with the animated dice or type the result.
- **Unique:** if the result is unique and that room type already exists on this map, roll again automatically. Show the re-roll ("Already on this level — rolling again").
- **The result:**
  - Show the room type, description, encounter text and exit type.
  - Name the room on the map with that type, for example "7 - Mossy Den". The existing label rules apply.
  - Save the description and encounter as the room's note.
  - Set every exit of this room to the exit type, as part of the same undo step.
- **"Random" exit type:** roll on the level's Exit Type table, with the same dice UI, and apply the result to all of the room's exits.
- **Skip:** the player can skip the Room step and fill the room's details in by hand later.

## 9. Going down a level

This follows Core Rules p. 18.

- **When it's offered:** once the current map has stairs down, a **Go down to Level N+1** action appears. The app may suggest finishing the level once coverage is at least 75%, but it never forces it.
- **On the stairs**, a short confirmed step with two choices:
  - **Eat a ration:** one ration is used. HP goes up by 2 per Adventurer Level, plus 2 more if the hero has a cloth or bandage (a tick box the player sets), capped at the HP baseline.
  - **Don't eat**, or the hero has no rations: the hero loses half their current HP, up to 20.
- **The new level:**
  - A fresh map is created for the new level and becomes the current map.
  - The entrance stairs go in the middle of the outer boundary, as for Level 1.
  - The entrance room's size is rolled with no doubles applying.
  - The entrance room has three archway exits and no encounters.
- **Undo:** going down is a confirmed, one-way step, because it changes the hero and starts a new map. Undo then covers only the new level. The earlier level's map is kept.
- **Earlier levels:** a level picker shows earlier levels' maps read-only. Exports and saves include every level.
- **Without a hero**, for example in a map-only game, going down simply starts the next map.

## 10. Testing

- **Unit tests** (with an invented fixture):
  - table-file validation for room tables
  - which table is chosen by area and doubles
  - D66 and 2D6 lookups
  - unique re-rolls
  - exit-type mapping and "Random"
  - the room roll naming the room, setting its note and setting its exits as one undo step
  - the ration rules (eating, not eating, no rations, the baseline cap, the half-HP-up-to-20 rule)
  - going down creating a new map with the right level, keeping the old one, and the save round trip
- **Visual and e2e tests:**
  - place a room, roll the room, and check the label and the exit types
  - a unique re-roll
  - a level with no tables
  - stairs down, then go down, then the ration, then the Level 2 entrance
  - the level picker shows Level 1 read-only

## 11. Builder's calls (flagged for the user)

- The table-file field shapes for room and exit tables.
- The mapping from exit-type text to door types, and how any new door types are drawn.
- How earlier levels are stored, whether as a list of maps in the campaign or similar, and how saves and History handle them. History covers only the current level.
- Where the level indicator and the level picker sit in the UI.
- Whether the Room step can be reopened for a room after a skip.
- Message wording.

## 12. Builder-check answers

### From the book or the conversation
- **Ration rule (Core Rules p. 18):**
  - **Not eating, or no rations:** lose half your current HP, rounded down. The loss is capped at 20. HP cannot drop below 0 this way.
  - **Eating:** uses one ration (`hero.rations − 1`) and gains 2 HP × `hero.level`, plus 2 more if you have a cloth or bandage. HP is capped at `hpBaseline`, and a hero already at or above the baseline gains nothing.
  - **Cloth/bandage:** a one-off tick box on the stairs step, not saved on the hero.
  - **No rations:** the step offers only the "don't eat" outcome.
- **Which table:** use the existing `classify(rect, size)` in `src/systems/dungeon/rules.ts` on the room's final rect.
  - small → Small Rooms
  - large → Large Rooms (32 or more squares, and the roll was doubled)
  - normal → Rooms
  - corridor → no Room step
  - A doubled roll clipped below 32 is therefore an ordinary room, and a room of 32 or more that wasn't doubled is too. That matches p. 13.
- **The coverage figure** already exists: the percentage button at the right of the toolbar. The "you could finish this level" hint at 75% or more uses it.
- **Exit types in the book** (EXT1 and EXQ2, Codex p. 35, and the room tables): Archways, Wooden Doors, Reinforced Doors, Metal Doors, Curtains, Portcullises, plus "Wooden Doors — all locked" and "Metal Doors — all locked". The dungeon system already has all of these door types (`archway`, `wooden`, `metal`, `reinforced`, `curtain`, `portcullis`, `stoneSlab`), and doors already have a `locked` flag.

### My calls (not discussed with the user)
- **Exit types in the table file:**
  - The table file stores exit types as the app's door-type ids plus an optional `locked: true`, for example `{ "door": "wooden", "locked": true }`, or the word `"random"`.
  - The format doc lists the allowed ids next to the book wording.
  - An unknown id fails validation, and the message lists the allowed ids.
  - No new door symbols are needed.
- **Placement flow with tables loaded:**
  - The room is placed and committed as today. Its exits are placed as archways, the default, which keeps the current single "place room" undo step.
  - The Room step then runs as a **second undo step**. It records the roll on the room and rewrites the door type, and the locked flag where needed, of the exits this room created.
  - Exits only, not the door the player entered through. That door belongs to the previous room's exit type.
  - The Exit Type step shown before exits are placed is skipped when a table file is loaded.
  - With no table file, the current flow, including the manual Exit Type step, is unchanged.
  - Small rooms always stay archways.
  - Exits added later with the Door tool are not touched.
- **"Random" exit type:** one roll on the level's Exit Type table (D66, as printed). The result applies to all of the room's new exits.
- **Rooms record their roll:**
  - Each room gains an optional `contents: { table: 'rooms' | 'small' | 'large', roll: string, type: string, description: string, encounter: string, exit: … }`.
  - The room's label name is set to `type`.
  - The room's note is set to the description.
  - The encounter text is kept separately in `contents` and shown in the room inspector and the Room step. It isn't merged into the note.
  - Room steps the player skipped can be reopened from the room inspector ("Roll for this room") while the room has no `contents`. That runs the same step as its own undo step.
- **Unique rooms:**
  - Unique types are matched by `contents.type` on this map, ignoring case and surrounding spaces.
  - **"Roll for me":** re-rolls until it gets a non-duplicate. After 50 attempts, or if every remaining entry is a unique type already used, it accepts the last result with a notice.
  - **Typed results:** a typed duplicate is rejected with "Already on this level — roll again".
- **Levels:**
  - `DungeonMap.level` becomes a number (1–10). This is a type change, with a schema and save-format bump and no migration (per the earlier decision).
  - The level's display name, such as "The Front Hall", comes from the table file. With no table file, just "Level N" is shown.
  - Levels are strictly sequential: you can only go down to N+1.
  - `Campaign.maps` holds every level in order. `activeMapId` is the deepest level.
  - The History, autosave record and export carry the earlier levels, read-only, alongside the active map's timeline. The builder chooses the exact shape. History snapshots stay limited to the active map.
