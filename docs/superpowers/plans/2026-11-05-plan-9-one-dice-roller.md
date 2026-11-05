# Plan 9: One Dice Roller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every roll in the app happens in the floating dice roller. Panels keep their Roll buttons and show the results, and the roller always says what the roll is for.

**Architecture:**
- **The desk:** a plain-TypeScript **dice desk** (`src/ui/diceDesk.ts`, a Svelte store by the `subscribe` contract, like `historyStore.ts`).
  - It holds the live **jobs** (requests and watchers), the target, the chosen die and modifier, the "Enter my roll" toggle, the history, and a "roll now" counter.
  - It routes each finished roll to the right job.
  - It is pure and unit-tested in node.
- **The roller and its callers:**
  - `DicePanel.svelte` draws the desk and runs the animation.
  - A new `RollCard.svelte` registers a job while it is mounted and shows its Roll button.
  - Every former `DiceEntry` caller renders a `RollCard`.
  - One-shot rolls (damage, throws, recovery) use `desk.ask(job)`.
- **Context:** the shell creates one desk and provides it through context (`provideDiceDesk` / `useDiceDesk`), replacing `diceContext.ts`.

**Tech Stack:** TypeScript 6, Svelte 5 runes, Vite 8, Vitest 5, Playwright Firefox (`scripts/visual.mjs`, `scripts/e2e-persistence.mjs`). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-11-05-unified-dice-roller-design.md`. Section numbers below (§n) refer to it, and its §9 settles the reviewer's questions.

## Global Constraints

- **No rulebook content in `src/`, `tests/`, `docs/`, `dist/`, commit messages or git.**
  - Examples use invented codes (`XX1`) and names ("Practice Crate", Grumbler).
  - Never open `pdf/` or `local-data/`.
  - Before merging, grep the branch diff for terms from `local-data/dungeon-tables.json`.
- **No rule changes (§3).** Every `PlayFlow` method and `rollReference`, `resolveRoll`/`rollCreatureTable`, `shiftDie`, `throwDamage`, `bombDamage`, `recovers` and `recoverThrown` keep their behaviour. Only `throwWeapon` and `throwBomb` change, and only their signature: they take faces instead of an `rng`.
- **Typed and rolled dice keep separate paths:**
  - A job's `rolled` is today's `onrolled`, and its `roll` is today's `onroll`.
  - A job's `enter` is today's `onenter`.
  - Errors stay owned by the asker.
- **Free rolls never touch the game.** No History step and nothing saved. The roller history is in memory only.
- **No extra taps.** A panel Roll button rolls at once, unless "Enter my roll" is on (then it targets the job and opens the roller).
- **Device:**
  - Touch targets are at least 44 px.
  - Tablet reference viewport 1180×820.
  - Phone check at 390×844: the roller covers at most about half the map area when the side panel is open (§5.8).
- **Commits:** end with a blank line, then the `Co-Authored-By` trailer and the `Claude-Session` line. Stage files by explicit path.
- **Process:**
  - Run your own dev server on a free port with `--strictPort`, and stop it by PID. Leave port 5173 alone.
  - Work on branch `plan-9-dice-roller`, made from `master`. Never push.
- **Every task ends green:**
  - `npm test`
  - `npm run typecheck`
  - `node scripts/visual.mjs http://localhost:<port> /tmp/claude-…/visual-<task>` exits 0. The scratchpad is fine.

## Review Focus

1. **A request disappearing while it is targeted:** the step changes, the fight ends, the Tables tab closes or the panel unmounts. The roller must fall back (newest request, then a watcher, then a free roll) and never call `rolled` on a job that is gone. Tested in Task 1 (`settle after remove`).
2. **A roll still spinning when its target changes:** a second Roll button is pressed mid-animation, or the step moves on. The result must go to the job that was targeted *when the roll started*, or be dropped if that job is gone. It must never go to the new target. Tested in Task 1 (`settle routes by the job id captured at roll start`).
3. **A typed roll that is invalid:** an empty box, "7", or a letter. The asker's existing validation must show the error, the roller must keep the boxes, and nothing may be applied. Tested in Task 1 for free rolls (`typed free roll rejects out-of-range`). In Tasks 4–7, the asker's `enter` is today's `onenter`, so typing "7" for room size must still show the step's error in the roller. The visual script checks this once in Task 4.
4. **A `roll()` that returns no faces:** `flow.rollSizeDice()` and `rollRoomTable()` can return null or `[]` when the step has moved on. The roller must show nothing and not animate. Tested in Task 1 (`facesFor returns null when the job refuses`).
5. **D66 with a modifier:** a free D66 or a D66 table must never show or apply a modifier (`rollTotal` already ignores one; the modifier row must be hidden). Tested in Task 1 (`modifier is null for D66`).

---

### Task 1: The dice desk (pure)

**Files:**
- Create: `src/ui/diceDesk.ts`
- Modify: `src/ui/diceRoller.ts`. `DicePrefs` gains `enter: boolean` (default false). `readDicePrefs` accepts the old shape without `enter`, reading it as false.
- Test: `tests/ui/diceDesk.test.ts`, `tests/ui/diceRoller.test.ts` (prefs)

**Interfaces:**
- Produces:

```ts
// src/ui/diceDesk.ts
import type { DiceState } from '../systems/dungeon/shift';
import type { DiceKind } from './diceRoller';
import type { Rng } from '../systems/dungeon/rules';

export interface ShiftControl {
  pool: number;                 // already clamped to >= 0
  unknownShift: boolean;
  state: DiceState | null;
  onchange: (s: DiceState | null) => void;
}

export interface DiceJob {
  id: string;
  kind: 'request' | 'watcher';
  label: string;                // For-line text without dice or modifier: "Room size", "XX1 Practice Crate"
  dice: DiceKind;
  modifier: number | null;      // null: no modifier row (always null for d66)
  modifierEditable?: boolean;   // default true when modifier !== null
  roll?: () => number[] | null; // asker's own roll; null or [] means "refused"
  rolled: (faces: number[], modifier: number) => void;
  enter: (values: string[], modifier: number) => void;
  error?: string | null;
  oneShot?: boolean;            // removed after rolled/enter
  shift?: ShiftControl;
}

export interface DeskView {
  open: boolean;
  kind: DiceKind;
  modifier: number;
  enterMode: boolean;
  target: DiceJob | null;       // null: free roll
  jobs: readonly DiceJob[];     // registration order
  history: readonly string[];   // newest first, at most HISTORY_SIZE
  rollSeq: number;              // bumps when a Roll button asks the panel to roll now
  focusSeq: number;             // bumps when a Roll button asks for typing (enter mode)
}

export class DiceDesk {
  constructor(prefs: DicePrefs);
  subscribe(run: (v: DeskView) => void): () => void;
  get view(): DeskView;
  put(job: DiceJob): void;      // add, or replace by id (keeps its position and target status)
  remove(id: string): void;
  rollNow(id: string): void;    // target it, open; bump rollSeq (or focusSeq in enter mode)
  ask(job: DiceJob): void;      // put + rollNow (for one-shot jobs)
  rollFree(dice: DiceKind, modifier?: number): void; // target null, choose die, set modifier, open, bump rollSeq
  clearTarget(): void;          // the For line's ×
  choose(kind: DiceKind): void; // free-roll chip; ignored while a target is set; resets modifier to 0
  setModifier(n: number): void; // ignored when the target's modifier is null or not editable
  setOpen(open: boolean): void;
  setEnterMode(on: boolean): void;
  /** Start a roll: the target's id (or null) and the faces to animate to; null when the job refuses. */
  facesFor(rng: Rng): { jobId: string | null; faces: number[] } | null;
  /** A roll landed. Routes to the job captured at start; free rolls go to matching watchers. */
  settle(jobId: string | null, faces: number[]): void;
  /** Typed dice: the job's enter, or for a free roll, validate 1–6 per box and settle. Returns an error for free rolls only. */
  settleTyped(values: string[]): string | null;
  /** Adds " (shifted to 3, 5)" to the newest history line, if it belongs to job `id`. */
  noteShift(id: string, faces: readonly number[]): void;
  prefs(): DicePrefs;
}

export function forLine(target: DiceJob | null, kind: DiceKind, modifier: number): string;
export function historyLine(target: DiceJob | null, kind: DiceKind, faces: number[], modifier: number): string;
```

**Behaviour the tests pin (§5.1–§5.4, §5.7, §9):**

- **Targeting:**
  - A request put while the target is null or a watcher becomes the target (without rolling).
  - A request put while another request is targeted does not take over.
  - A watcher put while the target is null becomes the target.
  - `remove` of the target falls back to the newest remaining request, then the newest watcher, then null.
- **Kind and modifier follow the target.** Setting a target sets `kind = job.dice` and `modifier = job.modifier ?? 0`. Putting the same id again with a new `modifier` doesn't reset a modifier the player changed, unless the job's dice change.
- **Routing:**
  - `settle(jobId, …)` calls that job's `rolled(faces, modifier)` if it still exists, and does nothing if it doesn't.
  - `settle(null, …)` (a free roll) calls `rolled` on every watcher whose `dice === kind`. Requests never get a free roll.
  - One-shot jobs are removed after `rolled`/`enter`.
- **History:** every settle adds `historyLine(...)`.
- **Line formats:**
  - `forLine`: "Free roll" with no target, otherwise `${label} · ${rollLabel(dice, modifier)}` (for example "XX1 Practice Crate · D6 −1", "Room size · D66").
  - `historyLine`: `${label}${modifier ? ' ' + signed : ''}: ${rollWorking(...)}` for a job, and `Free ${rollLabel}: ${rollWorking}` for a free roll (for example "Free D6: 4", "XX1 Practice Crate −1: 4 − 1 = 3").

- [ ] **Step 1: Write the failing tests** in `tests/ui/diceDesk.test.ts`. Use a `job(overrides)` helper that records calls into arrays. Test names and assertions:
  - `new request becomes the target when nothing is targeted`: `put(req('a'))` → `view.target.id === 'a'`, `view.kind === req.dice`.
  - `second request does not take over`: put a, then b → target a. `remove('a')` → target b.
  - `request takes over from a watcher; watcher returns when it goes`: put watcher w, then request r → target r. Remove r → target w.
  - `rollNow targets and bumps rollSeq; in enter mode bumps focusSeq instead`.
  - `settle routes by the job id captured at roll start`: target a, `const s = facesFor(rng)`, then `rollNow('b')`, `settle(s.jobId, s.faces)` → a.rolled called once, b not.
  - `settle after remove does nothing`: start on a, `remove('a')`, settle → no calls. The history still gets the line, labelled with the free-roll form.
  - `free roll highlights matching watchers only`: watchers w6 (`d6`) and w66 (`d66`) and request r (`d6`). `clearTarget()`, `choose('d6')`, settle(null, [4]) → w6.rolled([4], 0). w66 and r not called.
  - `own request roll does not reach other watchers`: settle on r → only r.rolled.
  - `one-shot job is removed after it settles`.
  - `facesFor returns null when the job refuses`: `roll: () => []` → null. `roll: () => null` → null.
  - `facesFor uses rollDice without a job roll`: free `d66`, seeded rng → two faces.
  - `modifier is null for D66`: `choose('d66')`, `setModifier(2)` → `view.modifier === 0`. `forLine(null,'d66',0) === 'Free roll'`.
  - `modifier follows the target and survives re-puts`: put r(modifier −1) → −1. `setModifier(2)`, put r again (same dice) → 2. `remove`, then put s(modifier null) → 0, and `setModifier(3)` stays 0.
  - `typed free roll rejects out-of-range`: `settleTyped(['7'])` on free d6 → `'Type a number from 1 to 6.'`, no history. `settleTyped(['4'])` → null, history `'Free D6: 4'`. For 2D6/D66 the error is `'Type a number from 1 to 6 on each die.'`.
  - `typed roll on a job calls its enter with the strings and modifier`: no validation by the desk.
  - `history lines`: `historyLine(req('XX1 Practice Crate', d6, mod −1), 'd6', [4], −1) === 'XX1 Practice Crate −1: 4 − 1 = 3'`. Free 2D6 [4,5] → `'Free 2D6: 4 + 5 = 9'`. Keep at most 5.
  - `noteShift amends the newest line for that job only`: `'Your attack: 2 + 5 = 7'` → `'Your attack: 2 + 5 = 7 (shifted to 3, 5)'`. Calling it again replaces the suffix rather than adding another.
  - `subscribe emits now and on every change`.
  - In `diceRoller.test.ts`: `readDicePrefs` of `{"open":true,"dice":"d6"}` → `enter: false`. A round trip keeps `enter: true`.

- [ ] **Step 2: Run** `npx vitest run tests/ui/diceDesk.test.ts tests/ui/diceRoller.test.ts`. Expected: FAIL (the module is missing).

- [ ] **Step 3: Implement** `src/ui/diceDesk.ts` and the `DicePrefs.enter` change, to the interfaces above. Reuse `rollDice`, `rollLabel`, `rollWorking`, `addToHistory` from `diceRoller.ts`.

- [ ] **Step 4: Run** `npm test && npm run typecheck`. Expected: all pass.

- [ ] **Step 5: Commit** `feat(dice): a dice desk that holds what each roll is for, routes finished rolls to the panel that asked, and keeps a labelled history`.

---

### Task 2: The roller draws the desk; RollCard; text buttons

**Files:**
- Create: `src/ui/RollCard.svelte`, `src/ui/diceDeskContext.ts`
- Modify:
  - `src/ui/DicePanel.svelte`: props become `{ desk: DiceDesk }`.
  - `src/ui/AppShell.svelte`: replace `diceOpen`/`diceKind`/`diceRequest`/`rollFromText` with one `DiceDesk`. Persist `desk.prefs()` with `writeDicePrefs`. The toolbar dice button calls `desk.setOpen(!open)`.
  - `src/ui/tables/RefText.svelte`, `src/ui/encounter/EncounterText.svelte`: `ondice` becomes `desk.rollFree(dice, modifier)`.
  - `scripts/visual.mjs`: the dice-panel checks.
- Delete: `src/ui/diceContext.ts`
- Test: `scripts/visual.mjs`

**Interfaces:**
- Consumes: Task 1's `DiceDesk`, `DiceJob`, `forLine`.
- Produces:
  - `provideDiceDesk(desk: DiceDesk): void` and `useDiceDesk(): DiceDesk | undefined` in `src/ui/diceDeskContext.ts`.
  - `RollCard.svelte` props: `{ job: DiceJob; done?: boolean; children?: Snippet }`.
    - It `put`s the job in an `$effect` whenever `job` changes, and `remove`s it in `onDestroy` (not in the effect cleanup, so re-puts don't drop the target).
    - While not `done`, it shows `job.label · rollLabel(job.dice, job.modifier ?? 0)` and a button:
      - "🎲 Roll" calls `desk.rollNow(job.id)`.
      - In enter mode, "🎲 Enter in roller".
    - When `view.target?.id === job.id`, it shows the hint "In the dice roller".
    - It shows `job.error` as `role="alert"`.
    - When `done`, it renders `children` instead.
    - `data-testid="roll-card"`.
  - DicePanel test ids, kept from today: `dice-panel`, `dice-result`, `dice-total`, `dice-history`. New: `dice-for` (the For line), `dice-mod` (the modifier input), `dice-enter` (the toggle), `dice-typed` (a form with one `input` per die and a "Use these" button).

**The panel (§5.1, §5.4, §5.5, §5.7, §5.8):**
- **Header:** title and close.
- **For line** with × (`aria-label="Roll freely"`). The × is shown only when there is a target.
- **Chips:** disabled except the target's die while a target is set.
- **Modifier row:** "− [n] +". It works like `TableView`'s does today (typing either minus sign, reformatted on blur). It is hidden when `kind === 'd66'`, or when the target's modifier is null. It is read-only when the target's modifier isn't editable.
- **Roll button and the "Enter my roll" toggle** (`aria-pressed`).
- **Result:**
  - Faces and the working, as today.
  - The target's `error`, as `role="alert"`.
  - In enter mode, the typed form instead of the faces. Typing a digit moves focus to the next box, as `DiceEntry` does. Submit calls `desk.settleTyped(values)`, and any returned error shows in the form.
- **History.**

**Behaviour:**
- **Animation:** an `$effect` on `view.rollSeq` starts a roll: `facesFor(Math.random)` → `animateRoll` → `settle(jobId, faces)`. Capture `jobId` before animating.
- **Focus:** an `$effect` on `view.focusSeq` focuses the first typed box.
- **Phone (< 700 px):** the history shows only its newest line. The 390×844 check comes in Task 8.

- [ ] **Step 1: Update `scripts/visual.mjs` first** so it fails.
  - In the existing dice-roller section (search `dice-panel`), assert that `[data-testid=dice-for]` reads "Free roll".
  - After a "Roll a D6" text button, assert the For line still reads "Free roll" and that the history's first line starts with "Free D6:".
  - Toggle `[data-testid=dice-enter]`, type `4` in `[data-testid=dice-typed] input`, press "Use these", and expect the history line "Free D6: 4".
  - Type `7` and expect the roller form's `role=alert` to read "Type a number from 1 to 6.".
  - Toggle enter mode off again.
- [ ] **Step 2: Run** the visual script. Expected: it fails on the missing `dice-for`.
- [ ] **Step 3: Implement** the context, `DicePanel`, `RollCard`, the AppShell wiring, and the `RefText`/`EncounterText` changes. Delete `diceContext.ts`. The manoeuvre damage buttons in `EncounterPane` call `desk.rollFree(damage.dice, damage.modifier)` for now (Task 5 makes them jobs).
- [ ] **Step 4: Run** `npm test && npm run typecheck`, then the visual script. Expected: all pass, with no undersized buttons in the roller.
- [ ] **Step 5: Commit** `feat(dice): the floating roller says what each roll is for, takes a modifier and typed dice, and labels its history; text dice buttons roll freely in it`.

---

### Task 3: Reference tables roll in the roller

**Files:**
- Modify:
  - `src/ui/tables/TableView.svelte`: remove the `DiceEntry`, the modifier field, `rollSeq`, `typedError` and `onmodifier`.
  - `src/ui/tables/TablesPane.svelte` and `src/ui/AppShell.svelte`, for the removed prop. `tablesState` keeps its `modifier` as the job's starting modifier.
  - `scripts/visual.mjs`: the table-reference section.
- Test: `scripts/visual.mjs`

**Interfaces:**
- Consumes: `RollCard`, `DiceJob` (Task 2).

**The watcher:** when `table.dice` is set, `TableView` renders a `RollCard` with this job:

```ts
{
  id: `table:${code}`,
  kind: 'watcher',
  label: isSlug(code) ? table.name : `${code} ${table.name}`,
  dice: table.dice,
  modifier: table.dice === 'd66' ? null : modifier,
  rolled: (faces, m) => apply(faces, m),
  enter: (values, m) => enter(values, m),
  error: typedError,
}
```

- `apply` and `enter` are today's functions with the modifier passed in. The error texts are unchanged.
- The `RollCard` sits where the dice box was, followed by the existing result block (sum, "counts as", the hit row's cells, or "No row for N"). The row highlight and scroll-into-view are unchanged.
- `TablesPane` is mounted only while the Tables tab is in front (`AppShell`'s `activeTab === 'tables'`). So the watcher exists exactly while the table is in front, as §5.3 needs.

- [ ] **Step 1: Update the table-reference section of `scripts/visual.mjs`** (search `ref-result` or `ref-mod`):
  - Opening `XX1` from an encounter text button with −1 shows the For line "… · D6 −1". There is no `ref-mod` input in the pane.
  - Pressing the card's "🎲 Roll" puts a `tr.hit` row and a `[data-testid=ref-result]` on screen.
  - With the table open, a free D6 roll (the roller's own Roll button after ×) also gives a `tr.hit`.
  - In enter mode, typing `3` with modifier −1 shows "3 − 1 = 2".
- [ ] **Step 2: Run** the visual script. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck` and the visual script. Expected: pass.
- [ ] **Step 5: Commit** `feat(tables): a reference table rolls in the floating roller with the roller's modifier, and any free roll of its dice highlights its row`.

---

### Task 4: Map-building rolls

**Files:**
- Modify:
  - `src/ui/steps/ExitCountStep.svelte`
  - `src/ui/steps/SizeStep.svelte`
  - `src/ui/steps/ExitsStep.svelte`
  - `src/ui/steps/LabelStep.svelte`
  - `src/ui/RoomRoll.svelte`
  - `scripts/visual.mjs`
  - `scripts/e2e-persistence.mjs`
- Test: the two scripts above

**Interfaces:**
- Consumes: `RollCard`, `DiceJob`.

**Jobs.** Every one has `kind: 'request'` and `modifier: null`. Each `roll`/`rolled`/`enter` is exactly the callback the `DiceEntry` had, and the error is the same prop.

| Component | id | label | dice | roll / rolled / enter |
|---|---|---|---|---|
| ExitCountStep | `exits-count` | Exits | d6 | `[flow.rollDie()]` / `applyRolledExitCount` / `enterExitCount` |
| SizeStep | `room-size:${step.first ? 2 : 1}` | Room size (the second pair: "Room size, second pair") | d66 | `rollSizeDice` / `applyRolledSize` / `enterSize` |
| ExitsStep | `exit-place:${step.chosen.length}` | First wall | d6 | `[flow.rollDie()]` / `placeExitsForMe` / `placeTyped` |
| LabelStep, room | `room-table` | Room table | 2d6 or d66 | as today, including `rerolled` |
| LabelStep, exit | `exit-table` | Exit type | d66 | as today |
| RoomRoll, room | `inspect-room:${room.id}` | Room table | as today | as today |
| RoomRoll, exit | `inspect-exit:${room.id}` | Exit type | d66 | as today |

The `{#key}` blocks that remounted `DiceEntry` now remount the `RollCard`, so the id changes and a fresh request is targeted. Each panel's explanatory sentence ("Roll the red and blue dice, then type them in…") becomes "Roll the red and blue dice in the dice roller — or type your own there."

**`scripts/visual.mjs`:**
- Turn enter mode on at start with `localStorage['2d6.diceRoller'] = {"open":true,"dice":"d6","enter":true}` (in the existing `addInitScript`).
- Replace the helpers `typeDice` and the "Use these"/"Use this" clicks for these steps with one helper, `rollerEnter(...values)`: fill `[data-testid=dice-typed] input` in order, then click its "Use these".
- Do the same in `e2e-persistence.mjs` (`panelButton('Use these'|'Use this')` and its typing).
- Add one check: typing `7`/`1` for the room size shows the step's error (`role=alert`) in the roller and the step stays on `size`.

- [ ] **Step 1: Update the two scripts** as above. Steps not yet migrated (encounters) still use their old typing until their task.
- [ ] **Step 2: Run** the visual script. Expected: FAIL at the first room.
- [ ] **Step 3: Implement** the seven `RollCard`s.
- [ ] **Step 4: Run** `npm test && npm run typecheck`, `node scripts/visual.mjs …` and `node scripts/e2e-persistence.mjs …`. Expected: pass. Also check that the unique-room re-roll note still appears after a rolled (not typed) room table, using the existing check (search `Re-rolled`).
- [ ] **Step 5: Commit** `feat(dice): room size, exits, room and exit tables and the inspector re-roll ask the floating roller for their dice`.

---

### Task 5: Creature-table rolls and damage rolls

**Files:**
- Modify:
  - `src/ui/encounter/PendingRoll.svelte`
  - `src/ui/encounter/EncounterPane.svelte`: the damage buttons, near today's lines 461–477 and 641–657.
  - `scripts/visual.mjs`
- Test: `scripts/visual.mjs`

**PendingRoll job:**
- `id: \`pending:${index}:${roll.code}\`` (the pane passes `index`).
- `label: \`Roll on ${roll.code}\``.
- `dice: 'd6'`.
- `modifier: roll.modifier || null`, `modifierEditable: false`. `resolveRoll` applies the stored modifier, so the player can't change it (no rule change).
- `rolled: (f) => ondie(f[0])`.
- `enter`: today's `enter`.
- `error: typedError ?? error`.
- The × (drop) button stays in the header.

**Damage jobs (one-shot, §5.2):** pressing a damage button calls `desk.ask` with:
- `id: \`damage:${turnKey}:${m.name}\``.
- `label: \`${m.name} damage\``.
- `dice`/`modifier` from `parseDamage`, `oneShot: true`.
- `rolled` and `enter` set `damageNote = { key: turnKey, name: m.name, text: \`Rolled ${total} damage\` }`. `total` is `rollTotal(dice, faces, modifier)`. For typed values, validate each as 1–6 first, or show the roller form error 'Type a number from 1 to 6 on each die.'.
- The pane shows `damageNote.text` beside the button whose `name` matches, while `damageNote.key === turnKey`.
- No HP change.

- [ ] **Step 1: Update the visual script's encounter section:**
  - A queued `XX9 −1` creature roll shows a `roll-card` with "Roll on XX9 · D6 −1".
  - Rolling it resolves the entry as today.
  - In enter mode, the modifier input is read-only for that target.
  - A damage button press leaves "Rolled N damage" beside it, and the roller history starts with "<name> damage".
- [ ] **Step 2: Run** the visual script. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck` and the visual script. Expected: pass.
- [ ] **Step 5: Commit** `feat(combat): creature-table and damage rolls happen in the floating roller; a damage roll leaves its total beside the button`.

---

### Task 6: Attack dice and shifting in the roller

**Files:**
- Create: `src/ui/DiceShifter.svelte`. Move the shifter markup and styles from `TurnDice` into it: arrows, tap and right-click, "Shift left", "Rolled a-b", the locked and unknown-SH notes, "Roll again".
- Modify:
  - `src/ui/encounter/TurnDice.svelte`
  - `src/ui/DicePanel.svelte`
  - `scripts/visual.mjs`: search `turn-dice`, `attack-die`, `shift-left`, `Roll again`.
- Test: `scripts/visual.mjs`

**Interfaces:**
- Consumes: `ShiftControl`, `desk.noteShift` (Task 1).
- Produces: `DiceShifter.svelte` props `{ shift: ShiftControl; onmoved: (faces: readonly number[]) => void }`. It uses `shiftDie` and `locked` unchanged. "Roll again" calls `shift.onchange(null)`.

**TurnDice:** it renders a `RollCard` for the whole turn, with this job:
- `id: \`attack:${turnKey}\`` (the pane passes `turnKey`).
- `label`: 'Your attack', or `${foe.name}'s attack`.
- `dice: '2d6'`, `modifier: null`.
- `rolled: (f) => onchange(freshDice(f[0], f[1]))`.
- `enter`: today's 1–6 validation, then the same.
- `error`.
- `shift: { pool: max, unknownShift, state: dice, onchange }`.

`done={dice !== null}`. The `done` children show:
- the two current faces as `DieFace` at size 40 (not buttons), with `data-testid="attack-die"` and `data-value` kept so existing checks still find them;
- the line "Shift in the dice roller";
- the roll note (Miss / Prime / Exact / Mishap), as today (`data-testid="roll-note"`).

**DicePanel:** when `view.target?.shift?.state` is set, it shows `DiceShifter` in place of the result faces. `onmoved` calls `desk.noteShift(target.id, faces)`.

The pane's highlights (`matched`, `foeHits`, `deflected`, `interruptsHit`) are unchanged: they read `turnDice`, which still comes from the pane's own `DiceState`.

- [ ] **Step 1: Update the visual script:**
  - The attack dice are rolled from the card.
  - The ▲/▼ buttons and `shift-left` are found inside `[data-testid=dice-panel]`.
  - Shifting a die changes the matched manoeuvre's highlight in the pane.
  - "Roll again" is in the roller.
  - The newest history line ends with "(shifted to …)".
  - The next turn shows a fresh waiting card.
- [ ] **Step 2: Run** the visual script. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run typecheck` and the visual script. Expected: pass.
- [ ] **Step 5: Commit** `feat(combat): the attack dice roll and shift in the floating roller while the encounter pane lights up the matching manoeuvre`.

---

### Task 7: Throws and weapon recovery

**Files:**
- Modify:
  - `src/ui/encounter/encounterActions.ts`: `throwWeapon(history, c, foeId, interrupts, faces: number[])` and `throwBomb(history, c, foeId, dungeonLevel, faces: number[])`. A bomb with no damage dice takes `[]`.
  - `src/ui/encounter/EncounterPane.svelte`
  - `src/ui/encounter/VictoryPanel.svelte` (no change to its props)
  - `scripts/visual.mjs`
- Test: `tests/ui/encounterActions.test.ts`, `scripts/visual.mjs`

**Jobs.** All are `desk.ask`, `oneShot: true` and `modifier: null` (bomb damage uses the parsed modifier):

| Job | id | label | dice | rolled |
|---|---|---|---|---|
| Weapon throw | `throw:${c.list}:${c.index}` | `Throw ${c.item} at ${foe.name}` | `d66` (red and blue, read against Interrupts as now) | `throwWeapon(…, faces)` |
| Bomb with `damage` | `bomb:${index}` | `${bomb.name} at ${foe.name}` | parsed dice | `throwBomb(…, faces)` |
| Bomb without `damage` | (no job) | | | `throwBomb(…, [])` at once, as today |
| Recovery | `recover:${i}` | `Get back the ${t.name}` | `d6` | `recoverThrown(history, i, faces[0])` |

For typed dice, `enter` validates each value as 1–6 (the error is 'Type a number from 1 to 6 on each die.', or 'Type a number from 1 to 6.' for one die) and then calls the same function. The roller shows the error through the job's `error` (`put` again with the error set).

- [ ] **Step 1: Write the failing tests.** In `tests/ui/encounterActions.test.ts`, change the throw tests to pass faces instead of a seeded rng. Keep their expected damage, hits and logs, using the faces the old seeded rng produced. Add `throwBomb with no damage dice ignores faces` (`[]`).
- [ ] **Step 2: Run** `npx vitest run tests/ui/encounterActions.test.ts`. Expected: FAIL (signature).
- [ ] **Step 3: Implement** the signature change and the pane wiring. Update the visual script's throw and recovery checks:
  - A throw shows in the roller as "Throw … at …".
  - It commits one History step ("Throw Dagger").
  - It also works with a typed roll.
- [ ] **Step 4: Run** `npm test && npm run typecheck` and the visual script. Expected: pass.
- [ ] **Step 5: Commit** `feat(combat): throws, bomb damage and getting thrown weapons back roll in the floating roller instead of out of sight`.

---

### Task 8: Remove DiceEntry, phone layout, final checks

**Files:**
- Delete: `src/ui/DiceEntry.svelte`. Check with `grep -rn DiceEntry src scripts` that nothing uses it.
- Modify:
  - `src/ui/DicePanel.svelte` (phone layout)
  - `scripts/visual.mjs` (phone check)
  - `README.md`, if it describes rolling in panels (search "Roll for me").
- Test: `scripts/visual.mjs`

- [ ] **Step 1: Add a phone check to `scripts/visual.mjs`:**
  - A new context at 390×844, dpr 3, touch.
  - Start a game, open a reference table and the roller.
  - Assert that the roller's height × width is at most 50% of the visible map area (the canvas bounding box minus the side panel's overlap), that no roller button is under 44 px, and that there is no horizontal page scroll.
  - Save `phone-roller.png`.
- [ ] **Step 2: Run** the visual script. Expected: FAIL until the phone styles fit.
- [ ] **Step 3: Implement the phone styles** in `DicePanel`:
  - Full map width minus 16 px gutters.
  - Chips and modifier on one row.
  - History limited to its newest line.
  - Typed boxes at 52 px.
- [ ] **Step 4: Run** the full check: `npm test`, `npm run typecheck`, `npm run build && node scripts/check-dist.mjs`, the visual script, and `node scripts/e2e-persistence.mjs …`. Expected: all pass. Look over `phone-roller.png` and the tablet roller screenshots yourself.
- [ ] **Step 5: Grep the branch diff for rulebook terms.**

  ```bash
  git diff master...HEAD | grep -i -F -f <(node -e "…list names and codes from local-data/dungeon-tables.json…")
  ```

  Expected: no matches. This is the only time `local-data/` is read, and it is only for the term list.
- [ ] **Step 6: Commit** `refactor(dice): drop the old in-panel dice boxes and fit the floating roller to a phone`.
