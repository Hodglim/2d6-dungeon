<script lang="ts">
  import { onDestroy } from 'svelte';
  import DieFace from './DieFace.svelte';
  import { animateRoll } from './rollAnimation';
  import { unlockAudio } from './sound';

  interface Props {
    /** Two dice (d66: red = width, blue = height; 2d6: two dice that are added) or a single D6 or D3 (a D6 read in halves: the face is 1–6). */
    dice: 'd66' | '2d6' | 'd6' | 'd3';
    /** Names of the red and blue dice, when not the size ones. */
    labels?: [string, string];
    /** Label for the single die (d6 and d3 modes). */
    label?: string;
    error?: string | null;
    enterLabel?: string;
    rollLabel?: string;
    onenter: (values: string[]) => void;
    /** Rolls the real values (red first) without applying them yet. */
    onroll: () => number[];
    /** Called with those values once the roll animation has settled. */
    onrolled: (values: number[]) => void;
  }

  let { dice, labels, label = 'D6', error = null, enterLabel = 'Use these', rollLabel = '🎲 Roll for me', onenter, onroll, onrolled }: Props = $props();

  let red = $state('');
  let blue = $state('');
  let blueInput = $state<HTMLInputElement>();

  /** Faces shown while rolling; null when not rolling. */
  let faces = $state<number[] | null>(null);
  let cancelRoll: (() => void) | null = null;
  onDestroy(() => cancelRoll?.());

  const single = $derived(dice === 'd6' || dice === 'd3');

  function roll() {
    if (faces !== null) return;
    unlockAudio();
    const finals = onroll();
    faces = [...finals];
    cancelRoll = animateRoll(finals, 6, {
      faces: (f) => (faces = f),
      land: () => {},
      done: () => {
        cancelRoll = null;
        onrolled(finals);
      },
    });
  }

  const rolling = $derived(faces !== null);
  const redName = $derived(labels?.[0] ?? (dice === 'd66' ? 'Red · width' : dice === '2d6' ? 'Die 1' : label));
  const blueName = $derived(labels?.[1] ?? (dice === 'd66' ? 'Blue · height' : 'Die 2'));
  const redAria = $derived(labels ? `${labels[0]} die` : dice === 'd66' ? 'Red die (width)' : dice === '2d6' ? 'First die' : label);
  const blueAria = $derived(labels ? `${labels[1]} die` : dice === 'd66' ? 'Blue die (height)' : 'Second die');

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (rolling) return;
    onenter(single ? [red] : [red, blue]);
  }

  /** Typing one digit in the red die moves on to the blue one. */
  function onRedInput() {
    if (!single && /^[1-6]$/.test(red.trim())) blueInput?.focus();
  }
</script>

<form class="dice" onsubmit={submit}>
  <div class="inputs">
    <label class="die red">
      <span>{redName}</span>
      <input type="text" inputmode="numeric" autocomplete="off" maxlength="3" bind:value={red} oninput={onRedInput} disabled={rolling} class:hidden={rolling} aria-label={redAria} />
      {#if faces}<span class="face"><DieFace value={faces[0] ?? 1} colour="red" size={76} /></span>{/if}
    </label>
    {#if !single}
      <label class="die blue">
        <span>{blueName}</span>
        <input type="text" inputmode="numeric" autocomplete="off" maxlength="3" bind:value={blue} bind:this={blueInput} disabled={rolling} class:hidden={rolling} aria-label={blueAria} />
        {#if faces}<span class="face"><DieFace value={faces[1] ?? 1} colour="blue" size={76} /></span>{/if}
      </label>
    {/if}
  </div>
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <div class="buttons">
    <button type="submit" class="primary" disabled={rolling}>{enterLabel}</button>
    <button type="button" disabled={rolling} onclick={roll}>{rollLabel}</button>
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
  input.hidden {
    display: none;
  }
  .face {
    display: inline-flex;
  }
  button:disabled {
    opacity: 0.6;
    cursor: default;
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
