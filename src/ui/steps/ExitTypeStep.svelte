<script lang="ts">
  import type { PlayFlow, Step } from '../../interaction/playflow';
  import type { Theme } from '../../render/theme';
  import { dungeonSystem } from '../../systems/dungeon';
  import { classicTheme } from '../../systems/dungeon/classic';

  interface Props {
    flow: PlayFlow;
    step: Extract<Step, { kind: 'exitType' }>;
  }

  let { flow, step }: Props = $props();

  const SIZE = 44;

  /** Draws a door symbol (as the map does) in a short stretch of wall. */
  function symbol(canvas: HTMLCanvasElement, type: string) {
    const theme: Theme = classicTheme;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const unit = SIZE * 0.6 * dpr;
    ctx.setTransform(unit, 0, 0, unit, (SIZE * dpr) / 2, (SIZE * dpr) / 2);
    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = theme.wallWidth;
    ctx.beginPath();
    ctx.moveTo(-0.85, 0);
    ctx.lineTo(-0.5, 0);
    ctx.moveTo(0.5, 0);
    ctx.lineTo(0.85, 0);
    ctx.stroke();
    ctx.save();
    (theme.doorSymbols[type] ?? theme.doorSymbols.archway)?.(ctx, theme);
    ctx.restore();
  }
</script>

<h2>Exit type</h2>
<p>Pick the type for {step.count === 1 ? 'the exit' : `all ${step.count} exits`}.</p>
<div class="types">
  {#each dungeonSystem.doorTypes as t (t.id)}
    <button class="type" onclick={() => flow.chooseExitType(t.id)}>
      <canvas use:symbol={t.id} style="width: {SIZE}px; height: {SIZE}px" aria-hidden="true"></canvas>
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
