# 2D6 Map Maker: Encounters and Combat Tracking (Design)

**Date:** 2026-11-02
**Status:** Agreed in conversation. Builder check done. Pending user review.
**Builds on:** `master` after Plan 6 and the blank table-file template (570 tests).

**Rulebook references** (the user's own PDFs, in git-ignored `pdf/`; never copy their content into tracked files):
- **Core Rules p. 24:** the Fatigue Die; Mishap and Prime attack rolls.
- **Core Rules p. 25:** Combat Round 7 Onwards (movement Interrupts stop counting).
- **Core Rules p. 26:** Multiple Creatures; Fearful Momentum; Winning Combat.
- **Core Rules p. 28:** Treasure and Experience.
- **Core Rules p. 31:** Modifiers ("apply this to your roll for that table").
- **Codex p. 33:** the list of Level 1 & 2 tables. **Codex p. 38:** Level 1 creature tables (eleven D6 tables, one per creature type). **Codex p. 39:** Level 2 ones.
- **Codex creature card pages** (from about p. 100): each card shows name, level, HP, XP, SH, Treasure, Interrupts, two Manoeuvres, Mishap and Prime results.

## 1. Intent

The next engine step. When a room's encounter calls for a fight, the player rolls in the app, sees the creature card(s), and fights with the help of the encounter pane: a dice roller, HP trackers for the hero and every creature, and the Fatigue Die and round count. The fight ends with a confirmed win (treasure reminder and XP) or a confirmed death (Game Over).

The player still plays the combat itself (matching manoeuvres, shifting dice, Interrupts, armour) from the book and their sheet. The app tracks the numbers that change during a fight, and rolls the dice.

**Success:** the user plays a Level 1 room such as "Roll on XX1 −1", taps the roll, sees the right card with its HP filled in, fights with the dice roller, tracks HP, fatigue and rounds in the pane, and finishes with either the win reminders (treasure line, XP added) or Game Over.

## 2. Goals

1. The table file gains **creature tables** (per code, D6) and **creature stats** (HP, XP, SH, Treasure per creature). The user's own data is transcribed from their Codex; the format doc, the fixture and the blank template use made-up examples only.
2. A room's encounter text shows **action buttons** for the parts the app recognises: creature-table rolls with modifiers, and named creatures. Everything else stays as text for the player to read.
3. The **encounter pane** in the sidebar holds the encounter: creature cards, HP trackers, the hero's HP, a dice roller, the Fatigue Die and the round count.
4. **Multiple creatures** fight at once (Core Rules p. 26): one tracker per creature, the player chooses the order.
5. The **Fatigue Die**, **round 7 reminder** and **Fearful Momentum** are tracked and shown.
6. **Winning:** when all creatures are at 0 HP, confirm the win; then show each creature's Treasure line as a reminder and offer to add the XP to the hero.
7. **Dying:** whenever the hero reaches 0 HP, in or out of a fight, confirm the death; then a **Game Over** screen ends the game, with Export game and New game.
8. The existing manual way in (Encounter button → search the card pack) still works and uses the same pane.

## 3. Non-goals

- Automating combat: matching manoeuvres, shifting, Exact Strikes, Interrupts, armour deflection, damage calculation. The player does these and taps the HP.
- Treasure, loot and other non-creature tables (chests, pouches, events and so on). Their names stay as text; the win step only reminds.
- Parsing the whole encounter sentence. "Roll a D6. 1-3= …" gates, "twice", "and then", "use GRUMBLER stats" are read by the player; the dice roller covers the gate rolls.
- The optional Outnumbered and Armour Checks rules (p. 32).
- Magic, potion bombs, throwing weapons.

## 4. Anti-goals

- **No rulebook content** in `src/`, `tests/`, `docs/`, `dist/` or git history. Fixtures and examples are invented. `scripts/check-dist.mjs` must keep passing.
- **No silent loss:** an encounter in progress survives closing the app; Game Over never deletes the save until the player starts a new game, and Export game still works from the Game Over screen.
- **No forced death or win:** reaching 0 HP only asks. Cancelling leaves HP at 0 and the fight open, so the player can correct a mistyped number.
- **The map keeps working with no table file, no card pack, or no hero.** Missing data degrades: no buttons, a creature without stats asks for its HP, no hero means no hero tracker and no Game Over.
- **A card pack is not required for a fight** (**builder's call**). The buttons need only the table file. Without a pack, or for a creature with no matching card, the pane shows the creature's name and stats with no image. The Encounter toolbar button opens the pane without a pack too; only its card search needs the pack. Removing the pack mid-fight only removes the images.

## 5. Constraints

- Stack, layering and dependency pinning as before. `src/core` stays pure; table lookups, the encounter-text scanner and the combat-tracking rules live in `src/systems/dungeon`.
- **History:** every game-state change goes through `History.execute`, so HP changes, next round, adding a creature, win and death are undoable like map changes. Hero HP changes during a fight are hero changes (the sheet shows them).
- **Saves:** the encounter in progress is part of the saved game. Bump the save format and schema versions together if the saved shape changes. No backwards compatibility is needed (user decision, 2026-11-01).
- **Device:** iPad landscape, touch targets of at least 44 px. HP controls must be quick to tap many times.
- The existing dice look (pip dice with roll animation and sound) is reused.

## 6. Table file additions

Both keys are optional; a file without them still loads (the buttons then do nothing more than show the name).

### creatureTables

Keyed by table code (`"XX1"`). Each is a D6 table with keys `"1"` to `"6"`. Each entry is one of:
- `{ "creatures": ["Guard"] }`: one creature.
- `{ "creatures": ["Grumbler", "Moss Lurker"] }`: several, fought together (the book prints "GRUMBLER AND MOSS LURKER").
- `{ "text": "…" }`: a described outcome (as in a table of described encounters). Shown as text; if it names a creature in capitals, that name becomes a "Fight …" button (see §7).

Each creature name must exist in `creatures` (below); the validator names the place if not.

### creatures

Keyed by creature name as printed (`"Guard"`), matched to the card pack's card name case-insensitively. Each entry: `level` (whole number 1–10), `hp`, `xp`, `shift` (whole numbers, shift may be negative), `treasure` (free text, `""` for none).

### Template and docs

`blankTableFile()` gains `creatureTables` (one blank code with keys 1–6) and `creatures` (one blank row). `docs/table-file-format.md` documents both with made-up examples, and the book pages.

### The user's own data (local only, like Plan 6 Task 7)

A subagent with explicit permission reads the Codex and writes `local-data/dungeon-tables.json`: Level 1 creature tables (p. 38), and stats for every card in the user's 90-card pack (HP, XP, SH, Treasure, read from the card images). Report hard-to-read values. Nothing from it is committed.

## 7. Encounter text → buttons

A scanner in `src/systems/dungeon` turns the room's encounter text into the text plus a list of actions. It recognises:

- **Creature-table rolls:** a code present in the loaded `creatureTables`, optionally followed by a modifier, with or without a space ("XX1 -1", "XX2-1", "XX1+1", "XX1"). Unknown codes (LOOT9 …) are not actions.
- **Named creatures:** a run of words in capitals that matches a name in `creatures` ("GRUMBLER", "MOSS LURKER", and "GRUMBLER" in "use GRUMBLER stats").

The room's Room step result and the room inspector both show the encounter text with these as buttons: **Roll on XX1 −1** and **Fight Grumbler**. Repeated phrases ("twice") are not understood; the player taps the button again.

**Rolling on a creature table:** a D6 with the dice animation (or typed in, as elsewhere), plus the modifier. A result below 1 counts as 1, above 6 as 6 (**builder's call**: the book doesn't say; noted for the user). The result is shown ("4 − 1 = 3: Guard"); its creatures join the encounter. A `text` result is shown for the player to read, with any "Fight …" buttons.

Tapping a button opens the encounter pane if it isn't open. Creatures added to an open encounter join it (so "Roll on XX2 −1 and XX3 −1" gives two creatures in one fight).

## 8. The encounter pane

Lives in the sidebar where the existing creature card pane is. Top to bottom (layout is the builder's, within these contents):

- **Creatures:** for each one, its card image (tap for full screen, as now), name, and an **HP tracker** starting at its `hp`: big − and + buttons, the number tappable to type a value. Its **Shift** shown with the fatigue bonus ("SH 2 (+1)"). XP and Treasure shown small. At 0 HP it is shown as defeated but stays listed. A creature with no stats in the table file asks for its starting HP when added; XP/Shift/Treasure then show as unknown.
- **Hero** (only if the game has a hero): HP tracker (same controls, changes the hero's HP), Shift with the fatigue bonus and the Fearful Momentum bonus.
- **Round and Fatigue Die:** "Round 3", the Fatigue Die face, and **Next round**. The fatigue Shift bonus: die 1–3: +0, 4: +1, 5: +2, 6: +3, and it stays at 6 (+3) until the fight ends. The die starts at 1 in round 1 and goes up by one per Next round.
- **Round 7 reminder:** from round 7, a short line that creature Interrupts involving movement no longer count (wording is the app's own, not the book's).
- **Fearful Momentum:** if the fight has two or more creatures and one reaches 0 HP during round 1, the hero gets +2 Shift for round 2 only, shown on the hero's Shift.
- **Dice roller:** the encounter roll first, then stays for attack rolls. Roll two dice (primary red, secondary blue) by default, with a one-die option; animated, also typed in. Doubles 1-1 and 6-6 are flagged ("Mishap"/"Prime" for creatures, "Miss"/"Prime" for the hero, as the player chooses who is rolling: **builder's call** on how).
- **Add creature:** the existing card search, to add a creature by hand.
- **End encounter:** closes the fight without win or death (for fleeing or a mistake), after a confirm if any creature is still standing.

## 9. Endings

- **Win:** when the last creature reaches 0 HP, ask "All creatures defeated: win the fight?" Confirm shows a **Victory** panel: each creature's Treasure line ("Guard: Roll on …") as a reminder, the XP total with **Add N XP** (one undoable hero change), and **Done**, which ends the encounter. Cancel leaves the fight open.
- **Death, from any cause (user decision):** whenever the hero's HP reaches 0 or below, whatever caused it (the encounter pane, the sheet's HP controls, resting on the stairs without food, or any later hero change), ask "Your hero has fallen: confirm their death?" Cancel leaves everything as it is, HP at 0 (and the fight open, if there is one); the question comes back the next time a change leaves HP at 0 or below. Confirm ends the game: a **Game Over** screen covers the app, showing the hero's name and level, with **Export game** and **New game**. The game is marked over in the save, so reopening the app shows Game Over again. Undo is not available from Game Over (**builder's call**: death is final, matching the book).

## 10. Left to the builder

- **An open fight blocks going down a level** (**builder's call**): while an encounter is open, "Go down to Level N" is disabled with a short note to finish or end the encounter first. So `history.reset` never has to carry a fight across levels.

- Data shapes inside the save and history for the encounter, as long as §5 holds.
- Pane layout and visual design within the existing style.
- How the scanner tokenises text, within §7's examples (all Level 1 encounter texts in the user's file are the acceptance set, checked locally).
- Splitting the work into tasks and the order.

## 11. Addendum (2026-11-04): turns, manoeuvres and shifting the dice

Agreed with the user after play-testing. Core Rules pp. 22–24 are the reference.

- **Turn order.** A fight starts on the hero's turn (the hero has the initiative), shown clearly ("Your turn"). After the hero's attack, each creature still standing takes a turn in list order ("Grumbler's turn"); then the round ends automatically (round and Fatigue Die go up) and it is the hero's turn again. A **Next turn** button moves play on and replaces the old Next round button. The current turn is part of the saved, undoable encounter. Defeated creatures are skipped; if none remain, or the hero is at 0 HP, the win/death questions take over as before. With no hero, the "hero" turn is still the player's attack, with no manoeuvres and no shift pool.
- **Hero manoeuvres** are listed under the hero's HP/Shift in the pane. After a roll, a manoeuvre whose dice match the dice (red = primary = first die, blue = secondary = second) is highlighted.
- **Shifting.** Each attack gets a Shift pool: for the hero, base Shift + fatigue bonus + Fearful Momentum (round 2 only); for a creature, its SH + fatigue bonus (unknown SH → no pool). The pool refills every turn. One point moves one die up or down by 1, never above 6 or below 1 (which also enforces the book's "no 1↔6"). Controls: ▲ and ▼ buttons above and below each die (touch), and with a mouse, left-click a die = up, right-click = down. "Shift left: n of m" is shown. Undoing a shift step on a die refunds the point.
- **Special rolls.** Hero: a match with no shift spent is an **Exact Strike** (note: add your Shift to the damage); a natural double 1 always misses (shifting disabled); a natural double 6 is a **Prime Attack** (pick any manoeuvre, add your Shift to the damage) and can't be reached by shifting. Creature: natural double 1 = Mishap, double 6 = Prime, both "see the bottom of its card"; no shifting on those.
- **Creature turns** use the same dice and shift pool, with no manoeuvre highlighting (manoeuvres are only on the card art). The player identifies a hit and lowers the hero's HP.
- **Not in scope:** Interrupts, armour deflection, damage rolls beyond the existing dice roller.
