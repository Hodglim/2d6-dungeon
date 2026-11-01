<script lang="ts">
  interface Props {
    error: string;
    /** Shown when an import was refused; the dialog stays open. */
    importError: string | null;
    canExport: boolean;
    onexport: () => void;
    onimport: () => void;
    onnew: () => void;
  }
  let { error, importError, canExport, onexport, onimport, onnew }: Props = $props();
</script>

<div class="scrim">
  <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="load-error-title">
    <h2 id="load-error-title">Your saved game couldn't be loaded</h2>
    <p>{error}</p>
    <p>Your saved game hasn't been changed. Export it first if you want to keep a copy.</p>
    {#if importError}<p class="error" role="alert">{importError}</p>{/if}
    <div class="actions">
      <button type="button" onclick={onexport} disabled={!canExport}>Export damaged save</button>
      <button type="button" onclick={onimport}>Import a file…</button>
      <button type="button" class="primary" onclick={onnew}>Start new game</button>
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
  p.error {
    color: var(--danger);
    font-size: 17px;
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
