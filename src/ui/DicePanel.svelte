<script lang="ts">
  // The floating dice roller over the map's top-right corner. It draws the dice desk: what the roll is
  // for, the die, the modifier, the animated dice, typed dice, and the labelled history. Rolls land on the
  // job that was targeted when they started. Never part of the game itself: no History step, no save.
  import { onDestroy, tick, untrack } from 'svelte';
  import DieFace from './DieFace.svelte';
  import DiceShifter from './DiceShifter.svelte';
  import { DICE, rollDice, rollLabel, rollTotal, rollWorking, type DiceKind } from './diceRoller';
  import { forLine, type DeskView, type DiceDesk } from './diceDesk';
  import { animateRoll } from './rollAnimation';
  import { unlockAudio } from './sound';

  interface Props {
    desk: DiceDesk;
  }
  let { desk }: Props = $props();

  let view = $state.raw<DeskView>(untrack(() => desk.view));
  $effect(() => desk.subscribe((v) => (view = v)));

  /** The roll on show: its die and modifier, the faces (spinning while `settled` is false). */
  let shown = $state<{ dice: DiceKind; modifier: number; faces: number[]; settled: boolean } | null>(null);
  let cancelRoll: (() => void) | null = null;
  let spinningJob: string | null = null; // the job the roll in flight is for
  onDestroy(() => cancelRoll?.());

  const rolling = $derived(shown !== null && !shown.settled);
  const target = $derived(view.target);
  const targetId = $derived(view.target?.id ?? null); // a primitive: a re-put of the same job changes nothing
  const kind = $derived(target ? target.dice : view.kind);
  const hasModifier = $derived(kind !== 'd66' && (target ? target.modifier !== null : true));
  const modifierLocked = $derived(target?.modifierEditable === false);

  // A Roll button (here or a text button elsewhere) bumped rollSeq: start one roll, for the job targeted now.
  let handledRoll = untrack(() => view.rollSeq);
  $effect(() => {
    const seq = view.rollSeq;
    untrack(() => {
      if (seq === handledRoll) return;
      handledRoll = seq;
      startRoll();
    });
  });

  function startRoll() {
    // A new roll from a text button replaces one still spinning. A one-shot request whose roll is
    // cancelled is gone with it, so it cannot become the target of a later roll.
    cancelRoll?.();
    cancelRoll = null;
    const abandoned = spinningJob;
    spinningJob = null;
    if (abandoned !== null && abandoned !== desk.view.target?.id && desk.view.jobs.some((j) => j.id === abandoned && j.oneShot)) desk.remove(abandoned);
    unlockAudio();
    const start = desk.facesFor(Math.random);
    if (!start) {
      shown = null; // the asker refused (its step moved on): nothing to show
      return;
    }
    const { jobId, faces: finals } = start;
    const t = desk.view.target;
    const dice = t ? t.dice : desk.view.kind;
    const modifier = dice === 'd66' || (t && t.modifier === null) ? 0 : desk.view.modifier;
    shown = { dice, modifier, faces: [...finals], settled: false };
    spinningJob = jobId;
    cancelRoll = animateRoll(finals, 6, {
      faces: (f) => {
        if (shown) shown.faces = f;
      },
      land: () => {},
      done: () => {
        cancelRoll = null;
        spinningJob = null;
        shown = { dice, modifier, faces: finals, settled: true };
        desk.settle(jobId, finals, dice, modifier);
      },
    });
  }

  const total = $derived(shown?.settled ? rollTotal(shown.dice, shown.faces, shown.modifier) : null);
  /** "= 4" for one plain D6; otherwise the working ("4 + 5 = 9", "5 → 3", "4 − 1 = 3"), or the D66 reading. */
  const totalText = $derived.by(() => {
    if (!shown || total === null) return '';
    if (shown.dice === 'd66') return total;
    if (shown.dice === 'd6' && !shown.modifier) return `= ${total}`;
    return rollWorking(shown.dice, shown.faces, shown.modifier);
  });

  function rollButton() {
    if (target) desk.rollNow(target.id);
    else desk.rollFree(view.kind, view.modifier);
  }

  // The modifier field: − and + buttons, or typing a whole number (a minus sign of either kind).
  // While the field has focus it keeps what was typed; it is reformatted only on blur.
  const minus = (n: number) => (n < 0 ? `−${Math.abs(n)}` : String(n));
  let draft = $state<string | null>(null);
  function typedModifier(e: Event) {
    const raw = (e.currentTarget as HTMLInputElement).value;
    draft = raw;
    const v = raw.trim().replace(/[−–]/g, '-');
    if (/^[+-]?\d{1,3}$/.test(v)) desk.setModifier(Number(v));
  }
  function stepModifier(by: number) {
    draft = null;
    desk.setModifier(view.modifier + by);
  }

  // Typed dice ("Enter my roll"): one box per die; a digit moves on to the next box.
  const count = $derived(rollDice(kind, () => 0).length);
  let values = $state<string[]>([]);
  let typedError = $state<string | null>(null);
  let boxes: (HTMLInputElement | undefined)[] = [];
  $effect(() => {
    const n = count;
    void kind; // a new die or a new target starts the boxes over
    void targetId;
    untrack(() => {
      values = Array.from({ length: n }, () => '');
      typedError = null;
    });
  });
  function onBoxInput(i: number) {
    typedError = null;
    if (i < count - 1 && /^[1-6]$/.test((values[i] ?? '').trim())) boxes[i + 1]?.focus();
  }
  function useTyped(e: SubmitEvent) {
    e.preventDefault();
    if (rolling) return;
    const err = desk.settleTyped([...values]);
    typedError = err;
    if (!err) {
      values = Array.from({ length: count }, () => '');
      shown = null; // the faces on show are no longer the newest history line
    }
  }

  let handledFocus = untrack(() => view.focusSeq);
  $effect(() => {
    const seq = view.focusSeq;
    untrack(() => {
      if (seq === handledFocus) return;
      handledFocus = seq;
      void tick().then(() => boxes[0]?.focus());
    });
  });

  const boxName = (i: number) => (count === 1 ? 'Die' : kind === 'd66' ? (i === 0 ? 'Red die (tens)' : 'Blue die (units)') : `Die ${i + 1}`);
</script>

{#if view.open}
  <section class="dice-panel" aria-labelledby="dice-title" data-testid="dice-panel">
    <header>
      <h2 id="dice-title">Dice</h2>
      <button type="button" class="close" aria-label="Close dice" onclick={() => desk.setOpen(false)}>×</button>
    </header>
    <div class="for" data-testid="dice-for">
      <span class="for-text">{forLine(target, view.kind, view.modifier)}</span>
      {#if target}<button type="button" class="free" aria-label="Roll freely" disabled={rolling} onclick={() => desk.clearTarget()}>×</button>{/if}
    </div>
    <div class="row">
    <div class="chips" role="group" aria-label="Die">
      {#each DICE as d (d.kind)}
        <button type="button" aria-pressed={kind === d.kind} disabled={rolling || (target !== null && target.dice !== d.kind)} onclick={() => desk.choose(d.kind)}>{d.label}</button>
      {/each}
    </div>
    {#if hasModifier}
      <div class="modifier">
        <button type="button" aria-label="Modifier down" disabled={rolling || modifierLocked} onclick={() => stepModifier(-1)}>−</button>
        <input
          type="text"
          inputmode="numeric"
          autocomplete="off"
          aria-label="Modifier"
          data-testid="dice-mod"
          readonly={modifierLocked}
          disabled={rolling}
          value={draft ?? minus(view.modifier)}
          oninput={typedModifier}
          onblur={() => (draft = null)}
        />
        <button type="button" aria-label="Modifier up" disabled={rolling || modifierLocked} onclick={() => stepModifier(1)}>+</button>
      </div>
    {/if}
    </div>
    <button type="button" class="roll" disabled={rolling} onclick={rollButton}>{view.enterMode ? '🎲 Enter my roll' : `🎲 Roll ${rollLabel(kind, hasModifier ? view.modifier : 0)}`}</button>
    <button type="button" class="enter" aria-pressed={view.enterMode} data-testid="dice-enter" onclick={() => desk.setEnterMode(!view.enterMode)}>Enter my roll</button>
    {#if target?.shift?.state && !rolling}
      {@const owner = target}
      <DiceShifter shift={target.shift} onmoved={(faces) => desk.noteShift(owner.id, faces)} />
    {:else if view.enterMode}
      <form class="typed" data-testid="dice-typed" onsubmit={useTyped}>
        <div class="boxes">
          {#each values as _, i (i)}
            <input
              type="text"
              inputmode="numeric"
              autocomplete="off"
              maxlength="3"
              aria-label={boxName(i)}
              bind:value={values[i]}
              bind:this={boxes[i]}
              oninput={() => onBoxInput(i)}
              disabled={rolling}
            />
          {/each}
        </div>
        <button type="submit" disabled={rolling}>Use these</button>
        {#if typedError ?? target?.error}<p class="error" role="alert">{typedError ?? target?.error}</p>{/if}
      </form>
    {:else}
      <div class="result" data-testid="dice-result" aria-live="polite">
        {#if shown}
          <span class="faces">
            {#each shown.faces as f, i (i)}<DieFace value={f} colour={i === 0 ? 'red' : 'blue'} size={48} />{/each}
          </span>
          {#if total !== null}
            <span class="total" class:long={totalText.length > 9} data-testid="dice-total">{totalText}</span>
          {/if}
        {:else}
          <span class="empty">Choose a die and roll.</span>
        {/if}
        {#if target?.error}<p class="error" role="alert">{target.error}</p>{/if}
      </div>
    {/if}
    {#if view.history.length}
      <ol class="history" aria-label="Last rolls" data-testid="dice-history">
        {#each view.history as h, i (i)}<li>{h}</li>{/each}
      </ol>
    {/if}
  </section>
{/if}

<style>
  /* A grid child of the app shell, in the map's cell: only its own box covers the map. */
  .dice-panel {
    grid-area: map;
    position: relative;
    z-index: 4;
    align-self: start;
    justify-self: end;
    width: 248px;
    max-height: calc(100% - 20px);
    overflow-y: auto;
    box-sizing: border-box;
    margin: 10px;
    padding: 8px 10px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    color: var(--ink);
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 8px;
    box-shadow: 0 4px 14px rgba(20, 16, 10, 0.3);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  h2 {
    margin: 0;
    font-size: 19px;
  }
  .row {
    display: contents; /* one row only on a phone */
  }
  button {
    min-width: 44px;
    min-height: 44px;
    padding: 0 8px;
    font: inherit;
    font-size: 17px;
    color: var(--ink);
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 6px;
    cursor: pointer;
    touch-action: manipulation;
  }
  button:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
  button:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .close {
    font-size: 24px;
    line-height: 1;
    padding: 0;
    border-color: transparent;
  }
  .chips {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
  }
  .chips button {
    padding: 0;
    font-weight: 600;
  }
  .chips button[aria-pressed='true'] {
    color: var(--paper);
    background: var(--ink);
  }
  .roll {
    min-height: 48px;
    font-size: 18px;
    font-weight: 600;
    color: var(--paper);
    background: var(--ink);
  }
  .result {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    min-height: 52px;
  }
  .faces {
    display: inline-flex;
    gap: 6px;
  }
  .total {
    font-size: 28px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .total.long {
    font-size: 20px;
  }
  .empty {
    color: var(--muted);
    font-size: 15px;
  }
  .history {
    margin: 0;
    padding: 6px 0 0;
    list-style: none;
    border-top: 1px solid var(--rule);
    font-size: 14px;
    line-height: 1.5;
    font-variant-numeric: tabular-nums;
  }
  .for {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    font-weight: 600;
    font-size: 16px;
  }
  .free {
    font-size: 22px;
    line-height: 1;
    padding: 0;
    border-color: transparent;
  }
  .modifier {
    display: grid;
    grid-template-columns: 44px 1fr 44px;
    gap: 4px;
  }
  .modifier input,
  .boxes input {
    min-height: 44px;
    box-sizing: border-box;
    min-width: 0;
    font: inherit;
    font-size: 17px;
    text-align: center;
    color: var(--ink);
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 6px;
  }
  .enter[aria-pressed='true'] {
    color: var(--paper);
    background: var(--ink);
  }
  .typed {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .boxes {
    display: flex;
    gap: 6px;
  }
  .boxes input {
    flex: 1;
  }
  .error {
    flex-basis: 100%;
    margin: 0;
    color: var(--danger);
    font-size: 14px;
  }
  /* Phone: the full map width less a 16 px gutter each side; chips and modifier share a row, only the
     newest history line shows, and the typed boxes grow to 52 px. */
  @media (max-width: 699.98px) {
    .dice-panel {
      width: calc(100% - 32px);
      justify-self: center;
      margin: 8px 16px;
      padding: 4px 10px 6px;
      gap: 4px 6px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      align-items: stretch;
    }
    .dice-panel > :global(*) {
      grid-column: 1 / -1;
    }
    .dice-panel > header {
      grid-row: 1;
      grid-column: 2;
      justify-content: flex-end;
    }
    .dice-panel > .for {
      grid-row: 1;
      grid-column: 1;
    }
    h2 {
      position: absolute; /* the For line is the visible label; the heading stays for assistive tech */
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
    .dice-panel > .roll,
    .dice-panel > .enter {
      grid-column: auto;
    }
    .row {
      display: flex;
      gap: 6px;
    }
    .row .chips {
      flex: 1;
      min-width: 0;
    }
    .row .modifier {
      flex: 0 0 140px;
    }
    .result {
      min-height: 44px;
    }
    .roll {
      min-height: 44px;
    }
    .history {
      padding-top: 0;
      border-top: 0;
      font-size: 13px;
      line-height: 1.3;
    }
    .typed {
      flex-direction: row;
      align-items: stretch;
      flex-wrap: wrap;
    }
    .boxes {
      flex: 1 1 0;
      min-width: 0;
    }
    .typed > button {
      flex: 0 0 120px;
    }
    .typed .error {
      order: 3;
    }
    .history li:not(:first-child) {
      display: none;
    }
    .boxes input {
      width: 52px;
      min-height: 52px;
      min-width: 52px;
    }
  }
  .history li:first-child {
    font-weight: 600;
  }
</style>
