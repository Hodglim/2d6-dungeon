# Dungeon table file format

The app ships no rulebook tables. You load a table file made from your own books. It is a JSON file. All names and numbers below are made up; copy the shape, and fill in the values from your own copies.

The file is limited to 2,000,000 bytes. Extra tables you add under `tables` are kept and ignored.

Load the file from the menu: Menu → Load table file… (and Load creature cards… for a card pack). The app keeps it on your device. It is never included in map exports.

## Starting from the blank template

The easiest way to make your file: Menu → **Download blank table file**. It has every table, every dice key and every field, all left empty, so you only type in values from your own books. It contains no rulebook content.

- Text is `""`, numbers are `null`, dice are `[]`, `unique` is `null`, and each door is `""`. Replace them all.
- Lists whose length depends on the book (potions, kit, armour, scrolls, weapons, manoeuvres, levels, gods) have one blank row. Copy the row for each one in the book. `kit` and `potions` may be emptied to `[]`.
- The room tables are set up for dungeon Level 1 with Exit Type table `EXT1`. For deeper levels, copy the level entry and add more exit tables. If you don't want room tables yet, delete `dungeonLevels` and `exitTables`.
- Load it whenever you like: until every blank is filled, the app refuses it and names the first blank it finds, for example "Starting Values level" or "Weapons[0] name (empty)".

## A short example

A short, complete, valid example (copy it and replace the made-up values with your own):

```json
{
  "format": 1,
  "systemId": "dungeon",
  "name": "Practice tables (made up)",
  "tables": {
    "starting": {
      "level": 1,
      "xp": 0,
      "shift": 2,
      "discipline": 3,
      "precision": 4,
      "hp": 11,
      "rations": 2,
      "potions": [
        {
          "name": "Draught of Mild Cheer",
          "effect": "Restores a few made-up hit points."
        }
      ],
      "kit": [
        "Practice Lantern"
      ]
    },
    "startingArmour": [
      {
        "name": "Sackcloth Vest",
        "dice": [
          3
        ],
        "modifier": "+0"
      }
    ],
    "startingScrolls": [
      {
        "name": "Scroll of Mild Glow",
        "effect": "A faint light appears.",
        "orbit": "Sun",
        "dispelDoubles": "1-2",
        "effectModifier": "+1"
      }
    ],
    "weapons": [
      {
        "name": "Practice Sword",
        "manoeuvres": [
          {
            "level": 1,
            "name": "Wobbly Poke",
            "dice": [
              1,
              4
            ],
            "damage": "1"
          },
          {
            "level": 1,
            "name": "Gentle Swipe",
            "dice": [
              2,
              6
            ],
            "damage": "2"
          }
        ]
      }
    ],
    "levels": [
      {
        "level": 1,
        "title": "Wanderer",
        "manoeuvres": 2,
        "maxManoeuvreLevel": 1,
        "xpToLevelUp": 10,
        "shift": 2,
        "discipline": 3,
        "precision": 4,
        "hpBaseline": 11
      },
      {
        "level": 2,
        "title": "Explorer",
        "manoeuvres": 3,
        "maxManoeuvreLevel": 2,
        "xpToLevelUp": null,
        "shift": 3,
        "discipline": 3,
        "precision": 5,
        "hpBaseline": 14
      }
    ],
    "gods": [
      "Old Mossbeard"
    ],
    "conditions": {
      "bloodied": {
        "label": "Scraped Up",
        "boxes": 3
      },
      "soaked": {
        "label": "Dripping",
        "boxes": 2
      },
      "fever": {
        "label": "Sniffles",
        "effect": "Made-up penalty to checks."
      },
      "pneumonia": {
        "label": "Grand Sniffles",
        "effect": "Bigger made-up penalty."
      }
    },
    "favourBoxes": 4,
    "limits": {
      "potions": 3,
      "scrolls": 2,
      "largeItems": 2,
      "armour": 1
    }
  }
}
```

## Rules that apply across tables

- `levels` has at least one row, runs 1, 2, 3 ... in order, and `starting.level` must match one of its rows.
- `xpToLevelUp` is a whole number on every level except the last, rising from one level to the next. On the last level it is `null`.
- `level`, `maxManoeuvreLevel` and each manoeuvre `level` are whole numbers of 1 or more.
- `weapons`, `startingArmour`, `startingScrolls` and `gods` each have at least one entry. `kit` and `potions` may be empty.
- Free text fields (any wording is accepted, copy the printed text): armour `modifier`, manoeuvre `damage`, and the scroll columns `orbit`, `dispelDoubles` and `effectModifier`.

## Top level

```json
{ "format": 1, "systemId": "dungeon", "name": "My tables", "tables": { } }
```

- `format`: always `1`. A higher number is refused as made by a newer version of the app.
- `systemId`: always `"dungeon"`.
- `name`: any label for your own use.
- `tables`: the tables below. Every one is required except `dungeonLevels`, `exitTables`, `creatureTables`, `creatures`, `referenceTables`, `throwingWeapons`, `potionBombs`, `potions`, `recoveryTable` and `doorLocks`.

Dice are lists of faces, each a whole number 1 to 6, in printed order with the primary (red) die first.

## starting

Where to find it: Core Rules, pp. 8-9.

```json
"starting": { "level": 1, "xp": 0, "shift": 2, "discipline": 3, "precision": 4, "hp": 11, "rations": 2,
  "potions": [ { "name": "Draught of Mild Cheer", "effect": "Restores a few made-up hit points." } ],
  "kit": ["Practice Lantern", "Spare Bootlace"] }
```

`level`, `xp`, `shift`, `discipline`, `precision` and `hp` are your hero's starting values; `rations` is the starting ration count. All are whole numbers of 0 or more (`level` 1 or more). `potions` lists name and effect text. `kit` is a list of item names.

## startingArmour

Where to find it: Codex, p. 12.

```json
"startingArmour": [ { "name": "Sackcloth Vest", "dice": [3], "modifier": "+0" } ]
```

`name` is the armour's printed name; `dice` is the printed dice for it, with 1 or 2 faces. `modifier` is text.

## startingScrolls

Where to find it: Codex, p. 12. The scroll columns are on Codex p. 10, the scroll table.

```json
"startingScrolls": [ { "name": "Scroll of Mild Glow", "effect": "A faint light appears.",
  "orbit": "Sun", "dispelDoubles": "1-2", "effectModifier": "+1" } ]
```

`name` and `effect` are the scroll's printed name and effect. `orbit`, `dispelDoubles` and `effectModifier` are the matching columns of the scroll table, kept as free text.

## weapons

Where to find it: Codex, p. 13.

```json
"weapons": [ { "name": "Practice Sword", "manoeuvres": [
  { "level": 1, "name": "Wobbly Poke", "dice": [1, 4], "damage": "1" } ] } ]
```

`level` is the manoeuvre level it unlocks at, `name` its printed name, `damage` its damage column as free text. Each manoeuvre has exactly 2 dice, in printed order. Each weapon needs at least as many level 1 manoeuvres as the first row of `levels` gives in `manoeuvres`.

## levels

Where to find it: Core Rules, p. 10.

```json
"levels": [ { "level": 1, "title": "Wanderer", "manoeuvres": 2, "maxManoeuvreLevel": 1,
  "xpToLevelUp": 10, "shift": 2, "discipline": 3, "precision": 4, "hpBaseline": 11 } ]
```

`title` is the level's printed title; `manoeuvres` how many manoeuvres you know; `maxManoeuvreLevel` the highest manoeuvre level allowed; `xpToLevelUp` the XP needed to advance; `shift`, `discipline`, `precision` the stats at that level; `hpBaseline` the baseline hit points. Use `null` for `xpToLevelUp` on the last level.

## gods

Where to find it: Core Rules, p. 39, the sheet.

```json
"gods": ["Old Mossbeard", "The Quiet Kettle"]
```

## conditions

Where to find it: Core Rules, p. 39, the sheet.

```json
"conditions": {
  "bloodied": { "label": "Scraped Up", "boxes": 3 },
  "soaked": { "label": "Dripping", "boxes": 2 },
  "fever": { "label": "Sniffles", "effect": "Made-up penalty to checks." },
  "pneumonia": { "label": "Grand Sniffles", "effect": "Bigger made-up penalty." } }
```

## favourBoxes and limits

Where to find them: Core Rules, p. 39, the sheet.

```json
"favourBoxes": 4,
"limits": { "potions": 3, "scrolls": 2, "largeItems": 2, "armour": 1 }
```

`gods` is the list of gods to choose from. `bloodied` and `soaked` give a label and a number of boxes; `fever` and `pneumonia` give a label and an effect text. `favourBoxes` is how many favour boxes the sheet shows. `limits` is how many potions, scrolls, large items and armour you may carry. Limits only warn on the sheet; they never stop you editing.

## dungeonLevels and exitTables (optional)

Where to find them: Core Rules p. 13; Tables Codex pp. 35, 40, 42-43 and 46 for Level 1. Deeper levels are listed in the Codex contents. Both keys are optional: a file without them still loads, and the Room step then has nothing to roll on. (`dungeonLevels` is separate from `levels` above, which holds the hero's character levels.)

`dungeonLevels` has one entry per dungeon level (1 to 10, each used once). Add entries as you reach deeper levels. Each entry has:

- `level` and `name`: the level number, and the name the book gives it (any text).
- `exitTable`: the name of a table in `exitTables` that this level uses when an exit is "Random".
- `rooms`: the Rooms table, a D66 roll. All 36 keys `11` to `66` (red die first, then blue).
- `smallRooms` and `largeRooms`: 2D6 rolls. All keys `2` to `12`.

Each `rooms` or `largeRooms` entry has `type`, `description`, `encounter` (text), `exit` and `unique` (`true` or `false`). Each `smallRooms` entry has `type`, `description` and `unique` only; small rooms always have archway exits. `unique: true` means that room type appears at most once per level; if it is rolled again, the app rolls again.

`exit` is either `"random"` (roll on the level's Exit Type table) or an object with a `door` and an optional `locked: true`. The `door` must be one of: `archway`, `wooden`, `metal`, `reinforced`, `curtain`, `portcullis`, `stoneSlab`.

Mapping from the book's wording:

| Book wording | `door` |
| --- | --- |
| Archways | `archway` |
| Wooden Doors | `wooden` |
| Reinforced Doors | `reinforced` |
| Metal Doors | `metal` |
| Curtains | `curtain` |
| Portcullises | `portcullis` |
| Stone slab | `stoneSlab` (enter it directly) |
| "... all locked" | add `"locked": true` |

`exitTables` maps a table name (such as `EXT1`) to a D66 table: all 36 keys `11` to `66`, each `{ "door": ... }` with an optional `locked`. These tables cannot say `"random"`.

The snippet below is NOT a complete file and would be refused as it stands. It is a made-up example, cut down to a few keys for reading (a real file needs every key, so the lists below are shortened with "..."):

```text
"dungeonLevels": [
  { "level": 1, "name": "Test Halls", "exitTable": "EXT1",
    "rooms": {
      "11": { "type": "Practice Room", "description": "A made-up room.", "encounter": "Only invented dust.",
              "exit": { "door": "wooden", "locked": true }, "unique": false },
      "12": { "type": "Spare Room", "description": "Another made-up room.", "encounter": "None.",
              "exit": "random", "unique": true },
      ...
    },
    "smallRooms": { "2": { "type": "Practice Closet", "description": "A made-up closet.", "unique": false }, ... },
    "largeRooms": { "2": { "type": "Practice Hall", "description": "A made-up hall.", "encounter": "None.",
                           "exit": { "door": "archway" }, "unique": false }, ... } } ],
"exitTables": {
  "EXT1": { "11": { "door": "archway" }, "12": { "door": "curtain", "locked": true }, ... }
}
```

## creatureTables and creatures (optional)

Where to find them: Codex p. 38 for Level 1; the creature cards for the stats. Both keys are optional: a file without them still loads, and the encounter step then has nothing to roll on.

`creatureTables` maps a table name (such as `PRAC1`) to a table with exactly six keys, `1` to `6`. Each entry is either:

- `{ "creatures": [ ... ] }`: one or more creature names, none left blank. Every name must match a key in `creatures` (capitals don't matter).
- `{ "text": "..." }`: for a result that is not a creature, such as an instruction.

`creatures` maps each creature's printed name to its stats:

- `level`: a whole number from 1 to 10.
- `hp` and `xp`: whole numbers, 0 or more.
- `shift`: a whole number. It may be negative.
- `treasure`: text (may be empty).

Each creature may also carry its card's combat details. They are all optional. With them, the encounter pane lists the creature's attacks and Interrupts, marks a hit on its turn and an Interrupt on yours, and shows the Mishap and Prime results:

- `manoeuvres`: a list of `{ "name", "dice", "damage" }`. `dice` is the red and blue die, such as `[3, 4]`; `damage` is the text as printed, such as `"D6 -2 damage"`.
- `interrupts`: a list of `{ "name", "side", "dice", "modifier" }`, plus optional `effect` and `movement`. `side` is `"primary"` (matched against the red die) or `"secondary"` (the blue die). `dice` lists the faces that set it off. `modifier` is the damage taken off, 0 or less. `effect` is any extra text. `movement: true` marks one that moves the creature or an item, which stops counting from round 7.
- `mishap` and `prime`: the text of the Mishap and Prime Attack results.

A made-up example:

```text
"creatureTables": {
  "PRAC1": {
    "1": { "creatures": ["Grumbler"] },
    "2": { "creatures": ["Grumbler", "Moss Lurker"] },
    "3": { "text": "Made-up: roll twice on this table." },
    ...
  }
},
"creatures": {
  "Grumbler": { "level": 1, "hp": 4, "xp": 2, "shift": 0, "treasure": "Made-up: a pouch of pebbles." },
  "Moss Lurker": {
    "level": 1, "hp": 6, "xp": 3, "shift": -1, "treasure": "",
    "manoeuvres": [{ "name": "Spore Puff", "dice": [3, 4], "damage": "D6 -2 damage" }],
    "interrupts": [
      { "name": "Damp Hide", "side": "secondary", "dice": [2, 5], "modifier": -1 },
      { "name": "Roll Aside", "side": "primary", "dice": [6], "modifier": -2, "movement": true }
    ],
    "mishap": "Made-up: it slips on its own moss.",
    "prime": "Made-up: it bursts in a cloud of spores. Lose 1 HP."
  }
}
```

## referenceTables (optional)

Printed tables for the Tables pane, to look up and roll on. They are for display and rolling only; the room and creature tables above stay as they are. A file without this key still loads. Where to find it: the Tables Codex contents pages.

```json
"referenceTables": {
  "XX1": {
    "name": "Practice Crate Table", "group": "generic", "page": 7, "dice": "d6",
    "intro": "You pry open the made-up crate.",
    "notes": "Made-up note.",
    "columns": ["Roll", "Result"],
    "rows": [
      { "roll": "1-3", "cells": ["Nothing but straw."] },
      { "roll": "4-6", "cells": ["Roll on XX2 +1"] }
    ]
  },
  "LIST1": {
    "name": "Practice Price List", "group": "optional", "page": 9, "dice": null,
    "columns": ["Item", "Cost"],
    "rows": [{ "cells": ["Practice Lantern", "2"] }]
  }
}
```

- The key is the table id: the book's code where it has one (such as `XX1`), otherwise a short id made from the name (such as `practice-crate-table`). Only ids that hold a book code become buttons in text.
- `name` (not blank), `group` (`generic`, `random`, `loot`, `level` or `optional`), `page` (whole number, 1 or more) and `dice` are required. `level` (1 to 10, for level tables), `intro` (printed above the rows) and `notes` (printed below) are optional.
- `dice` is `"d3"`, `"d6"`, `"2d6"`, `"d66"`, or `null` for a list that cannot be rolled (no Roll button). A table that does not fit the model (two roll columns, sub-tables) is stored as a list with the roll text in its first cell.
- `columns`: the headings (a heading may be left blank for an unlabelled column; there must be at least one column). When `dice` is set, the first is the roll column. `cells` in each row has one entry per column after the roll column (`columns.length - 1`), or one per column for a list (and a list's rows have no `roll`).
- `roll` is a single value or range as printed: `"3"`, `"1-2"` (a hyphen or en dash), `"7+"` (7 and above), `"0 or less"`. Totals are d3 1-3, d6 1-6, 2d6 2-12, d66 11-66. Rows must not overlap. Gaps are allowed; a total in a gap shows "No row for N". When a modifier takes the total past the lowest or highest row, it counts as that row; a natural (unmodified) total that no row covers is never moved and shows "No row for N", so check the rows reach every total the dice can roll.
- A table needs at least one row.
- Dice pictures in cells are written as text ("3 & 4").

## throwingWeapons and potionBombs (optional)

What the encounter pane can throw before the hero's attack. It offers only what the hero sheet carries, matched by name: a throwing weapon among the large or small items (in round 1, once a fight), a potion bomb among the potions. A throw uses the item up. A thrown weapon that wasn't deflected can be recovered on the Victory panel. Where to find them: the Core Rules combat and potion bomb pages.

- `throwingWeapons`: a list of `{ "name", "damage" }`, plus optional `aliases` (other names it goes by on the sheet, such as a plural). `damage` is a whole number, before any `+1` written after the item's name on the sheet.
- `potionBombs`: a list of `{ "name", "effect" }` with any of these optional keys. `damage` is dice to roll, such as `"2D6 +4"`. `damagePerLevel` is damage per level of the dungeon. `noAttack: true` means the target can't attack this round. `noMovementInterrupts: true` means the target can't use movement Interrupts this round.

A made-up example:

```text
"throwingWeapons": [
  { "name": "Pebble Sling", "damage": 3, "aliases": ["pebble slings"] }
],
"potionBombs": [
  { "name": "Fizz Jar", "effect": "Made-up: it fizzes and pops.", "damage": "2D6 +1" },
  { "name": "Glare Phial", "effect": "Made-up: a dazzling glare.", "noAttack": true }
]
```

## potions (optional)

Potions to pick from when adding one to the hero sheet: a list of `{ "name", "effect" }`. The sheet offers these together with the starting potions and the potion bombs, each name once. Picking one fills in its name and effect, which can still be changed before adding it. Where to find them: the Tables Codex potion tables.

```text
"potions": [
  { "name": "Potion of Glow", "effect": "Made-up: you glow softly for one room." }
]
```

## recoveryTable (optional)

The table to roll on when the hero drops to 0 HP or below outside a fight (a trap, poison, starving). In a fight the foe finishes the hero off and the adventure is over; outside one the hero falls unconscious, and the app shows this table in the dialog to roll on. Where to find it: the Tables Codex contents pages.

```json
"recoveryTable": "XX2"
```

It is the id of a table in `referenceTables` that has dice (not a list). Without it, the dialog still asks, and you roll on the table from your own book.

## doorLocks and patrolTable (optional)

The first time you leave through a door you haven't used, the app asks for a D6 to see whether it is locked. `doorLocks` gives, for each door type, the lowest roll that locks it. Only `wooden`, `metal` and `reinforced` may be listed; door types left out are never checked, and secret doors never are. The numbers below are made up.

```json
"doorLocks": { "wooden": 6, "metal": 4, "reinforced": 5 }
```

Each entry in `dungeonLevels` may also name its patrol table, a code in `creatureTables`. When you wait at a locked door, the app queues a roll on it:

```json
{ "level": 1, "name": "Test Halls", "exitTable": "EXT1", "patrolTable": "PAT1", ... }
```

Without `doorLocks`, there is no automatic lock check (you can still set a padlock in the Door editor). Without a `patrolTable`, waiting still works, and you roll on the patrol table from your own book.

## Creature cards

A creature card pack is a separate JSON file, loaded from the menu next to the table file. It is stored on the device, never exported, and never published. The app ships none; you make your own from your own Tables Codex PDF.

### Pack format

```json
{
  "format": 1,
  "systemId": "dungeon",
  "name": "Creature cards",
  "cards": [
    { "id": "p2-1", "name": "Example Creature", "level": 1, "image": "data:image/jpeg;base64,..." }
  ]
}
```

`format` must be 1 and `systemId` must be `"dungeon"`. Each card has a unique `id`, a `name`, a dungeon `level`, and an `image` as a `data:image/jpeg;base64,...` (or webp/png) URL. The file may be up to 60 MB.

A card may also have a `kind` of `"god"` or `"herb"` (leave it out for a creature). God and herb cards are never fought: they appear in the Tables pane under their own Gods and Herbs chips, as pictures that open full screen on a tap, and an All search finds them by name. Their `level` is not used (0 is fine).

```json
{ "id": "god-p2-1", "name": "Example God", "level": 0, "kind": "god", "image": "data:image/jpeg;base64,..." }
```

### Making a pack from your PDF

You need `pdftoppm` and `pdftotext` (poppler-utils) and ImageMagick (`magick` or `convert`) installed. Then:

```
node scripts/make-creature-pack.mjs path/to/codex.pdf [--first N --last N] [--index-page N] [--offset N] [--names names.json] [--out local-data/creature-cards.json]
```

(`npm run creature-pack -- path/to/codex.pdf` does the same.)

- It finds the "Creature Index" page (or use `--index-page`), reads the index's names and page numbers, and processes the pages listed (or `--first` to `--last`).
- `--offset N` (default 0) is added to the index's page numbers, for books whose printed page numbers differ from the PDF's page numbers. Check the first page in the summary to confirm the cards on it are the right ones. If the printed numbers already match the PDF pages, leave it at 0.
- Each page is rendered, and the four cards are cut out by finding the white gutters between them. Nearly blank areas are skipped.
- The level comes from each page's "LEVEL n - CREATURE CARDS" heading. A page without one takes the level of the nearest heading before it.
- The index gives a page but not a position, so the names on a page are assigned in alphabetical order to reading order: top-left, top-right, bottom-left, bottom-right. If a page's card count differs from its index entries, its cards are named "Page P card K" and a warning is printed.
- The script prints one line per page, for example `page 102: TL=..., TR=..., BL=..., BR=...`. Check these against the book.
- To fix a wrong assignment without changing code, write a JSON file mapping `"page:slot"` to the right name, where slot is 1-4 (reading order) or TL, TR, BL, BR, and re-run with `--names`:

```json
{ "102:2": "Right Name", "103:BL": "Another Name" }
```

The output is written to `local-data/creature-cards.json` by default, which is git-ignored. The script prints the card count and total size.

### Adding god and herb cards

God and herb cards are pictures with no text the script can read, so you name each one yourself. Write a names file mapping `"page:slot"` to the card's name (slot 1-4 or TL, TR, BL, BR, as above), then:

```
node scripts/add-cards.mjs path/to/rules.pdf --kind god --pages 2,4 --names god-names.json [--pack local-data/creature-cards.json]
```

(`npm run add-cards -- ...` does the same.)

- Only the slots named in the names file are kept, so card backs printed on the same pages are skipped.
- The cards are added to the pack (made if it does not exist yet). Running it again for the same kind replaces that kind's cards and leaves the rest.
- Run it once with `--kind god` and once with `--kind herb`, then load the pack again from the menu.

## If the app refuses your file

- "This isn't a 2D6 Dungeon table file": not JSON, or `systemId` is not `"dungeon"`.
- "The table file is missing <Table Name>": a required table is absent.
- "The table file is damaged: <detail>": a table is the wrong shape, or a value is still blank (names, titles, labels, room types and dice may not be left empty; the message ends in "(empty)" for a blank name) (the message names the place, such as "Weapons[1] manoeuvre 3 dice"), a die face is outside 1-6, levels are unsorted, or a weapon has too few level 1 manoeuvres.
- "Made by a newer version of the app": `format` is higher than 1.
- "This file is too large to be a table file.": over 2,000,000 bytes.
