# 2D6 Map Maker: Locked Doors (Design)

**Date:** 2026-11-06
**Status:** Agreed in conversation. Builder check done (designer's calls marked). Pending user review.
**Builds on:** `master` at `04d2c05`.

All table codes, item names and numbers in this document are made up (`PAT1`, "Lock Pick +2 (3)" is the shape, not a quote).

## 1. Intent

Today the player can leave a room through any exit freely. The rules say that the first time you try to open a door you haven't used before, you roll a D6 to see whether it is locked. The chance depends on the door type. A locked door can then be picked with lock picks, waited at until a patrol comes through it, or left alone.

The app already has most of the pieces: a door can carry a lock (`Door.lock`: locked / opened, plus a lock-quality number), the map draws a padlock and quality number, a locked door blocks the token (`canStep`), the Door editor sets all of this by hand, and exit tables can already mark an exit as locked (`ExitSpec.locked`). What's missing is **the game asking for the lock check on its own and walking the player through what happens next**.

**Success:** tapping a fresh wooden, metal or reinforced exit asks for a D6 before the room roll. An unlocked door carries straight on into the room roll as today. A locked door gets an "L", stops the token, and offers the ways past it, each fully handled: dice, lock pick uses, ration or HP, the patrol fight, and the door opening.

## 2. Goals

1. **Lock check** on the first use of a lockable exit, driven by numbers from the player's table file (§4, §5.1).
2. **Locked-door choices:** Pick the lock, Wait for a patrol, Leave it (§5.2–§5.4).
3. **Lock picks from Small Items:** found by their written form, uses counted down, removed at zero (§5.2).
4. **Waiting ends with the fight:** winning the patrol fight opens the door (§5.3).
5. Every roll goes through the floating dice roller like every other game roll, including "Playing with real dice".

## 3. Non-goals

- **Portcullises and stone slabs.** These are the next piece of work, built on this one's choice panel. Until then, they behave exactly as today.
- **Secret doors are never locked.** No check, ever, whatever their door type.
- Locks on chests, boxes and cells (the "Lock −2" modifiers). Those stay as reference-table text.
- Magical barriers.
- Changing how rooms are rolled or placed once the door is open.

## 4. Table file additions

The thresholds and the patrol table are rulebook content, so they come from the player's table file. Both are **optional**. A file without them still loads.

```json
"doorLocks": { "wooden": 6, "metal": 4, "reinforced": 5 },
```

- `doorLocks` maps a door type to the **lowest D6 roll that locks it** (the numbers above are made up). Door types not listed (archway, curtain, portcullis, stoneSlab) are never checked. Values must be 1–6; anything else is refused at load, naming the field, like other fields.
- Each `dungeonLevels[]` entry gains an optional `"patrolTable": "PAT1"`, a code in `creatureTables`. Load refuses a code that isn't there.
- The blank template (Menu → Download blank table file) gets both, blank (`null` / `""`), and `docs/table-file-format.md` documents them with made-up values.

**No `doorLocks` loaded:** no automatic lock check. Exits behave as today, and the Door editor padlock still works by hand. Exits an exit table marks `locked` still arrive locked (as today) and still get the locked-door choices (§5.2–§5.4), because those don't need `doorLocks`.

**No `patrolTable` for the current level:** Wait for a patrol still works, but the patrol roll is left to the player. The encounter pane opens empty with a hint ("Roll on your level's patrol table") and the Tables pane's creature tables are a tap away.

## 5. Behaviour

### 5.1 The lock check

**When:** the player taps an open exit (the `startExit` and `startGap` play taps) whose door:

- is not secret,
- has a type listed in `doorLocks`,
- has never been checked (see "Checked" below), and
- has no lock yet.

Instead of going straight to the room-size step, the step panel shows **"Check the door"**: the door type, the lock table as three short lines (built from `doorLocks`, e.g. "Metal: locked on 4–6"), and a Roll a D6 request to the floating roller.

**Result:**

- **Unlocked:** the door is marked checked, with nothing drawn (the book doesn't write anything for an unlocked door). The flow carries straight on to the size step for that exit, or the gap step for a gap tap, exactly as if the player had tapped it today.
- **Locked:** the door gets `lock: { locked: true, note: '', quality: null }` (the existing "L"/padlock drawing). The panel switches to the locked-door choices (§5.2).

**Checked:** a door needs to remember that it passed its check, so that it isn't checked again and nothing is drawn. Add an optional `checked?: true` to `Door` (absent on old saves = unchecked), validated in `serialize.ts`. A door with any `lock` (locked or opened) also counts as checked.

**Doors already between two rooms** are never checked. The token moves through them as it does today. (They were "used" when the room beyond was made.)

**One undo step** per roll result. Undo after a lock check puts the door back unchecked and the panel back to idle.

**Exit-table locks:** an exit door the room roll already made locked (`ExitSpec.locked`) skips the D6. Tapping it goes straight to the locked-door choices.

### 5.2 Locked door: the choices

Tapping a locked exit (now, or any time later) shows the **locked-door panel** in the step panel: the door type, its lock quality if known, and three buttons.

**Pick the lock**

- Enabled only when the hero's Small Items contain at least one lock pick. A lock pick is an item whose text matches, case-insensitively, `lock ?pick` followed by a signed bonus and a use count in brackets: "Lock Pick +2 (3)", "lock pick +1(4)", "Lockpick +0 (1)". Anything else is not a lock pick. When disabled, the button's hint says: *Add a lock pick to Small Items, e.g. "Lock Pick +1 (3)"*.
- With more than one lock pick, the player chooses which one to use (a short list showing bonus and uses left).
- **Lock quality:** if the door has no quality yet, first request a 2D6 roll ("Lock quality"). It goes on the door (`lock.quality`), drawn beside the padlock as today. One undo step.
- **Pick roll:** request a 2D6 with modifier = hero Precision + pick bonus (shown in the roller's modifier, editable as usual). The result is compared against the quality: **total ≥ quality** opens the lock.
- Either way, one use comes off that lock pick: "(3)" becomes "(2)". At "(0)" the item is removed from Small Items. All of this in one undo step with the result.
- **Success:** the door becomes `lock.locked = false` (the existing crossed-out drawing) and the flow carries straight on into the size/gap step, as for an unlocked check.
- **Failure:** the lock is damaged. Record it as `lock.note = 'damaged'`. The panel says the lock is damaged and only **Wait for a patrol** and **Leave it** remain. Picking is never offered again for this door ("one roll per lock").

**Wait for a patrol** (§5.3) and **Leave it** (§5.4).

### 5.3 Wait for a patrol

1. **Food:** the panel asks "Eat a ration?" with two buttons:
   - **Eat** (only with rations > 0): rations − 1, HP + 2 × hero level, capped at the hero's HP baseline (same sum as resting on the stairs, without the bandage).
   - **Go hungry:** HP − 2 × hero level (not below 0). *(Designer's call.)* If that takes the hero to 0 HP, **no patrol starts**. The step is food only, the door stays locked, and the existing out-of-fight ("unconscious") death handling applies, not "slain".
2. **The patrol:** in the same undo step, an encounter starts (or the open one is joined, as `startOrJoin` does) with a **pending roll on the level's `patrolTable`** queued (as the "Roll on CODE" buttons do today), and the encounter remembers the door it was waiting at: add optional `waitingDoorId?: string` to `Encounter`.
3. The fight runs as normal.
4. **Winning:** `winFight` opens the door `waitingDoorId` names (`lock.locked = false`, damaged mark cleared), in the same undo step as closing the fight. *(Designer's call.)* When the fight was a wait at a door, the defeated line and the `battles + 1` go to **the room on the near side of that door** (the room the exit belongs to), not the token's room. The token is not moved: tapping an exit doesn't move it today, and committing the next room walks it as usual. The player then taps the now-open exit to carry on, with no further check (it's checked and opened).
5. **Fleeing or dying:** the door stays locked. Any other way the encounter ends without a win leaves the door as it is.

The rule about mindless creatures "smashing" the door doesn't change the outcome (the door is open either way), so the app does nothing special for it.

Waiting is allowed whether or not the lock is damaged.

### 5.4 Leave it

Closes the panel back to idle. The door stays locked, and the player can take another exit. Tapping the door later reopens the locked-door panel with the same state (quality, damaged).

### 5.4a Locked doors between two rooms

*(Designer's call.)* A locked exit the player left alone can later end up between two rooms when a new room is built against it (`applyRoomRoll` keeps the lock on such "far" doors). Today it would then be unreachable except through the Door editor. So, in Play while idle, **tapping any locked door, between rooms or not, opens the locked-door panel** (§5.2) with the same choices. Opening it from either side lets the token pass (`canStep` already only blocks while `locked`). After opening a door between two rooms, the panel just closes; there's no room roll, because there's no exit to build from.

### 5.5 Rolling

Every roll here (lock D6, quality 2D6, pick 2D6) is a request to the floating roller, with a "For" line ("Lock check: metal door", "Lock quality", "Pick the lock"). It works the same as other requests: animated pip dice, or typed values with "Playing with real dice" on. **No Shift** on these rolls: the rulebook only uses Shift Points in combat. The panel shows a waiting card before the roll and a result chip after it, like the other step panels.

### 5.6 Door editor

The Door editor's padlock (none / locked / opened) and quality box keep working as manual overrides. Setting the padlock to "none" also clears `checked`, so the door is fresh again. A damaged lock shows "Lock damaged" under the padlock. Choosing "opened" or "none" clears it.

## 6. Data changes summary

- `Door.checked?: true` (new, optional).
- `DoorLock.note === 'damaged'` marks a failed pick. `note` is otherwise unused by the game, so a fixed value is enough. (Builder may prefer a boolean `damaged?: true` on `DoorLock`. Either is fine if it's validated and old saves load.)
- `Encounter.waitingDoorId?: string` (new, optional).
- Table file: `tables.doorLocks?` and `dungeonLevels[].patrolTable?`.
- No save-format version bump: all fields are optional and absent on old saves.

## 7. Tests (at least)

- Lock check: threshold edges per type from a made-up `doorLocks`, secret doors skipped, archways/curtains/portcullis/slab skipped, checked doors skipped, no-`doorLocks` skip, exit-table locked doors skip to choices, gap tap checked too.
- Lock pick parsing: the accepted forms, rejects ("Lock Pick" with no count, "Lock Box +2 (3)"), count-down and removal at zero.
- Pick: quality rolled only once, ≥ comparison, damaged after failure, picking not offered once damaged.
- Wait: eat vs hungry sums, HP floor, rations, patrol roll queued with the level's code, no-patrol-table hint, `winFight` opens the waiting door in the same undo step, flee leaves it locked.
- Undo of each step restores door, hero and encounter together.
- Serialize: old saves load, bad `checked`/`waitingDoorId` refused.
- Table file: optional fields load, bad thresholds and unknown patrol codes are refused with the field named, blank template includes them.

## 8. Next (separate piece of work)

Portcullises (lever table, patrol, all portcullises in the room open with a lever) and stone slabs (D6 + Discipline ≥ 6 to tip, or certain powerful scrolls / potions, no waiting for patrols) use the same blocked-exit panel with their own choices.
