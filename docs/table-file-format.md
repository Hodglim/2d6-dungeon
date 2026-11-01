# Dungeon table file format

The app ships no rulebook tables. You load a table file made from your own books. It is a JSON file. All names and numbers below are made up; copy the shape, and fill in the values from your own copies.

The file is limited to 2,000,000 bytes. Extra tables you add under `tables` are kept and ignored.

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

The numbers are whole numbers of 0 or more. `potions` lists name and effect text. `kit` is a list of item names.

## startingArmour

Where to find it: Codex, p. 12.

```json
"startingArmour": [ { "name": "Sackcloth Vest", "dice": [3], "modifier": "+0" } ]
```

`dice` has 1 or 2 faces. `modifier` is text.

## startingScrolls

Where to find it: Codex, p. 12. The scroll columns are on Codex p. 10, the scroll table.

```json
"startingScrolls": [ { "name": "Scroll of Mild Glow", "effect": "A faint light appears.",
  "orbit": "Sun", "dispelDoubles": "1-2", "effectModifier": "+1" } ]
```

All fields are text.

## weapons

Where to find it: Codex, p. 13.

```json
"weapons": [ { "name": "Practice Sword", "manoeuvres": [
  { "level": 1, "name": "Wobbly Poke", "dice": [1, 4], "damage": "1" } ] } ]
```

Each manoeuvre has exactly 2 dice. Each weapon needs at least as many level 1 manoeuvres as the first row of `levels` gives in `manoeuvres`.

## levels

Where to find it: Core Rules, p. 10.

```json
"levels": [ { "level": 1, "title": "Wanderer", "manoeuvres": 2, "maxManoeuvreLevel": 1,
  "xpToLevelUp": 10, "shift": 2, "discipline": 3, "precision": 4, "hpBaseline": 11 } ]
```

At least one row, sorted by `level`. Use `null` for `xpToLevelUp` on the last level.

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

Limits only warn on the sheet; they never stop you editing.

## Creature cards

To be completed in Task 9.

## If the app refuses your file

- "This isn't a 2D6 Dungeon table file": not JSON, or `systemId` is not `"dungeon"`.
- "The table file is missing <Table Name>": a required table is absent.
- "The table file is damaged: <detail>": a table is the wrong shape, a die face is outside 1-6, levels are unsorted, or a weapon has too few level 1 manoeuvres.
- "Made by a newer version of the app": `format` is higher than 1.
- "This file is too large to be a table file.": over 2,000,000 bytes.
