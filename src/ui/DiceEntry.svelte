<script lang="ts">
  import { onDestroy } from 'svelte';
  import DieFace from './DieFace.svelte';
  import { playClack, playTick, unlockAudio } from './sound';

  interface Props {
    /** Two dice (red = primary/width, blue = secondary/height) or a single D6. */
    dice: 'd66' | 'd6';
    /** Label for the single die (d6 mode). */
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

  let { dice, label = 'D6', error = null, enterLabel = 'Use these', rollLabel = '🎲 Roll for me', onenter, onroll, onrolled }: Props = $props();

  let red = $state('');
  let blue = $state('');
  let blueInput = $state<HTMLInputElement>();

  const CYCLE_MS = 80;
  const SPIN_MS = 900;
  const STAGGER_MS = 120;
  const HOLD_MS = 400;
  const REDUCED_MS = 300;

  /** Faces shown while rolling; null when not rolling. */
  let faces = $state<number[] | null>(null);
  /** Which dice have landed. */
  let landed = $state<boolean[]>([]);
  let timers: ReturnType<typeof setTimeout>[] = [];
  let ticker: ReturnType<typeof setInterval> | null = null;

  function cancel() {
    for (const t of timers) clearTimeout(t);
    timers = [];
    if (ticker !== null) clearInterval(ticker);
    ticker = null;
  }
  onDestroy(cancel);

  function randomFace(prev: number): number {
    let f = prev;
    while (f === prev) f = Math.floor(Math.random() * 6) + 1;
    return f;
  }

  function roll() {
    if (faces !== null) return;
    unlockAudio();
    const finals = onroll();
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    faces = [...finals];
    landed = finals.map(() => reduced);
    const done = () => {
      cancel();
      onrolled(finals);
    };
    if (reduced) {
      playClack();
      timers.push(setTimeout(done, REDUCED_MS));
      return;
    }
    faces = finals.map((f) => randomFace(f));
    ticker = setInterval(() => {
      faces = faces!.map((f, i) => (landed[i] ? finals[i]! : randomFace(f)));
      playTick();
    }, CYCLE_MS);
    finals.forEach((f, i) => {
      timers.push(
        setTimeout(() => {
          landed[i] = true;
          playClack();
          faces![i] = f;
        }, SPIN_MS + i * STAGGER_MS),
      );
    });
    timers.push(setTimeout(done, SPIN_MS + (finals.length - 1) * STAGGER_MS + HOLD_MS));
  }

  const rolling = $derived(faces !== null);

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (rolling) return;
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
      <input type="text" inputmode="numeric" autocomplete="off" maxlength="3" bind:value={red} oninput={onRedInput} disabled={rolling} class:hidden={rolling} aria-label={dice === 'd66' ? 'Red die (width)' : label} />
      {#if faces}<span class="face"><DieFace value={faces[0] ?? 1} colour="red" size={76} /></span>{/if}
    </label>
    {#if dice === 'd66'}
      <label class="die blue">
        <span>Blue · height</span>
        <input type="text" inputmode="numeric" autocomplete="off" maxlength="3" bind:value={blue} bind:this={blueInput} disabled={rolling} class:hidden={rolling} aria-label="Blue die (height)" />
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
