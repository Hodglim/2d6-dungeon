<script lang="ts">
  interface Props {
    heroName: string;
    onconfirm: () => void;
    oncancel: () => void;
  }
  let { heroName, onconfirm, oncancel }: Props = $props();

  let cancel = $state<HTMLButtonElement>();
  $effect(() => cancel?.focus());
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && oncancel()} />

<div class="scrim">
  <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="death-title" aria-describedby="death-text">
    <h2 id="death-title">Your hero has fallen: confirm their death?</h2>
    <p id="death-text">{heroName} is at 0 HP or below. Confirming ends the game; it can't be undone. Cancel leaves everything as it is.</p>
    <div class="actions">
      <button type="button" bind:this={cancel} onclick={oncancel}>Cancel</button>
      <button type="button" class="primary" onclick={onconfirm}>Confirm death</button>
    </div>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 35;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(20, 16, 10, 0.55);
  }
  .dialog {
    width: min(480px, 100%);
    max-height: 100%;
    overflow: auto;
    padding: 20px 22px;
    background: var(--paper);
    color: var(--ink);
    border: 2px solid var(--danger);
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
    touch-action: manipulation;
  }
  button.primary {
    color: var(--paper);
    background: var(--danger);
    border-color: var(--danger);
  }
</style>
