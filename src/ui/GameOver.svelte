<script lang="ts">
  import type { GameOver } from '../persistence/record';

  interface Props {
    over: GameOver;
    onexport: () => void;
    onnew: () => void;
  }
  let { over, onexport, onnew }: Props = $props();

  let first = $state<HTMLButtonElement>();
  // Focus lands on the cover, never on the (inert) app behind it.
  $effect(() => first?.focus());
</script>

<div class="cover" role="dialog" aria-modal="true" aria-labelledby="game-over-title">
  <div class="card">
    <h1 id="game-over-title">Game Over</h1>
    <p class="who" data-testid="game-over-hero">{over.heroName}, level {over.heroLevel}</p>
    <p class="note">Your hero has fallen. Export the game to keep a record of it, or start a new one.</p>
    <div class="actions">
      <button type="button" bind:this={first} onclick={onexport}>Export game</button>
      <button type="button" class="primary" onclick={onnew}>New game</button>
    </div>
  </div>
</div>

<style>
  .cover {
    position: fixed;
    inset: 0;
    z-index: 25;
    display: grid;
    place-items: center;
    padding: 16px;
    background: #1f1a14;
    color: var(--paper);
  }
  .card {
    width: min(520px, 100%);
    text-align: center;
  }
  h1 {
    margin: 0 0 12px;
    font-size: 44px;
    letter-spacing: 0.04em;
  }
  .who {
    margin: 0 0 10px;
    font-size: 26px;
    font-weight: 600;
  }
  .note {
    margin: 0 0 24px;
    font-size: 18px;
    line-height: 1.4;
    color: #d8cfbd;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 12px;
  }
  button {
    min-width: 150px;
    min-height: 52px;
    padding: 0 20px;
    font: inherit;
    font-size: 19px;
    color: var(--paper);
    background: transparent;
    border: 2px solid var(--paper);
    border-radius: 6px;
    cursor: pointer;
    touch-action: manipulation;
  }
  button.primary {
    color: var(--ink);
    background: var(--paper);
  }
  :focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
</style>
