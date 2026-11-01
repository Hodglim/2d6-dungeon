<script lang="ts">
  interface Props {
    onexport: () => void;
  }
  let { onexport }: Props = $props();
</script>

<div class="banner" role="alert">
  <span>Autosave isn't working — export your game to keep a copy</span>
  <button type="button" onclick={onexport}>Export</button>
</div>

<style>
  .banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 6px 12px;
    font-size: 17px;
    color: #fff;
    background: var(--danger);
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
