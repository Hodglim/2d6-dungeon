# Plan 1: Follow-ups for Plans 2–4

Items raised in the Plan 1 reviews that were deliberately not fixed in the core. Each
is assigned to the plan that should deal with it. Where an item says "decide", the
decision is needed before that plan's tasks get written.

## Decide before writing Plan 2 (schema-affecting)

- **Room entry door.** Spec §9 anchors each room's label near "the room's entry door",
  but rooms don't record which door they were entered from, and the order of the doors
  array is not a reliable source. Recommendation: add `entryDoorId: string | null` to
  `Room` (set by `createRoomFromExit`, which knows the exit used), bump the schema while
  no v1 files exist yet, and add a migration test.
- **Room numbering.** `nextRoomNumber` returns max + 1, so deleting the highest-numbered
  room and adding a new one reuses its number. The spec says numbers are "assigned in
  creation order". Either store a `nextRoomNumber` counter on `DungeonMap`, which is a
  schema change and pairs naturally with the item above, or accept reuse and update the
  spec.

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
- Remove `removeRoom` from the public exports, or rename it, so the UI uses `deleteRoom`.

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
