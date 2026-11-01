<script lang="ts">
  interface Props {
    title: string;
    message?: string;
    /** Runs the export and keeps this dialog open. Omit it to hide the Export first button. */
    onexport?: () => void;
    onreplace: () => void;
    oncancel: () => void;
  }
  let { title, message = 'This replaces your current game.', onexport, onreplace, oncancel }: Props = $props();
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && oncancel()} />

<div class="scrim">
  <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="replace-title">
    <h2 id="replace-title">{title}</h2>
    <p>{message}</p>
    <div class="actions">
      <button type="button" onclick={oncancel}>Cancel</button>
      {#if onexport}<button type="button" onclick={onexport}>Export first</button>{/if}
      <button type="button" class="primary" onclick={onreplace}>Replace</button>
    </div>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(20, 16, 10, 0.45);
  }
  .dialog {
    width: min(460px, 100%);
    max-height: 100%;
    overflow: auto;
    padding: 20px 22px;
    background: var(--paper);
    color: var(--ink);
    border: 2px solid var(--ink);
    border-radius: 8px;
  }
  h2 {
    margin: 0 0 10px;
    font-size: 24px;
  }
  p {
    margin: 0 0 16px;
    font-size: 19px;
    line-height: 1.4;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 10px;
  }
  button {
    min-width: 96px;
    min-height: 48px;
    padding: 0 18px;
    font: inherit;
    font-size: 18px;
    color: var(--ink);
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 6px;
    cursor: pointer;
  }
  button.primary {
    color: var(--paper);
    background: var(--ink);
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
