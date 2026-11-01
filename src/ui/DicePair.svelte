<script lang="ts">
  interface Props {
    /** Faces in printed order: the first is red (primary), the second blue (secondary). */
    dice: number[];
  }
  let { dice }: Props = $props();
</script>

<span class="pair" role="img" aria-label={dice.map((d, i) => `${i === 0 ? 'red' : 'blue'} ${d}`).join(', ')}>
  {#each dice as face, i (i)}
    <span class="die" class:red={i === 0} class:blue={i !== 0} aria-hidden="true">{face}</span>
  {/each}
</span>

<style>
  .pair {
    display: inline-flex;
    gap: 6px;
  }
  .die {
    display: inline-grid;
    place-items: center;
    width: 36px;
    height: 36px;
    box-sizing: border-box;
    font-size: 22px;
    font-weight: 700;
    border-radius: 8px;
    border: 3px solid;
    color: var(--ink);
  }
  .red {
    border-color: #b3261e;
    background: #fbeceb;
  }
  .blue {
    border-color: #1f5fae;
    background: #eaf1fb;
  }
</style>
