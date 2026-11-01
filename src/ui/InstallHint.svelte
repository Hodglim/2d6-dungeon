<script lang="ts">
  interface Props {
    ios: boolean;
    /** Show the "move this game" line and Export button. */
    hasGame: boolean;
    onexport: () => void;
    ondismiss: () => void;
  }
  let { ios, hasGame, onexport, ondismiss }: Props = $props();
</script>

<div class="hint" role="region" aria-label="Install the app">
  <div class="text">
    {#if ios}
      <span>Progress in a Safari tab may not be kept — Safari can clear it after 7 days. Add this app to your Home Screen (Share → Add to Home Screen); the installed app keeps its own saved game.</span>
    {:else}
      <span>Progress in a browser tab may not be kept. Install this app (use your browser's Install or Add to Home Screen option); the installed app keeps its own saved game.</span>
    {/if}
    {#if hasGame}
      <span class="move">Move this game into the installed app: Export it here, then Import it there</span>
    {/if}
  </div>
  {#if hasGame}<button type="button" onclick={onexport}>Export</button>{/if}
  <button type="button" onclick={ondismiss}>Dismiss</button>
</div>

<style>
  .hint {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 12px;
    font-size: 16px;
    line-height: 1.3;
    background: var(--paper-dim);
    border-bottom: 1px solid var(--rule);
  }
  .text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .move {
    font-weight: 600;
  }
  button {
    min-width: 96px;
    min-height: 44px;
    padding: 0 16px;
    font: inherit;
    font-size: 17px;
    color: var(--ink);
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 6px;
    cursor: pointer;
  }
</style>
