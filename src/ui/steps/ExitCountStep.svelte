<script lang="ts">
  import type { PlayFlow, Step } from '../../interaction/playflow';
  import RollCard from '../RollCard.svelte';
  import type { DiceJob } from '../diceDesk';

  interface Props {
    flow: PlayFlow;
    step: Extract<Step, { kind: 'exitCount' }>;
  }

  let { flow, step }: Props = $props();

  const job: DiceJob = $derived({
    id: 'exits-count',
    kind: 'request',
    label: 'Exits',
    dice: 'd6',
    modifier: null,
    roll: () => [flow.rollDie()],
    rolled: ([v]) => {
      if (v !== undefined) flow.applyRolledExitCount(v);
    },
    enter: ([v]) => {
      flow.enterExitCount(v ?? '');
    },
    error: step.error,
  });
</script>

<h2>Number of exits</h2>
<p>Roll a D6: 1 → none · 2–3 → one · 4–5 → two · 6 → three.</p>
<RollCard {job} />
