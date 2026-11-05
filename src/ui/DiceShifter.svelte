<script lang="ts">
  // The Shift controls for a roll that can be shifted: an arrow above and below each die, tap to shift
  // up and right-click to shift down, what is left of the pool, and "Roll again". The dice state itself
  // belongs to the asker (`shift.state`); every move is handed back through `shift.onchange`.
  import { locked, shiftDie } from '../systems/dungeon/shift';
  import type { ShiftControl } from './diceDesk';
  import DieFace from './DieFace.svelte';

  interface Props {
    shift: ShiftControl;
    /** The faces after a move, so the roller's newest history line can say what they were shifted to. */
    onmoved: (faces: readonly number[]) => void;
  }
  let { shift, onmoved }: Props = $props();

  const dice = $derived(shift.state);
  const max = $derived(Math.max(0, shift.pool));

  function move(i: 0 | 1, d: 1 | -1) {
    if (!dice) return;
    const next = shiftDie(dice, i, d, max);
    if (next === dice) return;
    shift.onchange(next);
    onmoved(next.faces);
  }
  const can = (i: 0 | 1, d: 1 | -1) => dice !== null && shiftDie(dice, i, d, max) !== dice;

  function down(e: MouseEvent, i: 0 | 1) {
    e.preventDefault();
    move(i, -1);
  }

  const NAMES = ['Red', 'Blue'] as const;
  const COLOURS = ['red', 'blue'] as const;
</script>

{#if dice}
  <div class="shifter" data-testid="dice-shifter">
    <div class="dice">
      {#each [0, 1] as const as i (i)}
        <div class="col">
          <button type="button" class="arrow" aria-label="{NAMES[i]} die up" disabled={!can(i, 1)} onclick={() => move(i, 1)}>▲</button>
          <button
            type="button"
            class="die"
            aria-label="{NAMES[i]} die {dice.faces[i]}: click to shift up, right-click to shift down"
            data-testid="shift-die"
            data-value={dice.faces[i]}
            class:moved={dice.faces[i] !== dice.natural[i]}
            onclick={() => move(i, 1)}
            oncontextmenu={(e) => down(e, i)}
          >
            <DieFace value={dice.faces[i]} colour={COLOURS[i]} size={48} />
          </button>
          <button type="button" class="arrow" aria-label="{NAMES[i]} die down" disabled={!can(i, -1)} onclick={() => move(i, -1)}>▼</button>
        </div>
      {/each}
    </div>
    <p class="pool" data-testid="shift-left">Shift left: {Math.max(0, max - dice.spent)} of {max}</p>
    {#if shift.unknownShift}<p class="small">SH unknown: no Shift to spend</p>{/if}
    {#if locked(dice)}<p class="small">A natural double can't be shifted</p>{/if}
    {#if dice.spent > 0}<p class="small">Rolled {dice.natural[0]}-{dice.natural[1]}</p>{/if}
    <button type="button" class="again" onclick={() => shift.onchange(null)}>Roll again</button>
  </div>
{/if}

<style>
  .shifter {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }
  .dice {
    display: flex;
    gap: 14px;
  }
  .col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  button {
    font: inherit;
    color: var(--ink);
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 6px;
    cursor: pointer;
    touch-action: manipulation;
  }
  .arrow {
    width: 56px;
    min-height: 44px;
    font-size: 20px;
  }
  .arrow:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .die {
    display: inline-flex;
    min-width: 44px;
    min-height: 44px;
    align-items: center;
    justify-content: center;
    padding: 2px;
    border-color: transparent;
    background: none;
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
  }
  .die.moved {
    border-color: var(--accent);
    border-style: dashed;
  }
  .again {
    min-height: 44px;
    min-width: 44px;
    padding: 0 12px;
    font-size: 16px;
  }
  .pool {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
  }
  .small {
    margin: 0;
    font-size: 14px;
    color: var(--muted);
  }
  button:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
</style>
