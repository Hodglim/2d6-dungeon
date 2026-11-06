# 2D6 dungeon companion

A tablet-friendly companion for playing the 2D6 dungeon rules solo. You roll the dice, and the app draws the rooms, exits and doors as you explore. It also keeps your hero sheet, runs fights and rolls on your tables. It works offline once installed.

The app ships no rulebook content. Tables, creature stats and card pictures come from your own copies of the books (see [Your rulebook data](#your-rulebook-data)).

## What it does

**Mapping**
- A guided play flow: place the entrance, then from any open exit roll the room size, place the room, roll its exits and choose where they go, then label it. A ghost room follows your finger and snaps only to valid spots.
- Rooms, corridors, gap corridors, exit squares and an outer boundary all follow the book's placement rules. Rooms are never moved or deleted; Undo takes back the latest ones.
- Door types (archway, wooden, metal, reinforced, curtain, portcullis, stone slab and secret doors), stairs and notes, each with its own tool.
- A hero token you drag between rooms. It walks the shortest path, leaves footprints, and can't pass a locked door.
- Room labels inside each room, rough rock hatching around the map, and blood splatters in rooms where a fight was won.
- Dungeon levels: go down the stairs to a fresh map; earlier levels are kept and can be looked at again.

**Rolling on your tables** (needs your table file)
- Room tables: a placed room rolls its type, description, encounter and exits, with unique rooms re-rolled.
- Locked doors: the first time you use a wooden, metal or reinforced door, a D6 checks whether it is locked. A locked door can be picked with a lock pick from your Small Items (lock quality, then 2D6 + Precision + the pick's bonus), waited at until a patrol comes through, or left alone. Secret doors are never locked.
- A Tables pane with every reference table in your file, rollable, with the matching row highlighted. Table codes in room and treasure text link straight to them. God and herb cards show as pictures.

**Hero and fights**
- A hero creation wizard in book order, and a hero sheet (Hero, Combat, Pack, Loot & Story) with limits, potions, conditions, level-ups and new manoeuvres.
- Encounters: roll on creature tables, then fight turn by turn. Shift the attack dice to hit a manoeuvre, take creature Interrupts and armour into account, and throw weapons and potion bombs. XP is awarded as each creature falls. A won fight is noted in the room's narrative.
- 0 HP in a fight ends the adventure; outside a fight the hero falls unconscious and rolls on the recovery table.

**Dice**
- One floating dice roller (D6, 2D6, D66, D3 and bigger damage dice) with animated pip dice and sound. It always says what the roll is for, takes a modifier, and keeps a labelled history.
- Playing with real dice? Turn it on in the menu and type your own rolls into the roller instead.

**Saving**
- Autosave on the device, one game at a time, with Undo/Redo (the last 20 steps) kept across reloads.
- Export and import a game file to move it between devices.

## Run locally

```
npm install
npm run dev
```

Menu → Load demo map shows a finished map without needing any table file.

## Your rulebook data

To use the room tables, locked doors, hero sheet, fights and Tables pane, load your own table file and creature card pack from the menu (Menu → Load table file…, Load creature cards…). Both stay on your device, are kept apart from the game save, and are never exported or published.

- **Table file:** a JSON file you fill in from your own books. Menu → Download blank table file gives you every table and field, left empty. The format is in [docs/table-file-format.md](docs/table-file-format.md).
- **Card pack:** creature cards, plus god and herb cards for the Tables pane, cut from your own PDFs with `npm run creature-pack` and `npm run add-cards`. This needs `pdftoppm` and `pdftotext` (poppler) and ImageMagick installed. See the same document.

Keep your PDFs in `pdf/` and your own data in `local-data/`. Both folders are git-ignored, and the deploy check refuses to publish them.

## Publish

The app is a static site hosted on Cloudflare Pages.

1. One time only: `npx wrangler login`.
2. `npm run deploy`. It builds, checks that `dist/` holds only the app (no PDFs, `local-data/`, `reference/` or `.superpowers/`), then uploads it.

The first deploy creates the `2d6-map-maker` Pages project and prints the `*.pages.dev` URL. Later deploys update the same URL.

After the first real deploy, open the URL on the iPad once while online, then switch to airplane mode and check the app still opens.

### Check on the iPad after the first deploy

- Install from Safari, build a room, swipe the app away within 1 second, reopen in airplane mode: the room is there and Undo works.
- Leave the app in the background overnight, then place a room: no "Autosave isn't working" banner stays up.
- Deploy a trivial change: the "New version available — reload" prompt appears and works.

## Install on iPad

Open the URL in Safari, then Share, then Add to Home Screen. The app then opens full-screen and works offline. When a new version is published, a "New version available" bar offers a reload.

## Your data

- The game is saved automatically in the browser on each device. There is one game at a time.
- To move a game to another device, use Menu, then Export game, and Menu, then Import game on the other device. An export holds the current game only, not the undo history.
- Two tabs on one device share one save, and the last change wins.
- If saving ever fails, a red bar appears with an Export button so you can keep a copy.

## Testing

```
npm test                  # unit tests
npm run typecheck         # TypeScript and svelte-check
npm run build             # production build into dist/
npm run e2e:persistence   # builds, serves with vite preview on port 4175, checks saving, reload, export/import and storage failures in Firefox
npm run e2e:pwa           # builds twice, checks offline use and the update prompt in Firefox (port 4174)
node scripts/visual.mjs http://localhost:5173 visual   # tablet-size screenshots and 44px touch-target check, against a running `npm run dev`
npm run screenshot -- http://localhost:5173 shot.png   # one screenshot of a running app
```

`npm run e2e:pwa`, `npm run e2e:persistence` and the screenshot scripts need Playwright's Firefox (`npx playwright install firefox`). The e2e scripts leave `dist/` as a normal build.

## Built with

Svelte 5, TypeScript and Vite, with Vitest for tests. Design notes and implementation plans for each feature are in `docs/superpowers/`.
