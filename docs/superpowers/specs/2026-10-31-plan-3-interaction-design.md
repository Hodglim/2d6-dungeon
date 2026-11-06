# 2D6 Map Maker: Interaction and UI (Plan 3) Design

**Date:** 2026-10-31
**Status:** Agreed in conversation. Builder check done (answers in §12). Pending user review.
**Builds on:**
- `docs/superpowers/specs/2026-10-31-map-editor-core-design.md` (the Part 1 spec)
- the code on `master`: Plan 1 (game core) and Plan 2 (renderer and demo viewer)
- `docs/superpowers/plans/2026-10-31-plan-1-followups.md` (carried-forward review notes)

**Rules reference:** the user's purchased *2D6 Dungeon Core Rules*, PDF pages 12–18
("Generating Dungeon Rooms" through "Room Creation Quick Reference"), kept in the
git-ignored `pdf/` folder. This document paraphrases only the rules the app enforces. Never
copy rulebook text into the repo.

## 1. Intent

Plan 3 turns the read-only viewer into the tool the user actually plays with: a guided,
rules-aware way to build a *2D6 Dungeon* level room by room at the table, plus the edit
tools needed alongside it. The user plays with the tablet in **landscape on a desk, propped
up or on a stand**, tapping at arm's length. They sometimes roll physical dice and sometimes
want the app to roll.

Success means the user can play a whole level using the app instead of pencil and dot-grid
paper, without fighting the UI, and the app never lets a room be placed against the book's
rules.

## 2. Goals

1. A guided **play flow** that follows the rulebook's room-generation procedure, with every
   roll either **typed in** (physical dice) or **rolled by the app** (user's choice per roll).
2. **Edit tools:** Door (type, secret, padlock lock), Stairs, Note, Select (inspect and
   relabel).
3. **Token:**
   - walks automatically into each newly placed room
   - tapping any floor square sends it there by pathfinding (with Play selected)
4. **Undo/Redo** on one timeline for every action, with the action named on the buttons
   (e.g. "Undo Add Room 3"). It lasts for the session only; saving it is Plan 4.
5. A **coverage badge** (floor area as a share of map area).
6. **Touch-first UI** for landscape tablets: pinch zoom, 44 px+ targets, the map can't be
   lost off-screen.
7. **A new map** dialog.

## 3. Non-goals (later plans)

- **Saving and loading of any kind** (autosave, files, undo surviving a reload), and PNG
  export. These are Plan 4. The user accepts that a refresh loses the map until then.
- **Rulebook tables:** rolling room types, encounters, exit types, unique or boss rooms,
  lock checks. The user types the room type for now. These are Part 2.
- **Multiple levels** and stairs linking maps. Level 2+ starting from stairs in the middle of
  the map comes later.
- Monsters, the character sheet, rules automation (Part 3); the *2D6 Void* system.
- Moving, resizing or deleting placed rooms. **Never** (user decision): fix mistakes with
  Undo and re-place.

## 4. Anti-goals

These would make it a failure even if it technically worked:
- The map's look changing between redraws or visits. Decoration stays seeded.
- Any way for the **play flow** to place rooms or exits against the rules below. The Door
  tool is the user's deliberate manual exception (§6.6).
- Dialogs or panels covering the map while the user positions a room.
- Tap targets too small to hit on a stand (under 44 px).
- Anything changing the map outside `History.execute`, which would break the single undo
  timeline that Plan 4 will save.

## 5. Constraints

- Builds on the existing architecture:
  - `core/` (pure TS, no DOM)
  - `render/`
  - `systems/dungeon`
  - Svelte 5 UI
  - every map change is a `Command` through `History`
  - walls and open exits are derived, not stored
- Current stack: TypeScript 6, Svelte 5.57, Vite 8, Vitest 5, Playwright 1.64.
- iOS canvas limits are already handled by the renderer (cache ≤ 4096 px per side,
  ≤ 16M px in area).
- Keep `src/core` free of DOM, Svelte and render imports.

## 6. Game rules the app enforces (paraphrased from the rulebook)

### 6.1 Room size
- Roll D66: **primary (red) die = width (X)**, **secondary (blue) die = height (Y)**.
- **Doubles, except double 6:** roll both dice again and add primary to X and secondary to
  Y. A second double does *not* trigger a third roll. A double 1 also follows this rule.
- **Corridor:** if the roll contains a 1 and is *not* a double, the space is a **corridor**,
  for example 1×5 or 3×1.
- **Not enough space:** the room is cut down to fit the available space (clipping at the
  Outer Boundary already exists; the same applies against other rooms, see 6.3).
- **Size class after placement**, computed from the final placed rectangle:
  - **corridor:** rolled as a corridor, *or* the placed room ends up 1 square wide in
    either dimension
  - **small:** area ≤ 6 squares (and not a corridor)
  - **large:** area ≥ 32 squares and came from a doubles roll
  - **normal:** otherwise

  The class is shown to the user and stored on the room (Part 2 will use it to pick the
  rooms table).

### 6.2 The entrance
- The **entrance square** sits outside the bottom edge of the Outer Boundary. That's the
  existing `entrance` room kind and the existing `placeEntrance`.
- The **entrance room** is the first room. It is rolled like any room, but **no doubles
  rule** applies, and its area is forced into **6–12 squares**: below 6 is raised to 6,
  above 12 is reduced to 12. *Builder's call: how to reshape (see §11).*
- The entrance room automatically gets **exactly 3 exits, all archways**, and has no
  encounter. The user still positions it.

### 6.3 Positioning (already in the core; restated)
- The user chooses the position: the room touches the chosen exit and slides along it.
- Rooms can't overlap. They may butt up against each other.
- A room reaching the Outer Boundary is clipped, and the boundary becomes its wall.
- **New:** if the rolled room doesn't fit in the space in front of the exit, the user may
  shrink it to fit within the rolled dimensions (the book's "draw the room to fill the
  available space within the dimensions of the roll"). The shrunk size then sets the class.

### 6.4 Exits
- **Number of exits:** roll D6. 1 gives none, 2–3 give 1, 4–5 give 2, 6 gives 3. The
  entrance room is fixed at 3.
- **Placement rules.** An exit is valid only if all of these hold:
  - it is on a wall that doesn't already have an exit (**one exit per wall**, counting the
    entry door)
  - it is not on the wall the room was entered from
  - it is not on the Outer Boundary
  - it would not lead into a space only 1 square deep: the square beyond the exit square
    must be inside the map and not already floor (*user confirmed this reading*)
  - it would not lead into a space 1 square from a wall: the squares on either side of
    the exit square must be inside the map and not already floor (*user confirmed*)
  - it is not already a door
- At most 3 new exits. Exits that can't be placed are dropped, and the user is told how
  many.
- **Placement method**, the user's choice each time:
  - **Tap** valid wall squares on the map.
  - **"Place for me"**, which uses the book's optional clockwise roll. A D6 roll chooses
    the first wall: 1–2 the first wall clockwise from the entrance, 3–4 the second, 5–6 the
    third. Further exits go on the following walls clockwise, skipping invalid walls.
    *Builder's call: which square on a chosen wall (see §11).*
- **Exit type:** all of a room's new exits share one type, chosen from the 7 door types.
  **Small rooms, corridors and the entrance room are forced to archways.**
- **Exit squares:** every exit always gets a 1×1 `passage` beyond it, the book's "exit
  square". (This was optional before. It is now always on, and the option is removed from
  the UI.) The existing rules for the far door still apply: no far door when the passage
  meets the Outer Boundary or a door already exists there.
- **A room in front of another open exit:** if a placed room covers the square in front of
  an existing open exit, that exit simply connects. The existing door now has rooms on both
  sides; no action is needed.

### 6.5 Filling a squeezed gap
The book allows drawing a corridor, without rolling, where a gap is clearly too tight for a
room. Plan 3 adds a **"Fill gap with corridor"** action:
1. Pick an open exit.
2. Drag out a 1-wide corridor running **straight out** from that exit, of any length.
3. It is validated like a room (no overlap, clipped at the boundary).

It gets **no exit square**. If its far end meets existing floor, it **connects automatically**
with an archway (or uses an open exit that's already there). Otherwise it is a dead end until
the user adds a door with the Door tool. It is one undo step.

### 6.6 Doors, locks, secret doors
- Door types: archway, wooden, metal, reinforced, curtain, portcullis, stone slab. They
  already exist, with original symbols.
- **Locks:**
  - drawn as a **padlock icon**, not the book's "L" (user decision)
  - **closed padlock** = locked; **open padlock** = opened
  - optional **quality number** shown beside the padlock (the existing `lock.note` field,
    or a dedicated number field, builder's call)
- **Secret doors:**
  - drawn as a wall with an "s"
  - **one-way**: the token may pass through a secret door only *into* the room whose
    `entryDoorId` is that door, never back. This is derived, so no new data is needed.
- **Secret doors that are nobody's entry door** (e.g. one added between two existing rooms
  with the Door tool) are passable both ways. Only a secret door leading into a room that was
  discovered through it is one-way.
- **Locked doors block the token** (user decision): A* won't pass a door whose padlock is
  closed. Marking it opened clears the way.
- A room's **entry door** can be retyped or made secret, but not removed. (The core already
  rejects removing it. The UI hides "remove" for entry doors and says why.)
- **The Door tool is the manual exception tool** (user decision). It does *not* apply the
  §6.4 exit rules. It refuses only impossible doors: on the Outer Boundary, on an existing
  door, inside a single room, or with no floor on either side. This is what allows the book's
  own exceptions, such as a secret door from a stuck room that has used up its valid walls.
  - A door it adds **facing open space** becomes an open exit with an exit square, like any
    exit.
  - A door it adds **between two existing areas** just connects them, with no exit square.

### 6.7 End of level
The book puts **stairs down** in the last room, usually once roughly 75% of the map is
covered. The Stairs tool and the coverage badge support this. There is no automation.

## 7. Screen layout (user chose layout "A")

Landscape tablet first:

```
┌──────────────────────────────────────────────────────────────────┐
│ ☰  ↶ Undo Add Room 3  ↷   [Play] Door Stairs Note Select   34% │  top toolbar
├───────────────────────────────────────────────┬──────────────────┤
│                                               │  Step panel      │
│                    MAP                         │  (~30% width)    │
│   one finger: pan / tap  ·  two: pinch zoom   │  current step or │
│                                               │  selection info  │
└───────────────────────────────────────────────┴──────────────────┘
```

- **Top toolbar**, left to right:
  - menu (New map, display toggles)
  - **Undo / Redo**, labelled with what they'll do (`History.undoLabel` / `redoLabel`)
    and disabled when unavailable
  - tool buttons: **Play** (default), **Door**, **Stairs**, **Note**, **Select**
  - the coverage badge, at the right end
- **The map** fills the left. One finger pans or taps (the active tool decides), and two
  fingers pinch-zoom and pan. The mouse wheel zooms. The camera is clamped so the map can't
  be lost. Fit is in the menu.
- **The step panel** is on the right and always visible:
  - in the play flow, it shows the current step
  - with Select, the selected room
  - with Door, Stairs or Note, the item being edited
  - when idle, a hint for the tool

  It can collapse to a thin strip. Below roughly 700 px width (a phone, rare) it becomes a
  bottom sheet.
- Every touch target is at least 44×44 px. Text is readable at arm's length.

## 8. The play flow, step by step

| Step | Panel shows | Map shows |
|------|-------------|-----------|
| 0. Start | "Tap a square on the bottom edge to place the entrance" (empty map), or "Tap an open exit" | Valid entrance squares, or the open exits highlighted |
| 1. Size roll | Red and blue dice. **Type** the two values, or **Roll for me**. If doubles (not 6-6, not on the entrance room): "Double! Roll again" asks for a second pair and shows the sum. A corridor result is announced. | — |
| 2. Position | Rolled size (and the final size if clipped or shrunk), class badge (normal, small, large or corridor), **Shrink to fit** if blocked, **Place** | Ghost room against the exit. The ghost follows the mouse, or a one-finger drag, snapping to valid positions and stopping at the nearest valid one; a tap and the arrow buttons also slide it. Rooms are placed exactly as rolled. Red with a reason ("Overlaps Room 3") when invalid. |
| 3. Exit count | D6, typed or **Roll for me**, giving 0–3. Skipped for the entrance room (fixed at 3). | — |
| 4. Exit type | Seven door-type buttons with their symbols. Skipped (archway) for small rooms, corridors and the entrance room. | — |
| 5. Place exits | "Place 2 exits". **Place for me**, which uses the clockwise D6 (typed or rolled), or tap highlighted walls. Shows dropped exits ("1 exit couldn't be placed"). | Valid exit squares highlighted. Each placed exit shows its exit square. |
| 6. Label | Room type (free text), **Unique** toggle, narrative. **Done** or **Skip**. Rooms only; corridors aren't labelled (see §11). | — |
| Commit | The whole room (room, exits, exit squares, label) **and the token's move into it** is committed as **one** undo step, labelled "Add Room N". The path is computed on the draft before commit. The renderer animates the walk, and the model already holds the final token position. If the token can't reach the room (locked or one-way door), it stays where it is and the panel says so. | Room drawn. The token animates in. |

- **Cancel** is available at every step and changes nothing.
- **The entrance:** the entrance square and the entrance room are **one flow and one undo
  step**. Cancel removes both. The entrance room is **Room 1**, with its type defaulting to
  "Entrance Room". If its position leaves fewer than 3 valid walls (e.g. against a side
  boundary), the extra exits are dropped and the user is told, the same rule as any room.
  The user may slide it elsewhere first.
- **Undo or Redo while a draft is open** cancels the draft first, then applies.
- Steps 1–6 are held as draft UI state. Only the final commit goes through `History`.
- "Fill gap with corridor" is a separate small flow from step 0: pick an exit, drag a length,
  then Place.

## 9. Other tools

- **Play (idle):**
  - tap an open exit to start a room
  - tap a floor square to walk the token there (A* pathfinding with one-way secret doors;
    animated; committed through History as "Move token")
  - tap anything else for no action, with a short hint
- **Door:**
  - Tap a door to edit it: type, secret, padlock (none, locked or opened) with an optional
    quality number, and **Remove**, which is hidden for entry doors.
  - Tap a bare wall edge that faces open space to add a new exit (wooden by default;
    supports the book's secret-door-when-stuck rule). It is validated by the core.
- **Stairs:** tap a floor square to add stairs (down by default, up selectable). Tap
  existing stairs to edit or remove them.
- **Note:** tap a floor square to add a note (text). Tap a note to edit or remove it.
- **Select:**
  - tap a room to show its number, type, unique flag and narrative (editable), plus its
    size, class and exit count (read-only)
  - no move, resize or delete

## 10. Architecture additions

**Core (`src/core`)**
- **Room size class** stored on rooms (e.g. `sizeClass: 'normal' | 'small' | 'large' |
  'corridor'`). Exact shape is the builder's call. Extend the file validator. Schema stays
  version 1, since there are no real saves yet.
- **Rolled corridors:** decide whether rolled and gap-fill corridors are `kind: 'room'` with
  `sizeClass: 'corridor'` or a new `kind: 'corridor'` (builder's call, see §11). Either way
  they are not numbered or labelled (see §11), their exits are archways, and exit squares
  stay `kind: 'passage'`.
- **Dice module** (pure, injectable RNG for tests):
  - D6, D66
  - room-size resolution: doubles re-roll, corridor detection, entrance clamp
  - exit count
  - clockwise wall pick
- **Exit rules:** extend the valid-exits query with:
  - one exit per wall
  - not the entry wall
  - the 1-square-deep rule
  - a "place for me" helper that applies the clockwise rule
- **Shrink to fit:** a placement helper that finds the largest rectangle within the rolled
  dimensions that fits in front of the exit at the chosen slide. The builder decides the
  maximisation rule (e.g. maximise area, prefer keeping the width).
- **Pathfinding:**
  - a secret door that is some room's entry door is passable only into that room; other
    secret doors are two-way
  - a door whose lock is closed is impassable
- **Coverage:** floor squares (rooms, corridors, passages; not the entrance square) ÷
  (width × height).
- **Tightening (from the follow-ups):** require `entryDoorId` to be non-null for every room
  except the entrance.

**Renderer (`src/render`)**
- **Overlay hook:** a per-frame, uncached draw callback in world units, for:
  - highlights (valid entrance, exit and wall squares)
  - the ghost room (green or red)
  - selection outlines
  - the gap-fill drag
- **Hit testing:** pointer event → world point → square / edge / door / room, accounting for
  the canvas rect and dpr.
- **Exit stubs in a per-frame layer**, so token moves don't rebuild the static cache.
- **Padlocks:** closed means locked and open means opened, with the quality number drawn
  beside the padlock.
- **Camera:**
  - pinch zoom with multi-pointer tracking
  - clamp the camera to world bounds plus a margin
  - handle the wheel event's `deltaMode`
  - ResizeObserver and dpr changes, re-fitting on the first non-zero size
- **Draw the static cache at most once per frame** while interacting.

**UI (`src/ui`, Svelte 5)**
- A `History` store wrapper that emits the current value immediately on subscribe.
- Components: toolbar, step panel (one sub-component per step), dice entry (type or roll),
  door, stairs and note editors, room inspector, New map dialog, menu.
- **The play flow state machine** lives outside the components, in plain TS (e.g.
  `src/interaction/playflow.ts`), so it can be unit-tested. It drafts each step and emits
  exactly one compound command at commit.
- The demo map and demo viewer from Plan 2 are replaced by the real app. The demo dungeon
  can remain as a "Load demo map" menu item for trying things out (builder's call).

## 11. Builder's calls

These are not discussed with the user; decide sensibly and note each in the plan.
- **Entrance clamp reshaping.** Raise or reduce one dimension until the area is within
  6–12, e.g. shrink the larger side first when over 12 and grow the smaller side first when
  under 6, clamped to what fits. (The book's own example isn't conclusive; see §12.)
- **Which square on a wall** "Place for me" uses: the middle-most valid square.
- **Corridor numbering and labels:** corridors (rolled or gap-fill) get **no number and no
  label**. This was a guess the user didn't correct.
- **Coverage:** passages and corridors count as covered; the entrance square doesn't.
- **Representation:** of rolled corridors (`kind` vs `sizeClass`) and of the lock quality
  number.
- **Shrink-to-fit maximisation rule.**
- **Whether the demo map stays** as a menu item.
- **Exact visual styling** of the toolbar and panel. Plain, readable and high-contrast,
  consistent with the inked map style.

## 12. Builder-check questions and answers

**User decisions:**
- **The Door tool doesn't follow the exit rules.** It is the manual exception tool and
  refuses only impossible doors (§6.6).
- **Locked doors block the token** until marked opened (§6.6).

**Settled as builder's calls** (from the rulebook or conversation, flagged for the user to
check):
- **The token's walk into a new room** is part of that room's single undo step. If the room
  is unreachable, the token stays put (§8).
- **The entrance square and the entrance room** are one undo step. The entrance room is
  Room 1, typed "Entrance Room". Exits it can't place are dropped with a message (§8).
- **Gap-fill corridors** run straight from the exit, have no exit square, and auto-connect at
  the far end (§6.5).
- **Room-to-room doors** are allowed with the Door tool. A secret one that isn't an entry door
  is two-way (§6.6).

## 13. Testing

- **Unit (Vitest):**
  - the dice module, with seeded rolls covering doubles, corridors and the entrance clamp
  - exit rules: one per wall, entry wall, boundary, the 1-square-deep rule, clockwise
    placement
  - shrink to fit and size classes
  - one-way secret-door pathfinding, and coverage
  - the play-flow state machine: every step, cancel, and commit producing one undo step
  - renderer hit testing and camera clamping
- **Visual checks:** Playwright screenshots of each play-flow step and the tools, at a
  tablet landscape viewport (e.g. 1180×820 at dpr 2) with touch emulation. Full e2e suites
  stay in Plan 4.
