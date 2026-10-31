<script lang="ts">
  import type { PlayFlow, Step } from '../../interaction/playflow';
  import DiceEntry from '../DiceEntry.svelte';

  interface Props {
    flow: PlayFlow;
    step: Extract<Step, { kind: 'exitCount' }>;
  }

  let { flow, step }: Props = $props();
</script>

<h2>Number of exits</h2>
<p>Roll a D6: 1 → none · 2–3 → one · 4–5 → two · 6 → three.</p>
<DiceEntry dice="d6" label="Exits D6" error={step.error} enterLabel="Use this" onenter={([v]) => flow.enterExitCount(v ?? '')} onroll={() => flow.rollExitCount()} />
