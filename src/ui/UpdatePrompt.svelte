<script lang="ts">
  import { onMount } from 'svelte';
  import { applyUpdate, onUpdateWaiting } from '../pwa/register';

  let available = $state(false);
  onMount(() => onUpdateWaiting((w) => (available = w !== null)));
</script>

{#if available}
  <div class="update" role="status">
    <span>New version available — reload</span>
    <button type="button" onclick={applyUpdate}>Reload</button>
  </div>
{/if}

<style>
  .update {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 12px;
    font-size: 16px;
    background: var(--paper-dim);
    border-bottom: 1px solid var(--rule);
  }
  .update span {
    flex: 1;
  }
  button {
    min-height: 44px;
    min-width: 44px;
    padding: 0 16px;
    font: inherit;
  }
</style>
