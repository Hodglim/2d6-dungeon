# 2D6 Map Maker: Map Editor Core (Part 1) Design

**Date:** 2026-10-31
**Status:** Approved in brainstorming; pending written-spec review

## 1. Purpose and context

An original, browser-based mapping companion for the solo game *2D6 Dungeon*, designed so that *2D6 Void* (a space-themed variant by the same author) can be added later. The visual and UX baseline is DarkArts Studios' "2D6 Map Maker" (itch.io). We reproduce its style and feature set with our own code, rendering and symbols; nothing is copied from it. Reference screenshots are in `reference/` (git-ignored).

### Roadmap

| Part | Scope | Status |
|------|-------|--------|
| 1 | **Map editor core** (this spec) | Designing |
| 2 | Tables and dice engine: red/blue dice roller, rulebook tables as user-local data | Future |
| 3 | Game engine: room generation, monsters, rules, **character sheet** (hero stats and inventory) | Future |

Part 1 must leave clean extension points for Parts 2–3 and for the Void system, but builds none of them.

### Content and copyright constraint

Rulebook content (tables, monsters, rules text) the user extracts from their purchased PDFs lives only in git-ignored folders (`local-data/`, `pdf/`). It is never committed, bundled into the shipped code, or published.

## 2. Target platform

- Runs in the browser and works well on **desktop (mouse and keyboard) and tablet (touch)**.
- Installable **PWA** that works offline after the first load. Static files only, with no server.

## 3. Scope

### In v1
- Dungeon map with a configurable grid (default 25×25), Outer Boundary, and an entrance outside the boundary.
- **Guided play flow** (primary): entrance → pick open exit → enter room size → position → exits → label.
- **Edit tools** (fallback): rooms are never moved, resized or deleted after placement — mistakes are fixed with Undo (newest-first) and re-placing; add, remove and retype doors; stairs; locks; secret doors; notes; token.
- Door types: archway, wooden, metal, reinforced, curtain, portcullis, stone slab.
- Room labels: number, room type, unique/boss flag, narrative note.
- **Classic** theme: dot grid, hatched rock, ink walls with inner shadow, textured floors, footprints.
- Player token with A* pathfinding and an animated footprint trail.
- Undo/redo, autosave (IndexedDB), JSON save/load, PNG export.
- Display toggles: grid, shadows, hatching, decals, footprints, token.
- Touch: pan, pinch-zoom, tap-to-place, 44px minimum targets.
- `GameSystem` plug-in layer with a single `dungeon` system.

### Designed for, not built
Multiple maps per campaign (levels) linked by stairs and exit shafts; extra themes (including Void hull); icon library (game-icons.net, CC BY 3.0, credited); hazard regions and voids; lairs; realm maps; dice roller; table lookups; generation; character sheet.

## 4. Technology

TypeScript, Vite, **Svelte** (UI), **Canvas 2D** (map rendering), Vitest (unit), Playwright (e2e), service worker for offline use.

## 5. Architecture

```
ui/ (Svelte)           toolbar, status bar, dialogs, settings
   │ dispatches commands / reads state
   ▼
interaction/           camera, unified pointer input, tool state machine, hit-testing
render/                Canvas 2D layer stack, themed
   │ reads model
   ▼
core/ (pure TS)        model, commands, rules, geometry, pathfinding, serialize
   ▲ plugged in
systems/dungeon/       GameSystem: door/feature types, themes, play-flow rules
persistence/           IndexedDB autosave, JSON import/export, PNG export
```

Dependency rules:
- `core/` imports nothing from the UI, the canvas or a specific system.
- `render/` and `interaction/` depend on `core/` and on the `GameSystem` interface.
- `ui/` only dispatches commands and reads state.

### GameSystem interface (v1 surface)

Rules-facing only, so `core/` stays canvas-free. Themes (with their draw functions) live in a render-side registry keyed by system id (Plan 2).

```ts
interface GameSystem {
  id: string;                       // 'dungeon'
  name: string;
  doorTypes: { id: string; name: string }[];
  defaultDoorType: string;
  defaultThemeId: string;
  entranceEdge: 'N' | 'S' | 'E' | 'W';   // Dungeon: 'S' (bottom)
  defaultMapSize: { width: number; height: number };
  roomDieRange: { min: number; max: number };  // Dungeon: 1–6 per die
  maxExits: number;                 // Dungeon: 3
  // Parts 2–3 will add: tables, dice definitions, generators, heroSheet schema
}
```

Feature kinds (`stairs`, `note`) are fixed by the core `Feature` type in v1.

## 6. Data model

All coordinates are integer grid squares: x runs right, y runs down, and (0,0) is the top-left square inside the Outer Boundary.

```ts
interface Campaign {
  schemaVersion: number;
  id: string; name: string;
  systemId: string;               // 'dungeon'
  maps: DungeonMap[];             // v1 UI uses one map; container supports many
  activeMapId: string;
  hero: unknown | null;           // reserved for Part 3 character sheet (shape defined by system)
}

interface DungeonMap {
  id: string; title: string; hero: string; level: string;
  width: number; height: number;  // area inside the Outer Boundary
  themeId: string;
  defaultDoorType: string;
  seed: number;                   // seeds hatching and decal randomness
  rooms: Room[]; doors: Door[]; features: Feature[];
  token: Token | null;
}

interface Room {
  id: string; number: number;
  kind: 'room' | 'passage' | 'entrance';
  x: number; y: number; w: number; h: number;     // rectangles only
  label: { type: string; unique: boolean; narrative: string };
  entryDoorId: string | null;     // door the room was entered through (labels anchor here)
}

interface Door {                   // lives on an edge; stored canonically
  id: string; x: number; y: number; side: 'N' | 'W';
  type: string;                    // a system door-type id
  secret: boolean;
  lock: { locked: boolean; note: string } | null;
}

type Feature =
  | { id: string; kind: 'stairs'; x: number; y: number; dir: 'up' | 'down'; linkedMapId?: string }
  | { id: string; kind: 'note';   x: number; y: number; text: string };

interface Token { x: number; y: number; trail: { x: number; y: number }[] }  // trail capped (e.g. 200)
```

### Derived (never stored)
- **Walls:** an edge is a wall if it separates floor from rock, or two different rooms, and has no door on it.
- **Open exit:** a door with a room on exactly one side.
- **Room numbers:** rooms are numbered 1…N in the order added. Rooms are never deleted directly; the only way to remove one is **Undo**, which steps back through the timeline newest-first. So numbers never have gaps, and undoing Room N's step frees number N (and its narrative) for the next room. Other rooms are never renumbered.
- **Undo/redo is the one timeline for every action** (room steps, token moves, notes, door edits…). Free features (stairs, notes, extra doors, locks) can also be removed with their own tools; each removal is itself a step on the timeline.

### Entrance
The entrance is a 1×1 room of kind `entrance` placed **one square outside** the Outer Boundary on `system.entranceEdge`. For Dungeon that is y = height, at any x from 0 to width−1. Its inward-facing edge carries an open exit. This is the only sanctioned crossing of the boundary.

## 7. Game rules enforced (from the 2D6 Dungeon rules)

- **Room size** comes from 2D6: the **red (primary)** die is the **width** and the **blue (secondary)** die is the **height**. The v1 size dialog labels the fields "Width: red / primary" and "Height: blue / secondary" in those colours. Part 2's roller uses the same colours.
- **Exit count** comes from 1D6: 1 = no exits, 2–3 = 1 exit, 4–5 = 2 exits, 6 = 3 exits. v1 accepts the count you enter, from 0 to 3. Part 2 adds the roll. A count of 0 skips to labelling.
- **Positioning is the player's choice**, subject to:
  - Rooms cannot overlap.
  - Rooms may butt up against other rooms. The shared edge is a wall unless a door is placed on it.
  - When a room reaches the **Outer Boundary**, it is **clipped**, and the boundary becomes the room's border.
  - Passages (corridors) may also run to and end at the Outer Boundary, clipped the same way.
- **Exits cannot be placed on the Outer Boundary.**
- An exit may be placed on a wall shared with an existing room. It then becomes a door connecting the two rooms (agreed assumption).

## 8. Interaction

### Guided play flow (state machine)
1. **Place entrance:** highlight valid squares on the entrance edge. Tapping one creates the entrance room and its open exit.
2. **Pick open exit:** tap a green exit stub.
3. **Room size:** dialog with width (red) and height (blue), each 1–6.
4. **Position:** a ghost room snaps to touch the exit, and dragging slides it along the wall.
   - The ghost shows its **clipped** shape live at the Outer Boundary, along with the resulting size ("rolled 6×5 → placed 6×3").
   - Overlap turns the ghost red, shows a reason in the status bar ("overlaps Room 3") and disables confirm.
   - Width and height can be swapped, or resized manually if needed. Confirm with a tap or the Place button.
   - The ghost must keep at least one row or column of floor in front of the chosen exit, so the room actually connects. A clip that would leave zero area is invalid.
5. **Exits:** dialog for count (0–3), door type (defaults to the map default) and a "create 1-square passages" toggle. Valid wall squares are highlighted: room perimeter, not on the Outer Boundary, not already a door. Tap to place each one.
   - With passages on, each exit gets a 1×1 `passage` room beyond it, whose far edge carries a new open exit.
   - A passage that would overlap a room or cross the boundary is not offered at that position.
6. **Label:** room type, unique/boss flag and narrative note. This step can be skipped.

The whole flow (steps 3–6) commits as **one undoable compound command**. Esc or Cancel aborts at any step with no change.

### Edit tools
Select (inspect and relabel a room; rooms cannot be moved, resized or deleted — fix mistakes with Undo, see §6), Door (tap a wall edge to add a door or change its type), Stairs, Lock, Secret, Note, Token. Edits are validated with the same rules (History rejects any edit that breaks an invariant).

### Token
Tapping an explored floor square moves the token along an A* path through doors. Secret doors are passable only if the player has revealed them; in v1 a secret door is impassable until its `secret` flag is cleared. The token animates square by square and appends each square to the footprint trail.

### Input and camera
- One finger: tap or drag for the active tool. Two fingers: pan and pinch-zoom.
- Mouse: wheel zooms, middle-drag or space+drag pans.
- At low zoom, taps snap to the nearest valid square or edge so targets stay at least 44px.
- Keyboard: Ctrl/Cmd+Z / Shift+Z for undo/redo, tool hotkeys, Esc to cancel.
- "Fit map" button.

## 9. Rendering

### Theme

```ts
interface Theme {
  id: string; name: string;
  paper: string; gridDot: string; floor: string[]; ink: string; accent: string;
  wallStyle: 'line' | 'stoneBlocks' | 'rough' | 'chamfered';
  rockStyle: 'hatch' | 'rubble' | 'none';
  doorSymbols: Record<string, DrawFn>;
  labelFont: string;
}
```

v1 implements **Classic** only (`wallStyle: 'line'`, `rockStyle: 'hatch'`). The renderer reads every visual choice from the theme, so other styles slot in later.

### Layer stack (bottom to top)
1. Paper and dot grid, plus the dashed Outer Boundary
2. Rock hatching *(offscreen cache)*
3. Floors and decals *(offscreen cache)*
4. Walls and inner shadow
5. Doors, features, open-exit stubs
6. Room labels (boxed "N - Type"). Preferred position is just inside the room next to its entry door; if the text doesn't fit there, the label moves to the nearest position where the whole box fits without crossing walls, doors or other labels.
7. Overlay: highlights, ghost room, selection handles
8. Token and footprints *(animated each frame)*

### Classic look
- **Hatching:** each rock square within about 1.5 squares of floor gets 2–4 clusters of 3–5 parallel short strokes at a random angle. Density and opacity fall off with distance from the wall.
- **Floors:** subtly varied grey per square, with occasional procedural decals (cracks, stains, pebbles).
- **Walls:** thin ink lines with a soft gradient shadow on the inner side.
- **Doors:** original vector symbols for the 7 types, centred on the edge.
- **Token:** a dark disc with a "P", tweened between squares, leaving fading footprints.
- All randomness is seeded by `(map.seed, x, y)`, so output is stable across redraws and identical in export.

### Performance
Cached layers are re-rendered only when the model changes, and only for the dirty region (the affected bounding box plus a 2-square margin). Everything is drawn in grid units through a camera transform.

### PNG export
Re-renders all layers at 2× or 3× onto an offscreen canvas, respecting the display toggles.

## 10. Persistence

- **Autosave:** the whole campaign is written to IndexedDB about 1s after each committed command. The home screen lists campaigns (open, rename, duplicate, delete with an in-app confirm), and the last one reopens automatically.
- **Undo history:** snapshot-based (a list of past and future map states with their action labels; unchanged parts are shared in memory), capped at about 200 steps, and **saved with the campaign's autosave** in IndexedDB so the player can step back and forward across sessions. JSON export saves the current campaign only (no history); importing a file starts a fresh history.
- **JSON:** `.2d6map.json` download and import. `schemaVersion` plus a migration chain keeps older files loadable.
- **PNG:** downloaded on desktop, offered through the Web Share API on a tablet where available.
- **Offline:** a service worker caches the app shell.

## 11. Error handling

- **Imports:** validated against a schema. Bad or corrupt files get a clear message ("not a map file" / "made by a newer version") and never replace the open campaign.
- **Rules:** enforced up front. Invalid targets are never highlighted, invalid ghosts are red with a stated reason, and confirm is disabled.
- **Storage:** if IndexedDB is unavailable or over quota, a persistent banner reads "Autosave unavailable: use Save to file", and the app keeps working.
- **Commands:** `core/` validates each command before it applies. A rejected command leaves the model untouched and is logged.

## 12. Testing

- **Vitest (core):** placement, clipping, overlap and butting rules; valid exit squares (boundary excluded); wall derivation; open-exit derivation; A* pathfinding (including secret doors); apply/undo round-trip for every command; compound play-flow command; serialization and migrations.
- **Snapshot tests (render geometry):** computed wall segments, door placements, label anchors. Geometry only, not pixels.
- **Playwright e2e:** new map → entrance → room → exits → label → token move → undo → save/load → PNG export. Run at desktop and tablet viewports, with touch emulation.

## 13. Project layout

```
src/core/            model, commands, rules, geometry, pathfinding, serialize
src/systems/dungeon/ GameSystem definition, Classic theme, door symbols
src/render/          layer renderers, caches, camera transform
src/interaction/     pointer input, camera control, tool state machine
src/ui/              Svelte components
src/persistence/     IndexedDB, JSON import/export, PNG export
tests/               Vitest
e2e/                 Playwright
local-data/          (git-ignored) user-extracted rulebook tables for Part 2+
pdf/                 (git-ignored) purchased rulebooks
reference/           (git-ignored) screenshots of the original tool
```

## 14. Extension points for later parts

- **Dice and tables (Part 2):** `GameSystem` gains `tables` and `dice`. The size and exits dialogs gain 🎲 buttons that fill in values. Table data loads from `local-data/`.
- **Generation (Part 3):** generators emit the same core commands as the UI, so undo, validation and rendering work unchanged.
- **Character sheet (Part 3):** `Campaign.hero`, with its schema defined by the system. A UI panel is added later. `DungeonMap.hero` (name) links to it.
- **Void system:** a new `systems/void/` with its own door types (e.g. airlocks), themes (chamfered hull walls) and entrance rules.
- **Multiple maps:** `Campaign.maps` already supports them, and `stairs.linkedMapId` is reserved.
