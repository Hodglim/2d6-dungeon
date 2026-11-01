<script lang="ts">
  interface Props {
    label: string;
    filled: number;
    total: number;
    onset: (n: number) => void;
  }
  let { label, filled, total, onset }: Props = $props();
</script>

<div class="boxes" role="group" aria-label={label}>
  {#each { length: total } as _, i (i)}
    <button
      class="box"
      class:on={i < filled}
      aria-pressed={i < filled}
      aria-label="{label} box {i + 1}"
      onclick={() => onset(filled === i + 1 ? i : i + 1)}
    ></button>
  {/each}
</div>

<style>
  .boxes {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .box {
    width: 44px;
    height: 44px;
    min-width: 44px;
    padding: 0;
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 6px;
    cursor: pointer;
    touch-action: manipulation;
  }
  .box.on {
    background: var(--ink);
  }
</style>
