<script lang="ts">
  import type { PlayFlow, Step } from '../../interaction/playflow';
  import RollCard from '../RollCard.svelte';
  import type { DiceJob } from '../diceDesk';

  interface Props {
    flow: PlayFlow;
    step: Extract<Step, { kind: 'size' }>;
  }

  let { flow, step }: Props = $props();

  const job: DiceJob = $derived({
    id: `room-size:${step.first ? 2 : 1}`,
    kind: 'request',
    label: step.first ? 'Room size, second pair' : 'Room size',
    dice: 'd66',
    modifier: null,
    roll: () => {
      const d = flow.rollSizeDice();
      return d ? [d.primary, d.secondary] : [];
    },
    rolled: ([p, s]) => {
      if (p !== undefined && s !== undefined) flow.applyRolledSize({ primary: p, secondary: s });
    },
    enter: ([p, s]) => {
      flow.enterSize(p ?? '', s ?? '');
    },
    error: step.error,
  });
</script>

<h2>{step.source.kind === 'entrance' ? 'Entrance room size' : 'Room size'}</h2>
{#if step.needsSecond && step.first}
  <p class="double">
    Double {step.first.primary}–{step.first.secondary}! Roll again — the second pair is added on.
  </p>
{:else}
  <p>Roll the red and blue dice in the dice roller — or type your own there.</p>
{/if}
{#key step.first}
  <RollCard {job} />
{/key}
