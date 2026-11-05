# 2D6 Map Maker: One Dice Roller (Design)

**Date:** 2026-11-05
**Status:** Agreed in conversation. Builder check done (§9). Pending user review.
**Builds on:** `master` at `38922bb` (encounters, table reference, throwing weapons and potion bombs).

All table codes and creature names in this document are made up (`XX1`, Grumbler).

## 1. Intent

Dice are rolled in four different ways today:

1. **The floating dice roller** (`DicePanel`): free rolls with die chips (D6, 2D6, D66, D3) and a five-line history. "Roll a D6" text buttons (`RefText`, `EncounterText` via `diceContext`) and manoeuvre damage buttons send rolls to it.
2. **Inline "type or roll" boxes** (`DiceEntry`) in nine places: exit count (`ExitCountStep`), room size (`SizeStep`), exit placement (`ExitsStep`), the room table and the exit table (`LabelStep`), the inspector's re-roll (`RoomRoll`, twice), a reference table (`TableView`, which also has its own modifier box), a pending creature-table roll (`PendingRoll`) and the attack dice (`TurnDice`).
3. **The attack dice** become a ▲▼ shifter inside the encounter pane (`TurnDice`).
4. **Throws** (`throwWeapon`, `throwBomb` in `encounterActions.ts`) and the after-fight recovery roll roll with no dice shown at all.

So the same action looks different depending on where the player is, and the player can't tell which dice to use. A reference table, for example, shows its own dice box *and* a "Roll a D6" button that opens the floating roller without the table's modifier.

**The fix, as one rule:** *Roll buttons stay where you need them. Every one sends its job to the floating roller. The dice always appear in the floating roller, and the answer always shows back where you pressed the button.*

**Success:** a player who has learned to roll once knows how to roll everywhere. When a reference table is open, a roll highlights its row. When an attack is rolled, the player shifts the dice in the roller and watches the matching manoeuvre light up in the encounter pane. Nobody types dice into a box in a side panel any more.

## 2. Goals

1. The floating roller is **the only place dice are shown rolling, and the only place dice values are typed in**.
2. The roller always shows **what the next roll is for** (the "For" line, §5.1).
3. **Requests:** any part of the app can ask the roller for a roll the game needs. The answer goes back to it and is applied exactly as today (§5.2).
4. **Watchers:** parts of the app that can show a roll's meaning (an open reference table, the encounter pane's manoeuvre and Interrupt lists) highlight the matching row for any roll of the right dice, free rolls included (§5.3).
5. **A modifier in the roller**, filled in by whatever asked and editable (§5.4). It replaces `TableView`'s modifier box.
6. **Typing physical dice** moves into the roller (§5.5).
7. **Shifting the attack dice** happens in the roller, while the encounter pane keeps showing what the shifted dice mean (§5.6).
8. **Panels show results, not dice.** Where a `DiceEntry` was, there's a small "waiting" card with a Roll button before the roll and a result chip after it (§6).
9. The roller's **history says what each roll was for** (§5.7).

## 3. Non-goals

- Changing any rule, table lookup, re-roll rule or what a roll does to the game. `PlayFlow`'s `enter…`/`roll…`/`apply…` methods, `rollReference`, `resolveRoll`, `shiftDie`, `throwDamage` and the rest keep their meaning; only where the dice are shown changes.
- Putting free rolls on the History or in the save. A free roll still never touches the game.
- Dice-display-only pictures: `DieFace`, `DiceSet` and `DicePair` in the hero sheet, wizard, manoeuvre tables and result chips stay. They show dice; they don't roll them.
- New dice kinds beyond today's (D6, 2D6, D66, D3, 2D3, 3D3, 3D6).
- Sound or animation changes, other than the roller's animation now covering every roll.

## 4. Anti-goals

- **No hidden rolls that change the game.** After this change, every roll that changes the game is shown in the roller (throws and recovery included).
- **No lost typing.** A player who uses real dice can enter every roll the game needs, just as they can today.
- **No guessing which roll is meant.** If the roller isn't sure what a roll is for, the For line says "Free roll", and a free roll changes nothing.
- **No extra taps for the common case.** Pressing a Roll button in a panel rolls straight away. It doesn't open the roller and then wait for a second press.
- **No rulebook content** in tracked files (as always).

## 5. The roller

### 5.1 The For line

A line under the roller's title says what the next roll is for:

- "Free roll" when nothing is targeted.
- A request's label: "Room size · D66", "Exits · D6", "Room table · 2D6", "XX1 Practice Crate −1", "Your attack · Shift 3", "Grumbler bites · D6 +2", "Throw Dagger at Grumbler · 2D6".
- A watcher's label when no request is targeted: "XX1 Practice Crate" (an open table).

The line has a × that turns the roller back to a free roll. The request itself stays waiting in its panel, and its card's Roll button points the roller at it again.

When a request or watcher is targeted, the die chips show its dice and are **locked**: other chips are disabled, so a request always gets the dice it needs. A free roll unlocks them.

### 5.2 Requests (rolls the game is waiting for)

A request is a job handed to the roller. It has:

- `id`: stable while the request exists (the panel that asks owns it).
- `label`: the For line text.
- `dice`: the `DiceKind`.
- `modifier` (optional): the starting modifier; whether the player may change it (`modifierEditable`, default true when a modifier applies).
- **The same three hooks `DiceEntry` takes today**, so typed and rolled dice keep their separate paths unchanged:
  - `roll()` (optional): returns the final faces. Askers whose dice come from game logic pass their existing roll function (for example `flow.rollRoomTable()`, which re-rolls unique rooms and counts the re-rolls). Without it, the roller uses `rollDice`. The roller animates to these faces.
  - `rolled(faces, modifier)`: called once the animation settles. It is today's `onrolled` (for example `flow.applyRoomTableResult`).
  - `enter(values, modifier)`: called with the typed strings. It is today's `onenter` (for example `flow.enterRoomTable`), so typed rolls validate in the same place and get no unique-room re-roll, as now.
- `error`: the error the asker shows today (`step.error`, the table lookup error, "Type a number from 1 to 6 on each die."). Errors stay owned by the asker. The roller shows the targeted request's error under its dice, and the waiting card shows it too.
- `shift` (optional): attack dice only, see §5.6.

**The rolls that become requests:**

| Today | Request | Dice |
|---|---|---|
| `ExitCountStep` | Exits | D6 |
| `SizeStep` | Room size | D66 (red width, blue height) |
| `ExitsStep` | Exit placement | D6 |
| `LabelStep` room table | Room table | 2D6 or D66 |
| `LabelStep` exit table | Exit type | D66 |
| `RoomRoll` (inspector), room and exit | Room table / Exit type | as above |
| `TableView` | the table | its dice, with its modifier |
| `PendingRoll` | Roll on a creature table | D6 with its modifier |
| `TurnDice` | Your attack / Grumbler's attack | 2D6 with shift |
| Manoeuvre damage button (hero's hit or a creature's hit) | Damage (one-shot, see below) | the parsed damage dice and modifier |
| `ThrowPanel` weapon throw | Throw | 2D6 (D66 against Interrupts, as now) |
| `ThrowPanel` bomb with damage | Bomb damage | its damage dice |
| `VictoryPanel` thrown-weapon recovery | Get back the Dagger | D6 |

The free "Roll a D6" text buttons (`RefText`, `EncounterText` `dice` phrases) are **not** requests: they make the roller do a free roll of that die (as now), and any watcher whose dice match highlights its row.

**Damage requests are one-shot.** Today a damage button only rolls in the roller and changes nothing, because HP is tracked by hand. That stays the same: the damage request's `rolled`/`enter` do nothing to the game and the request is removed once the roll lands. The total shows in the roller, and a small note beside the button ("Rolled 4 damage") stays until the next roll or the turn changes. No HP is taken off automatically (that would be a rule change, §3). After a damage roll, the roller goes back to the attack request if it is still live.

**With "Enter my roll" on (§5.5), a panel's Roll button doesn't roll.** It targets the request and opens the roller ready for typing (the button reads "🎲 Enter in roller"). This applies to every request, throws, recovery and damage included. A throw is then committed when its typed dice are entered.

**Throws change slightly.** Today, pressing a throw button rolls and applies the throw in one step. After this change, pressing it makes a request and rolls straight away in the roller (the "no extra taps" anti-goal), and the throw is committed when the dice settle, still as one History step. A typed roll commits it the same way. A bomb with no damage dice has no roll and commits straight away, as now.

**Which request is targeted:**

- Pressing a panel's Roll button **targets that request and rolls at once**. If the roller is closed, it opens.
- A request that appears while the roller has nothing targeted (or only a watcher) becomes the target without rolling, so the roller's big Roll button is ready for it.
- A request that appears while another request is targeted doesn't take over. Its own card's Roll button targets it.
- When the targeted request goes away (accepted, the step changes, the panel closes, the fight ends), the roller falls back to the newest remaining request, then to a watcher, then to a free roll.

The shell keeps the set of live requests. Each panel registers its request while its waiting card is on screen and removes it when it isn't (Svelte effect with cleanup). Two waiting cards at once is normal: a pending creature-table roll and the attack dice, for example.

### 5.3 Watchers (things on screen that can show a roll's meaning)

A watcher is something on screen that can highlight a row for a roll but doesn't need one. It has an `id`, `label`, `dice`, and `show(faces, modifier)` / `clear()`.

- **An open reference table** (`TableView`) is a watcher whenever it's the Tables tab in front. A roll whose dice match the table's dice highlights the row (through `rollReference`, with the Modified Ranges Rule) and shows the result block under the table, as today. When the table comes to the front with no request targeted, the roller targets it, picks its dice and takes its modifier (from "Open XX1 −1").
  - A rollable reference table is **both**: its card's Roll button makes a request (so the result shows even if the roller was on a free roll), and while it is in front it also watches free rolls of the same dice. The builder may merge these into one object.
- **The encounter pane's lists** (a creature's manoeuvres and Interrupts, the hero's manoeuvres and armour) show the attack's shifted faces (§5.6), exactly as they show `turnDice` today.

**Which rolls reach watchers:** only free rolls and the watcher's own request. A roll made for some other request (a throw's 2D6, a creature-table D6, a room-table 2D6) never highlights a reference table or the encounter lists.

**The encounter lists watch only the attack request.** A free 2D6 doesn't light up manoeuvres, Interrupts, Hit tags, armour marks or damage buttons, because these mean "this attack" and would offer a damage roll with no attack behind it. In practice the attack request is live and targeted for the whole turn, so a 2D6 rolled during a turn is the attack anyway. (So, in the list above, the encounter lists are fed by the attack request, not by free rolls.)

Several watchers can match one roll (a table and the encounter lists). All of them highlight. The For line names the targeted one, or the front sidebar tab's watcher when nothing is targeted.

### 5.4 The modifier

A "− [n] +" row under the chips, as `TableView`'s is today (buttons, or typing a whole number with either minus sign, reformatted on blur).

- It's filled in from the target: the reference table's modifier, the creature-table roll's modifier, or the damage modifier.
- It stays the same for re-rolls of the same target. It resets to the new target's modifier (or 0) when the target changes, and to 0 when a different chip is chosen on a free roll (as now).
- It's hidden for D66 and for requests with no modifier (room size, exits, room and exit tables, attack dice, throws, recovery).
- A free-roll modifier keeps today's damage rules (`rollTotal`: never below 0, a 6 does at least 1). A request's modifier is passed to `accept`, and the asker uses its own rule (the Modified Ranges Rule for reference tables, `resolveRoll` for creature tables).

### 5.5 Typing physical dice

The roller has an **"Enter my roll"** toggle next to the Roll button. When it's on, the die faces become number boxes (red and blue for two-dice rolls, one box for a single die, as many as the dice kind needs), with a "Use these" button. Typing a digit in a box moves to the next box, as `DiceEntry` does today. Typed values go through the request's `validate`, then `accept`, exactly as a typed `DiceEntry` value does today. On a free roll, typed dice just show their total and history line.

The toggle is remembered in the roller's preferences (`DicePrefs`) so a real-dice player sets it once.

### 5.6 Shifting the attack dice

The attack request carries a shift handle: the pool (as computed now by `heroPool`/`foePool`), whether the creature's Shift is unknown, and a link to the encounter pane's `DiceState`.

- After the 2D6 lands (rolled or typed), the roller's two dice get ▲ and ▼ buttons, with tap-to-raise and right-click-to-lower on the dice as now, and a "Shift left: 2 of 3" line, the natural roll ("Rolled 3-5") once shifted, and the "A natural double can't be shifted" and "SH unknown" notes. Moves use `shiftDie` unchanged.
- **The `DiceState` stays owned by the encounter pane**, as now, so moving to the next turn still drops it. The roller reads it and sends changes back through the request (`onchange`).
- **The encounter pane** keeps showing what the dice mean: the matching manoeuvre and Interrupt rows highlight live as the dice move, and the Exact Strike / Prime / Miss / Mishap note, the Hit tags and the damage buttons stay in the pane. In the pane's attack section, `TurnDice`'s dice and shifter are replaced by a small copy of the current faces (`DieFace` ×2, not clickable) and "Shift in the dice roller", or by the waiting card before the roll.
- "Roll again" moves to the roller (it drops the `DiceState` through the request, as the current button does). The attack request stays targeted until the turn moves on.

### 5.7 History

Each history line starts with what the roll was for: "XX1 −1: 4 − 1 = 3", "Room size: 3, 4", "Your attack: 2 + 5 (shifted to 3, 5)", "Free D6: 4". It's still the last five rolls, kept in memory only, and never saved.

### 5.8 Layout and opening

- The roller stays a floating panel in the map's top-right corner (as now), 248px wide on desktop.
- **On a phone** (under 700px wide), the panel/sidebar sits below the map and the roller floats over the map. The roller must not cover more than about half the map area when the side panel is open. Collapse the history to the newest line and keep the chips, modifier and dice in a tight block. The builder checks this with screenshots at 390×844.
- Any request's Roll button opens the roller if it is closed. Closing the roller doesn't drop any request; the waiting cards stay, and their buttons reopen it.
- The roller is still hidden before the game starts, after a load error and on game over. A request made while it is hidden (none should be) is ignored.

## 6. What the panels show

Every `DiceEntry` use is replaced by one shared component, called **`RollCard`** here (the name is the builder's call). It has two states:

- **Waiting:** the request's label and dice ("Room size · D66") and a **🎲 Roll** button (rolls in the roller at once, §5.2). It shows a "In the dice roller" hint while it's the roller's target, and any error from `accept`/`validate`.
- **Result:** shown by the panel's own existing result display (the room-table result block, the size preview, the reference table's highlighted row and result, the pending roll's resolved entry). `RollCard` adds nothing here except, where the panel offered one today, its "Roll again" button.

Panels keep their existing Skip, Done and × buttons around the card.

`DiceEntry` is deleted once nothing uses it.

## 7. Where the code changes (a guide, not a plan)

- `src/ui/diceRoller.ts`: request and watcher types, and the For-line and history labels. Pure parts get unit tests.
- A new shell-level store (or context) holding the live requests, the watchers, the target, and the "roll now" trigger. It replaces `diceContext`'s single `DiceRollFn` with a richer one; the free `ondice` path stays for text buttons.
- `DicePanel.svelte`: the For line, locked chips, modifier row, Enter-my-roll, the shift controls, labelled history, and the phone layout.
- Each asker in the table in §5.2 swaps its `DiceEntry` (or silent roll) for a `RollCard` and a request.
- `TableView.svelte`: loses its dice box and modifier box, registers its request and watcher, and keeps its highlight and result block.
- `TurnDice.svelte`: becomes the waiting card plus the small face copy. The shifter moves to the roller.
- `encounterActions.ts`: `throwWeapon`/`throwBomb` take the rolled faces (instead of an `rng`) so the roller supplies them. Their tests change to pass faces.
- Unit tests for the pure parts. The existing UI tests that type into `DiceEntry` or press its "Roll for me" move to the roller's controls. The e2e and visual scripts are updated to match.

## 8. Left to the builder

- Component and store names, and exactly how requests are registered and cleaned up.
- How the roller's chip lock looks, and the exact For-line wording beyond the examples.
- Whether a reference table's request and watcher are one object.
- The phone layout details, within §5.8.
- The order of the work. A sensible order: roller core (For line, modifier, typing, history), then reference tables (the user's first complaint), then the map-building steps, then encounters (pending rolls, damage), then attack shifting, then throws and recovery.

## 9. Builder check

A fresh reader planned from this document and asked five questions. The answers are now in the text above. All five were settled as the designer's call, in keeping with the agreed rule and the non-goals:

1. **Damage rolls:** one-shot requests that change nothing, with a small note beside the button (§5.2).
2. **Enter my roll and panel buttons:** with the toggle on, a Roll button targets the roller for typing instead of rolling (§5.2).
3. **Which rolls reach watchers:** free rolls and the watcher's own request only (§5.3).
4. **Free 2D6 rolls and the encounter pane:** they don't highlight anything there; only the attack request does (§5.3).
5. **Typed and rolled dice:** requests keep `DiceEntry`'s separate `roll`/`rolled`/`enter` hooks, and errors stay with the asker, so no `PlayFlow` method changes (§5.2).
