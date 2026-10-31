<script lang="ts">
  import type { PlayFlow, Step } from '../../interaction/playflow';
  import { dungeonSystem } from '../../systems/dungeon';
  import { doorSymbol, SYMBOL_SIZE } from '../doorSymbol';

  interface Props {
    flow: PlayFlow;
    step: Extract<Step, { kind: 'exitType' }>;
  }

  let { flow, step }: Props = $props();
</script>

<h2>Exit type</h2>
<p>Pick the type for {step.count === 1 ? 'the exit' : `all ${step.count} exits`}.</p>
<div class="types">
  {#each dungeonSystem.doorTypes as t (t.id)}
    <button class="type" onclick={() => flow.chooseExitType(t.id)}>
      <canvas use:doorSymbol={t.id} style="width: {SYMBOL_SIZE}px; height: {SYMBOL_SIZE}px" aria-hidden="true"></canvas>
      <span>{t.name}</span>
    </button>
  {/each}
</div>

<style>
  .types {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px;
  }
  .type {
    display: flex;
    align-items: center;
    gap: 8px;
    text-align: left;
    padding: 2px 10px 2px 4px !important;
  }
  canvas {
    flex: none;
    background: #f7f2e7;
    border-radius: 4px;
  }
</style>
