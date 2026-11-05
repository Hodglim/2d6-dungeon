<script lang="ts">
  import type { ExecResult } from '../../core/history';
  import type { PlayFlow, Step } from '../../interaction/playflow';
  import { parseDie } from '../../systems/dungeon/rules';
  import RollCard from '../RollCard.svelte';
  import type { DiceJob } from '../diceDesk';

  interface Props {
    flow: PlayFlow;
    step: Extract<Step, { kind: 'exits' }>;
    /** Runs a committing call (doneExits commits a corridor) so the shell can animate it. */
    oncommit: (run: () => ExecResult | null) => void;
  }

  let { flow, step, oncommit }: Props = $props();

  let dieError = $state<string | null>(null);
  const remaining = $derived(step.count - step.chosen.length);
  const corridor = $derived(step.draft.kindOf === 'corridor');
  const entrance = $derived(step.draft.source.kind === 'entrance');

  function placeTyped(v: string): string | null {
    const d = parseDie(v);
    if (d === null) {
      dieError = 'Enter a whole number from 1 to 6';
      return dieError;
    }
    dieError = null;
    flow.placeExitsForMe(d);
    return null;
  }

  const job: DiceJob = $derived({
    id: `exit-place:${step.chosen.length}`,
    kind: 'request',
    label: 'First wall',
    dice: 'd6',
    modifier: null,
    roll: () => [flow.rollDie()],
    rolled: ([v]) => {
      if (v !== undefined) flow.placeExitsForMe(v);
    },
    enter: ([v]) => placeTyped(v ?? ''),
    error: dieError,
  });
</script>

<h2>{corridor ? 'Corridor exits' : 'Place exits'}</h2>
{#if step.count === 0}
  <p>This corridor has no exits.</p>
{:else}
  <p>
    {#if remaining > 0}
      Place <strong>{remaining}</strong> more {remaining === 1 ? 'exit' : 'exits'} — tap a highlighted wall, or let the app place them clockwise.
    {:else}
      All {step.count} {step.count === 1 ? 'exit' : 'exits'} placed{entrance ? ' (the entrance room always has 3)' : ''}. Tap a green exit to take it back.
    {/if}
  </p>
  {#if step.dropped > 0}
    <p class="warn">{step.dropped} {step.dropped === 1 ? "exit couldn't" : "exits couldn't"} be placed</p>
  {/if}
  {#if remaining > 0}
    {#key step.chosen.length}
      <RollCard {job} />
    {/key}
  {/if}
{/if}
{#if step.error}<p class="error" role="alert">{step.error}</p>{/if}
<div class="row">
  <button class="primary" onclick={() => oncommit(() => flow.doneExits())}>{corridor ? 'Place corridor' : 'Done'}</button>
</div>
