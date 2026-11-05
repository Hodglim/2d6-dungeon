<script lang="ts">
  // The floating dice roller over the map's top-right corner: pick a die, roll it with the animated
  // dice, see the total and the last five rolls. Never part of the game: no History step, no save.
  import { onDestroy, untrack } from 'svelte';
  import DieFace from './DieFace.svelte';
  import { DICE, addToHistory, describeRoll, rollDice, rollLabel, rollTotal, rollWorking, type DiceKind } from './diceRoller';
  import { animateRoll } from './rollAnimation';
  import { unlockAudio } from './sound';

  interface Props {
    /** The chosen die. */
    dice: DiceKind;
    /** A roll asked for from outside (a "Roll a D6" button or a hit manoeuvre): choose that die and roll once. */
    request?: { dice: DiceKind; modifier?: number; seq: number } | null;
    onchoose: (dice: DiceKind) => void;
    onrequesttaken?: () => void;
    onclose: () => void;
  }
  let { dice, request = null, onchoose, onrequesttaken, onclose }: Props = $props();

  /** The modifier a hit manoeuvre asked for ("D6 −1"); kept for re-rolls until another die is chosen. */
  let modifier = $state(0);
  /** The roll on show: its die and modifier, the faces (spinning while `settled` is false). */
  let shown = $state<{ dice: DiceKind; modifier: number; faces: number[]; settled: boolean } | null>(null);
  let history = $state<string[]>([]);
  let cancelRoll: (() => void) | null = null;
  onDestroy(() => cancelRoll?.());

  const rolling = $derived(shown !== null && !shown.settled);

  function choose(kind: DiceKind) {
    modifier = 0;
    onchoose(kind);
  }

  function roll(kind: DiceKind, mod: number) {
    cancelRoll?.(); // a new roll from a text button replaces one still spinning
    unlockAudio();
    const finals = rollDice(kind, Math.random);
    shown = { dice: kind, modifier: mod, faces: [...finals], settled: false };
    cancelRoll = animateRoll(finals, 6, {
      faces: (f) => {
        if (shown) shown.faces = f;
      },
      land: () => {},
      done: () => {
        cancelRoll = null;
        shown = { dice: kind, modifier: mod, faces: finals, settled: true };
        history = addToHistory(history, describeRoll(kind, finals, mod));
      },
    });
  }

  $effect(() => {
    if (!request) return;
    const kind = request.dice;
    const mod = kind === 'd66' ? 0 : (request.modifier ?? 0);
    untrack(() => {
      onchoose(kind);
      modifier = mod;
      roll(kind, mod);
      onrequesttaken?.();
    });
  });

  const total = $derived(shown?.settled ? rollTotal(shown.dice, shown.faces, shown.modifier) : null);
  /** "= 4" for one plain D6; otherwise the working ("4 + 5 = 9", "5 → 3", "4 − 1 = 3"), or the D66 reading. */
  const totalText = $derived.by(() => {
    if (!shown || total === null) return '';
    if (shown.dice === 'd66') return total;
    if (shown.dice === 'd6' && !shown.modifier) return `= ${total}`;
    return rollWorking(shown.dice, shown.faces, shown.modifier);
  });
</script>

<section class="dice-panel" aria-labelledby="dice-title" data-testid="dice-panel">
  <header>
    <h2 id="dice-title">Dice</h2>
    <button type="button" class="close" aria-label="Close dice" onclick={onclose}>×</button>
  </header>
  <div class="chips" role="group" aria-label="Die">
    {#each DICE as d (d.kind)}
      <button type="button" aria-pressed={dice === d.kind} onclick={() => choose(d.kind)}>{d.label}</button>
    {/each}
  </div>
  <button type="button" class="roll" disabled={rolling} onclick={() => roll(dice, modifier)}>🎲 Roll {rollLabel(dice, modifier)}</button>
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
  </div>
  {#if history.length}
    <ol class="history" aria-label="Last rolls" data-testid="dice-history">
      {#each history as h, i (i)}<li>{h}</li>{/each}
    </ol>
  {/if}
</section>

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
  .history li:first-child {
    font-weight: 600;
  }
</style>
