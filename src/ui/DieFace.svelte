<script lang="ts">
  interface Props {
    /** Face value 1-6. */
    value: number;
    /** red is the primary die, blue the secondary. */
    colour: 'red' | 'blue';
    /** Side length in px (default 36). */
    size?: number;
  }
  let { value, colour, size = 36 }: Props = $props();

  const L = 8;
  const M = 15;
  const R = 22;
  const LAYOUTS: Record<number, [number, number][]> = {
    1: [[M, M]],
    2: [[R, L], [L, R]],
    3: [[R, L], [M, M], [L, R]],
    4: [[L, L], [R, L], [L, R], [R, R]],
    5: [[L, L], [R, L], [M, M], [L, R], [R, R]],
    6: [[L, L], [R, L], [L, M], [R, M], [L, R], [R, R]],
  };
  const pips = $derived(LAYOUTS[value] ?? []);
</script>

<span class="die {colour}" role="img" aria-label="{colour} {value}" style:width="{size}px" style:height="{size}px">
  <svg viewBox="0 0 30 30" aria-hidden="true" focusable="false">
    {#each pips as [x, y], i (i)}<circle cx={x} cy={y} r="3.1" />{/each}
  </svg>
</span>

<style>
  .die {
    display: inline-block;
    width: 36px;
    height: 36px;
    box-sizing: border-box;
    border-radius: 8px;
    border: 3px solid;
    flex: none;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .red {
    border-color: #b3261e;
    background: #fbeceb;
    color: #b3261e;
  }
  .blue {
    border-color: #1f5fae;
    background: #eaf1fb;
    color: #1f5fae;
  }
  circle {
    fill: var(--ink, #222);
  }
</style>
