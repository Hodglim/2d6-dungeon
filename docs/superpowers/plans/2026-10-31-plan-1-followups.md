# Plan 1: Follow-ups for Plans 2–4

Items raised in the Plan 1 reviews that were deliberately not fixed in the core. Each
is assigned to the plan that should deal with it. Where an item says "decide", the
decision is needed before that plan's tasks get written.

## Decided with the user (2026-10-31): do in Plan 2

- **Room entry door: yes.** Add `entryDoorId: string | null` to `Room`, set by
  `createRoomFromExit` from the exit used. No v1 files exist yet, so stay on schema
  version 1 and don't write a migration. Labels prefer a spot next to the entry door, but
  **relocate to wherever the whole text box fits** when it's too long for that spot.
- **Rooms are removed only through Undo (user decision).** There is no delete-room tool:
  - Remove `deleteRoom` from the core.
  - Undo/redo is one timeline for every action.
  - Room numbers stay 1…N because rooms only leave newest-first, so the existing max + 1
    rule is correct. Add a test for it.
- **Undo history is saved with the game (user decision).** Make `History`
  snapshot-based: a list of past and future `{label, map}` entries, capped at 200, with
  `exportState()` / `History.fromState()`. Commands keep `apply`; History stops relying on
  `undo`. Plan 4 saves the history state alongside the campaign in IndexedDB. JSON export
  excludes it.

## Plan 2: Renderer

- Move `exitDirection` and `exitTarget` from `rules.ts` into `query.ts`; the renderer
  needs them to draw exit stubs.
- Split `rules.ts` into `placement.ts` (ghost and evaluation, valid exits, entrance
  squares) and `invariants.ts` (`checkInvariants`, `describeRoom`) before more modules
  import from it.
- Add a `roomDoors(map, roomId)` query.
- Dirty regions: commands share structure (untouched items keep their identity), so the
  renderer can diff the previous and next map by item reference.
- Footprints in `token.trail` can point at squares that are no longer floor after a
  delete or resize. Draw only trail squares that are still on floor.
- API tidy-up: make missing lookup results consistently `undefined` or consistently
  `null` across `query.ts`, `rules.ts` and `geometry.ts`.

## Plan 3: Interaction and UI

- **Rooms can't be moved or resized (user decision, 2026-10-31).** A placed room stays
  exactly as rolled and positioned. Mistakes are fixed with Undo and re-placing. The
  Select tool only inspects and relabels rooms, so no `moveRoom` or `resizeRoom` is needed.
- Add a `canPlaceDoor(map, edge)` query for the Door tool. A valid edge is a wall edge,
  not on the Outer Boundary, with no existing door.
- The exits dialog must filter exits already chosen in this step out of
  `validExitEdges(draft, …)`.
- The size and exits dialogs enforce `roomDieRange` and `maxExits`; the core doesn't.
- Decide whether locked doors block the token. Today only secret doors do.
- No command exists to change the grid size (spec §3). If it's added, it must check that
  every room still fits inside the new boundary.
- After the entrance is deleted the token becomes null; the UI needs a way to place it
  again.
- `History`: skip no-op commands, and expose `undoLabel` / `redoLabel` for tooltips.
- The Svelte store wrapper must call subscribers immediately with the current value,
  which `History.subscribe` does not.

## From the Plan 2 core review (2026-10-31)

- **Plan 3: entry doors can't be removed.** `checkInvariants` rejects any edit that
  removes a room's (or passage's) entry door. The Door tool should hide or disable
  "remove" for entry doors and explain why, offering a retype to secret or locked instead.
  Show `History.execute`'s reason string whenever a command is rejected.
- **Plan 3: everything goes through `History.execute`.** Undo is one saved timeline, so
  token moves, notes and door edits must never change the map outside it.
- **Plan 3: the "only the entrance has a null `entryDoorId`" rule isn't enforced yet.**
  Every play-flow room gets one, but the invariant also accepts null for rooms and passages.
  Tightening it means updating many test fixtures. Do it when Plan 3 touches room creation.
- **Plan 4: saved history size.** JSON loses snapshot sharing. 200 snapshots × ~25 KB
  ≈ 5 MB, so use IndexedDB (not localStorage), and measure. Consider deltas or a smaller
  cap if it's too big.
- **Plan 4: validate a loaded `HistoryState`.** Check `current` and every past and future
  snapshot with the file validator plus `checkInvariants`, check that labels are strings,
  and cap lengths before calling `History.fromState` (which trusts its input). Keep one
  source of truth: the campaign's map is the history's `current`.
- **Plan 4: schema.** `entryDoorId` was added while still on schema version 1. That's
  fine because no real saves exist yet. Bump the version and migrate (including saved
  history snapshots) for any later model change.
- **Plan 3: undo cap.** Beyond 200 steps the oldest undo is silently dropped. Consider
  telling the player.

## From the Plan 2 renderer reviews (2026-10-31)

Plan 3 (interaction) needs these from `MapRenderer`:
- **An overlay hook.** A per-frame, uncached `setOverlay(fn)` in world units, for hover
  highlights, the ghost room, path preview, selection and exit highlighting. It doesn't
  exist yet.
- **A pointer → world square helper** that accounts for the canvas rect and dpr, so tools
  don't each repeat the maths.
- **A separate exit-stub layer.** `fadedExits` depends on the token, so every token move
  currently rebuilds the whole static cache. Move stubs into a cheap per-frame layer.
- **Rebuilds without hitches.** Crossing a zoom bucket rebuilds the cache synchronously, and
  a large map stutters during wheel or pinch zoom. Keep drawing the old cache scaled while
  the new one builds (idle callback or chunks). Rebuild at most once per frame while dragging.
- **Tiled or visible-area rendering** for deep zoom. The cache is capped at 4096 px per side
  and 16M px in area (the iOS limit), so a 100×100 map zoomed far in is blurry.
- **Input:**
  - Pinch zoom with multi-pointer tracking: the viewer currently tracks one pointer.
  - Handle the wheel event's `deltaMode`.
  - Clamp the camera so the map can't be lost off-screen.
  - An animated Fit.
- **Layout:** use a ResizeObserver plus dpr changes (orientation, browser zoom), and re-fit on
  the first non-zero size.
- **Accessibility:** 44 px touch targets (the viewer's buttons are 32 px), `aria-label` on the
  canvas and the toolbar.
- **Shadow gradients** are created per wall edge. That's fine now; group edges by side if
  profiling shows a cost.

- **MapRenderer behaviour tests.** Invalidation and idle-skip, `cancelWalk`, and a walk
  replacing another walk aren't unit-tested yet (only `cacheScaleFor` is). Add tests with a
  fake canvas and rAF when Plan 3 extends the renderer.
- **Label search cost.** The whole-world fallback builds ~166k candidates on a 100×100 map,
  twice when it fails, and labels re-run on every zoom-bucket rebuild. Cache labels per map,
  and reuse the candidate list, if profiling shows a cost. The last-resort fallbacks
  (rock-only, clamped to anchor) have no test yet.
- **Fit limit.** At `MIN_SCALE` 3, maps wider than ~130 squares can't fit a phone view. That's
  fine while `MAX_MAP_SIZE` is 100.

Plan 4 (export):
- PNG export must apply the same canvas size limits (iOS). Tile or downscale very large
  exports, and re-run label placement for each export with the export context.

## Plan 4: Persistence

- `History` holds a single `DungeonMap`. Autosave and JSON export must write
  `history.map` back into `Campaign.maps`.
- `parseCampaign` doesn't check `systemId`, door `type` ids or `campaign.hero`. The
  loader should check `systemId` against the system registry. Decide what an unknown
  door type falls back to (e.g. `archway`).
- `History.subscribe` also fires on `reset`, so skip the autosave triggered by loading.
- An imported file may place the entrance on any edge, not just the system's entrance
  edge. Accepted for v1; revisit when Void arrives.

## Performance notes (no action needed yet)

On a 100×100 map, A* across one open room takes about 57 ms. A worst case of 2,500
one-square passages takes about 325 ms for `findPath` and about 95 ms for
`checkInvariants`. Realistic maps of 30–80 rooms are fast. If it's ever needed, add a
square→room and edge→door index per map snapshot.
