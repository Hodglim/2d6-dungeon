<script lang="ts">
  import type { PlayFlow, Step } from '../../interaction/playflow';
  import DiceEntry from '../DiceEntry.svelte';

  interface Props {
    flow: PlayFlow;
    step: Extract<Step, { kind: 'size' }>;
  }

  let { flow, step }: Props = $props();
</script>

<h2>{step.source.kind === 'entrance' ? 'Entrance room size' : 'Room size'}</h2>
{#if step.needsSecond && step.first}
  <p class="double">
    Double {step.first.primary}–{step.first.secondary}! Roll again — the second pair is added on.
  </p>
{:else}
  <p>Roll the red and blue dice, then type them in — or let the app roll.</p>
{/if}
{#key step.first}
  <DiceEntry
    dice="d66"
    error={step.error}
    onenter={([p, s]) => flow.enterSize(p ?? '', s ?? '')}
    onroll={() => {
      const d = flow.rollSizeDice();
      return d ? [d.primary, d.secondary] : [];
    }}
    onrolled={([p, s]) => p !== undefined && s !== undefined && flow.applyRolledSize({ primary: p, secondary: s })}
  />
{/key}
