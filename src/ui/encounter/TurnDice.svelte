<script lang="ts">
  import { freshDice, locked, rollNote, shiftDie, type DiceState } from '../../systems/dungeon/shift';
  import DiceEntry from '../DiceEntry.svelte';
  import DieFace from '../DieFace.svelte';

  /**
   * The attack dice for one turn: roll (or type) red and blue, then spend the turn's Shift pool
   * moving them. The dice are UI state owned by the pane, which drops them when the turn changes.
   */
  interface Props {
    who: 'hero' | 'creature';
    /** Points this attack may spend (0 or less: none). */
    pool: number;
    /** The creature's SH is not known, so there's no pool to spend. */
    unknownShift?: boolean;
    manoeuvres?: readonly { dice: readonly number[] }[];
    dice: DiceState | null;
    onchange: (s: DiceState | null) => void;
  }
  let { who, pool, unknownShift = false, manoeuvres = [], dice, onchange }: Props = $props();

  let error = $state<string | null>(null);
  const d6 = () => Math.floor(Math.random() * 6) + 1;
  const max = $derived(Math.max(0, pool));

  function show(values: number[]) {
    error = null;
    onchange(freshDice(values[0]!, values[1]!));
  }

  function enter(raw: string[]) {
    const vals = raw.map((v) => v.trim());
    if (!vals.every((v) => /^[1-6]$/.test(v))) {
      error = 'Type a number from 1 to 6 in each die.';
      return;
    }
    show(vals.map(Number));
  }

  function move(i: 0 | 1, d: 1 | -1) {
    if (!dice) return;
    const next = shiftDie(dice, i, d, max);
    if (next !== dice) onchange(next);
  }
  const can = (i: 0 | 1, d: 1 | -1) => dice !== null && shiftDie(dice, i, d, max) !== dice;

  function down(e: MouseEvent, i: 0 | 1) {
    e.preventDefault();
    move(i, -1);
  }

  const note = $derived.by(() => {
    if (!dice) return null;
    const n = rollNote(dice, who, manoeuvres);
    if (who === 'hero') {
      if (n === 'miss') return 'Double 1: always a miss';
      if (n === 'prime') return 'Prime Attack: pick any manoeuvre and add your Shift to the damage';
      if (n === 'exact') return 'Exact Strike: add your Shift to the damage';
      return null;
    }
    if (n === 'mishap') return 'Mishap: see the bottom of its card';
    if (n === 'prime') return 'Prime Attack: see the bottom of its card';
    return null;
  });

  const NAMES = ['Red', 'Blue'] as const;
  const COLOURS = ['red', 'blue'] as const;
</script>

<section class="turn-dice" aria-label="Attack dice" data-testid="turn-dice">
  {#if !dice}
    <DiceEntry dice="2d6" labels={['Red', 'Blue']} {error} enterLabel="Use these" rollLabel="🎲 Roll" onenter={enter} onroll={() => [d6(), d6()]} onrolled={show} />
  {:else}
    <div class="shifter">
      {#each [0, 1] as const as i (i)}
        <div class="col">
          <button class="arrow" aria-label="{NAMES[i]} die up" disabled={!can(i, 1)} onclick={() => move(i, 1)}>▲</button>
          <button
            class="die"
            aria-label="{NAMES[i]} die {dice.faces[i]}: click to shift up, right-click to shift down"
            data-testid="attack-die"
            data-value={dice.faces[i]}
            class:moved={dice.faces[i] !== dice.natural[i]}
            onclick={() => move(i, 1)}
            oncontextmenu={(e) => down(e, i)}
          >
            <DieFace value={dice.faces[i]} colour={COLOURS[i]} size={64} />
          </button>
          <button class="arrow" aria-label="{NAMES[i]} die down" disabled={!can(i, -1)} onclick={() => move(i, -1)}>▼</button>
        </div>
      {/each}
      <div class="side">
        <p class="pool" data-testid="shift-left">Shift left: {Math.max(0, max - dice.spent)} of {max}</p>
        {#if unknownShift}<p class="small">SH unknown: no Shift to spend</p>{/if}
        {#if locked(dice)}<p class="small">A natural double can't be shifted</p>{/if}
        {#if dice.spent > 0}<p class="small">Rolled {dice.natural[0]}-{dice.natural[1]}</p>{/if}
        <button class="again" onclick={() => onchange(null)}>Roll again</button>
      </div>
    </div>
    {#if note}<p class="note" role="status" data-testid="roll-note">{note}</p>{/if}
  {/if}
</section>

<style>
  .turn-dice {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .shifter {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }
  .side {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
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
    width: 64px;
    min-height: 44px;
    font-size: 20px;
  }
  .arrow:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .die {
    display: inline-flex;
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
    font-size: 19px;
    font-weight: 700;
  }
  .small {
    margin: 0;
    font-size: 14px;
    color: var(--muted);
  }
  .note {
    margin: 0;
    padding: 6px 10px;
    font-size: 17px;
    font-weight: 600;
    background: #f1e3b8;
    border-left: 4px solid var(--ink);
  }
  :focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
</style>
