<script lang="ts">
  import { freshDice, rollNote, type DiceState } from '../../systems/dungeon/shift';
  import DieFace from '../DieFace.svelte';
  import RollCard from '../RollCard.svelte';
  import type { DeskView, DiceJob } from '../diceDesk';
  import { useDiceDesk } from '../diceDeskContext';

  /**
   * The attack dice for one turn: a card hands the roll (or the typing) to the floating dice roller,
   * which also shifts the dice with the turn's Shift pool. The dice are UI state owned by the pane,
   * which drops them when the turn changes; the card stays registered for the whole turn.
   */
  interface Props {
    who: 'hero' | 'creature';
    /** The turn the dice belong to, for the roller job's id. */
    turnKey: string;
    /** The attacking creature's name, for the roller's "for" line. */
    foeName?: string;
    /** Points this attack may spend (0 or less: none). */
    pool: number;
    /** The creature's SH is not known, so there's no pool to spend. */
    unknownShift?: boolean;
    manoeuvres?: readonly { dice: readonly number[] }[];
    dice: DiceState | null;
    onchange: (s: DiceState | null) => void;
    /** The creature card's Mishap and Prime results, when the table file has them. */
    mishap?: string;
    prime?: string;
  }
  let { who, turnKey, foeName, pool, unknownShift = false, manoeuvres = [], dice, onchange, mishap, prime }: Props = $props();

  const desk = useDiceDesk();
  let view = $state.raw<DeskView | null>(desk ? desk.view : null);
  $effect(() => desk?.subscribe((v) => (view = v)));
  /** The roller is on these dice. A free roll or a closed roller leaves them behind. */
  const aimed = $derived(view?.open === true && view.target?.id === `attack:${turnKey}`);

  let error = $state<string | null>(null);
  const max = $derived(Math.max(0, pool));

  function show(values: number[]) {
    error = null;
    onchange(freshDice(values[0]!, values[1]!));
  }

  const job: DiceJob = $derived({
    id: `attack:${turnKey}`,
    kind: 'request',
    standing: true,
    label: who === 'hero' ? 'Your attack' : `${foeName ?? 'Creature'}'s attack`,
    dice: '2d6',
    modifier: null,
    rolled: (f) => show(f),
    enter: (raw) => {
      const vals = raw.map((v) => v.trim());
      if (!vals.every((v) => /^[1-6]$/.test(v))) {
        error = 'Type a number from 1 to 6 in each die.';
        return error;
      }
      show(vals.map(Number));
    },
    error,
    shift: { pool: max, unknownShift, state: dice, onchange },
  });

  const note = $derived.by(() => {
    if (!dice) return null;
    const n = rollNote(dice, who, manoeuvres);
    if (who === 'hero') {
      if (n === 'miss') return 'Double 1: always a miss';
      if (n === 'prime') return 'Prime Attack: pick any manoeuvre and add your Shift to the damage';
      if (n === 'exact') return 'Exact Strike: add your Shift to the damage';
      return null;
    }
    if (n === 'mishap') return `Mishap: ${mishap || 'see the bottom of its card'}`;
    if (n === 'prime') return `Prime Attack: ${prime || 'see the bottom of its card'} Armour can't deflect it.`;
    return null;
  });

  const COLOURS = ['red', 'blue'] as const;
</script>

<section class="turn-dice" aria-label="Attack dice" data-testid="turn-dice">
  <RollCard {job} done={dice !== null}>
    {#if dice}
      <div class="shown">
        <span class="faces">
          {#each [0, 1] as const as i (i)}
            <span data-testid="attack-die" data-value={dice.faces[i]} class:moved={dice.faces[i] !== dice.natural[i]}>
              <DieFace value={dice.faces[i]} colour={COLOURS[i]} size={40} />
            </span>
          {/each}
        </span>
        {#if desk && !aimed}
          <button type="button" class="back" onclick={() => desk.aimAt(`attack:${turnKey}`)}>Shift in the dice roller</button>
        {:else}
          <span class="small">Shift in the dice roller</span>
        {/if}
      </div>
    {/if}
  </RollCard>
  {#if note}<p class="note" role="status" data-testid="roll-note">{note}</p>{/if}
</section>

<style>
  .turn-dice {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .shown {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .faces {
    display: inline-flex;
    gap: 6px;
  }
  .faces .moved {
    outline: 2px dashed var(--accent);
    outline-offset: 2px;
  }
  .small {
    font-size: 14px;
    color: var(--muted);
  }
  .back {
    min-width: 44px;
    min-height: 44px;
    padding: 0 12px;
    font: inherit;
    color: var(--ink);
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 6px;
    cursor: pointer;
    touch-action: manipulation;
  }
  .back:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
  .note {
    margin: 0;
    padding: 6px 10px;
    font-size: 17px;
    font-weight: 600;
    background: #f1e3b8;
    border-left: 4px solid var(--ink);
  }
</style>
