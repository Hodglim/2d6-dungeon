<script lang="ts">
  // An armour dice set: each group's primary (red) and secondary (blue) die, with "+" between groups.
  import { armourGroups, formatDiceSet } from '../systems/dungeon/armour';
  import DieFace from './DieFace.svelte';

  interface Props {
    dice: readonly number[];
    size?: number;
  }
  let { dice, size = 28 }: Props = $props();
  const groups = $derived(armourGroups(dice));
</script>

<span class="set" role="img" aria-label="Dice set {formatDiceSet(dice)}">
  {#each groups as g, i (i)}
    {#if i > 0}<span class="plus" aria-hidden="true">+</span>{/if}
    {#each g as d, j (j)}<DieFace value={d} colour={j === 0 ? 'red' : 'blue'} {size} />{/each}
  {/each}
</span>

<style>
  .set {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .plus {
    font-weight: 700;
    color: var(--muted);
  }
</style>
