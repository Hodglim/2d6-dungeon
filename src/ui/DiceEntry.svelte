<script lang="ts">
  interface Props {
    /** Two dice (red = primary/width, blue = secondary/height) or a single D6. */
    dice: 'd66' | 'd6';
    /** Label for the single die (d6 mode). */
    label?: string;
    error?: string | null;
    enterLabel?: string;
    rollLabel?: string;
    onenter: (values: string[]) => void;
    onroll: () => void;
  }

  let { dice, label = 'D6', error = null, enterLabel = 'Use these', rollLabel = '🎲 Roll for me', onenter, onroll }: Props = $props();

  let red = $state('');
  let blue = $state('');
  let blueInput = $state<HTMLInputElement>();

  function submit(e: SubmitEvent) {
    e.preventDefault();
    onenter(dice === 'd66' ? [red, blue] : [red]);
  }

  /** Typing one digit in the red die moves on to the blue one. */
  function onRedInput() {
    if (dice === 'd66' && /^[1-6]$/.test(red.trim())) blueInput?.focus();
  }
</script>

<form class="dice" onsubmit={submit}>
  <div class="inputs">
    <label class="die red">
      <span>{dice === 'd66' ? 'Red · width' : label}</span>
      <input type="text" inputmode="numeric" autocomplete="off" maxlength="3" bind:value={red} oninput={onRedInput} aria-label={dice === 'd66' ? 'Red die (width)' : label} />
    </label>
    {#if dice === 'd66'}
      <label class="die blue">
        <span>Blue · height</span>
        <input type="text" inputmode="numeric" autocomplete="off" maxlength="3" bind:value={blue} bind:this={blueInput} aria-label="Blue die (height)" />
      </label>
    {/if}
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <div class="buttons">
    <button type="submit" class="primary">{enterLabel}</button>
    <button type="button" onclick={onroll}>{rollLabel}</button>
  </div>
</form>

<style>
  .dice {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .inputs {
    display: flex;
    gap: 12px;
  }
  .die {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    font-size: 15px;
    font-weight: 600;
  }
  input {
    width: 76px;
    height: 76px;
    box-sizing: border-box;
    font: inherit;
    font-size: 40px;
    font-weight: 700;
    text-align: center;
    border-radius: 12px;
    border: 3px solid;
    background: #fff;
    color: var(--ink);
  }
  .red input {
    border-color: #b3261e;
    background: #fbeceb;
  }
  .blue input {
    border-color: #1f5fae;
    background: #eaf1fb;
  }
  input:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
  .error {
    margin: 0;
    color: var(--danger);
    font-size: 17px;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  button {
    min-height: 48px;
    min-width: 48px;
    padding: 0 16px;
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
    background: var(--ink);
  }
</style>
