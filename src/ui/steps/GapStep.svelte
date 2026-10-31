<script lang="ts">
  import type { ExecResult } from '../../core/history';
  import type { PlayFlow, Step } from '../../interaction/playflow';

  interface Props {
    flow: PlayFlow;
    step: Extract<Step, { kind: 'gap' }>;
    oncommit: (run: () => ExecResult | null) => void;
  }

  let { flow, step, oncommit }: Props = $props();
</script>

<h2>Fill gap with corridor</h2>
<p>A 1-wide corridor straight out of the exit. Set its length, then place it.</p>
<div class="row length">
  <button aria-label="Shorter" disabled={step.length <= 1} onclick={() => flow.setGapLength(step.length - 1)}>−</button>
  <output aria-label="Length">{step.length}</output>
  <button aria-label="Longer" disabled={step.length >= step.maxLength} onclick={() => flow.setGapLength(step.length + 1)}>+</button>
</div>
{#if !step.rect}
  <p class="error" role="alert">The corridor doesn't fit there</p>
{/if}
<div class="row">
  <button class="primary" disabled={!step.rect} onclick={() => oncommit(() => flow.placeGap())}>Place</button>
</div>

<style>
  .length output {
    min-width: 56px;
    display: grid;
    place-items: center;
    font-size: 28px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
</style>
