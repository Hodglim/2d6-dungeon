<script lang="ts">
  import type { PlayFlow, Step } from '../../interaction/playflow';
  import { classify } from '../../systems/dungeon/rules';

  interface Props {
    flow: PlayFlow;
    step: Extract<Step, { kind: 'position' }>;
  }

  let { flow, step }: Props = $props();

  const rect = $derived(step.placement.rect);
  const cls = $derived(step.source.kind === 'entrance' ? 'entrance' : rect ? classify(rect, step.size) : step.size.corridor ? 'corridor' : 'normal');
  /** Rooms slide along the wall the exit is in: sideways for a horizontal wall, up/down otherwise. */
  const horizontal = $derived(
    step.source.kind === 'entrance' || flow.draftMap.doors.find((d) => step.source.kind === 'exit' && d.id === step.source.doorId)?.side === 'N',
  );
  const resized = $derived(rect !== null && (rect.w !== step.size.w || rect.h !== step.size.h));
</script>

<h2>Position</h2>
<p class="size">
  Rolled <strong>{step.size.w} × {step.size.h}</strong>{#if step.size.doubled}&nbsp;(doubled){/if}
  <span class="badge {cls}">{cls}</span>
</p>
{#if step.size.corridor && step.source.kind !== 'entrance'}
  <p>A corridor!</p>
{/if}
{#if resized && rect}
  <p>Final size <strong>{rect.w} × {rect.h}</strong>{step.placement.clipped ? ' (clipped at the edge)' : ''}</p>
{/if}
<p>Drag on the map, or tap it, to slide the room along the wall.</p>
{#if !step.placement.ok}
  <p class="error" role="alert">{step.placement.reason ?? 'It does not fit here'}</p>
{/if}
<div class="row">
  <button aria-label={horizontal ? 'Slide left' : 'Slide up'} onclick={() => flow.slide(step.offset + 1)}>{horizontal ? '◀' : '▲'}</button>
  <button aria-label={horizontal ? 'Slide right' : 'Slide down'} onclick={() => flow.slide(step.offset - 1)}>{horizontal ? '▶' : '▼'}</button>
</div>
<div class="row">
  {#if step.canShrink}
    <button onclick={() => flow.shrink()}>Shrink to fit</button>
  {/if}
  <button class="primary" disabled={!step.placement.ok} onclick={() => flow.place()}>Place</button>
</div>
