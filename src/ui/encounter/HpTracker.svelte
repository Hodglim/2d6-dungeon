<script lang="ts">
  import { tick } from 'svelte';

  interface Props {
    /** Whose HP this is, for the button labels ("Grumbler HP down"). */
    name: string;
    value: number;
    /** A − or + tap: the caller merges quick repeats into one step. */
    onstep: (d: number) => void;
    /** A typed whole number. */
    onset: (n: number) => void;
  }
  let { name, value, onstep, onset }: Props = $props();

  let editing = $state(false);
  let text = $state('');
  let input = $state<HTMLInputElement>();
  let numBtn = $state<HTMLButtonElement>();

  async function startEdit() {
    text = String(value);
    editing = true;
    await tick();
    input?.focus();
    input?.select();
  }

  /** Whole numbers only; anything else is ignored. */
  function finish(keep: boolean) {
    if (!editing) return;
    editing = false;
    const t = text.trim();
    if (keep && /^-?\d+$/.test(t) && Number(t) !== value) onset(Number(t));
    void tick().then(() => numBtn?.focus());
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      finish(false);
    }
  }
</script>

<div class="hp" role="group" aria-label="{name} HP">
  <button class="step" aria-label="{name} HP down" onclick={() => onstep(-1)}>−</button>
  {#if editing}
    <input
      bind:this={input}
      bind:value={text}
      type="text"
      inputmode="numeric"
      autocomplete="off"
      aria-label="{name} HP"
      onkeydown={onKey}
      onblur={() => finish(true)}
    />
  {:else}
    <button class="num" bind:this={numBtn} aria-label="{name} HP {value}, tap to type" onclick={startEdit}>{value}</button>
  {/if}
  <button class="step" aria-label="{name} HP up" onclick={() => onstep(1)}>+</button>
</div>

<style>
  .hp {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  button,
  input {
    box-sizing: border-box;
    min-height: 56px;
    font: inherit;
    color: var(--ink);
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 8px;
    touch-action: manipulation;
  }
  button {
    cursor: pointer;
  }
  .step {
    min-width: 56px;
    font-size: 30px;
    font-weight: 700;
    line-height: 1;
  }
  .num,
  input {
    width: 76px;
    font-size: 28px;
    font-weight: 700;
    text-align: center;
    background: var(--paper-dim);
    border-color: var(--rule);
  }
  :focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
</style>
