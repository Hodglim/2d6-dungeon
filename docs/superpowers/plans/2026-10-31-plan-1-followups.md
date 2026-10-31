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

- **First task: `moveRoom` / `resizeRoom` builders.** `updateRoom` only changes the
  rectangle. Proposed policy (confirm with the user when writing Plan 3):
  - A move translates the room's own perimeter doors, the features inside it and the
    token, as one compound step.
  - A resize deletes doors that no longer sit on the room's perimeter. If that would
    disconnect another room (a door shared with a neighbour), it is rejected with a
    reason instead.
  - A resize that leaves the token or a feature outside the room is rejected with a
    reason.
  - Shrinking a room away from its entry door must not silently make the old door an
    open exit again. Reject it, or require the user to delete the door first.
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
