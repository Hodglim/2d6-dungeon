<script lang="ts">
  import DieFace from './DieFace.svelte';

  interface Props {
    /** Faces in printed order: the first is red (primary), the second blue (secondary). */
    dice: number[];
  }
  let { dice }: Props = $props();
</script>

<span class="pair">
  {#each dice as face, i (i)}
    <DieFace value={face} colour={i === 0 ? 'red' : 'blue'} />
  {/each}
</span>

<style>
  .pair {
    display: inline-flex;
    gap: 6px;
  }
</style>
