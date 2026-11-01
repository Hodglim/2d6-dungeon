# Dungeon table file format

The app ships no rulebook tables. You load a table file made from your own books. It is a JSON file. All names and numbers below are made up; copy the shape, and fill in the values from your own copies.

The file is limited to 2,000,000 bytes. Extra tables you add under `tables` are kept and ignored.

A complete, valid example with three levels is in the repo at `tests/fixtures/dungeon-tables.fixture.json`; copy it and replace the made-up values with your own.

The app will load the file from its menu ("Load table file..."), planned for a later release, and keep it on your device. It is never included in map exports.

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
- `tables`: the tables below. Every one is required.

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

### Making a pack from your PDF

You need `pdftoppm` and `pdftotext` (poppler-utils) and ImageMagick (`magick` or `convert`) installed. Then:

```
node scripts/make-creature-pack.mjs path/to/codex.pdf [--first N --last N] [--index-page N] [--names names.json] [--out local-data/creature-cards.json]
```

(`npm run creature-pack -- path/to/codex.pdf` does the same.)

- It finds the "Creature Index" page (or use `--index-page`), reads the index's names and page numbers, and processes the pages listed (or `--first` to `--last`).
- Each page is rendered, and the four cards are cut out by finding the white gutters between them. Nearly blank areas are skipped.
- The level comes from each page's "LEVEL n - CREATURE CARDS" heading.
- The index gives a page but not a position, so the names on a page are assigned in alphabetical order to reading order: top-left, top-right, bottom-left, bottom-right. If a page's card count differs from its index entries, its cards are named "Page P card K" and a warning is printed.
- The script prints one line per page, for example `page 102: TL=..., TR=..., BL=..., BR=...`. Check these against the book.
- To fix a wrong assignment without changing code, write a JSON file mapping `"page:slot"` to the right name, where slot is 1-4 (reading order) or TL, TR, BL, BR, and re-run with `--names`:

```json
{ "102:2": "Right Name", "103:BL": "Another Name" }
```

The output is written to `local-data/creature-cards.json` by default, which is git-ignored. The script prints the card count and total size.

## If the app refuses your file

- "This isn't a 2D6 Dungeon table file": not JSON, or `systemId` is not `"dungeon"`.
- "The table file is missing <Table Name>": a required table is absent.
- "The table file is damaged: <detail>": a table is the wrong shape (the message names the place, such as "Weapons[1] manoeuvre 3 dice"), a die face is outside 1-6, levels are unsorted, or a weapon has too few level 1 manoeuvres.
- "Made by a newer version of the app": `format` is higher than 1.
- "This file is too large to be a table file.": over 2,000,000 bytes.
