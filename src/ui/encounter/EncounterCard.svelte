<script lang="ts">
  import type { CreatureCard } from '../../systems/dungeon/cards';

  interface Props {
    card: CreatureCard;
    onend: () => void;
  }
  let { card, onend }: Props = $props();

  let big = $state(false);
  let closeBtn = $state<HTMLButtonElement>();
  let imageBtn = $state<HTMLButtonElement>();

  $effect(() => {
    if (big) closeBtn?.focus();
  });

  function close() {
    big = false;
    imageBtn?.focus();
  }

  function onKey(e: KeyboardEvent) {
    if (big && e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }
</script>

<svelte:window onkeydown={onKey} />

<aside class="encounter-card" aria-label="Creature card">
  <header>
    <h2>{card.name} <span class="sub">Level {card.level}</span></h2>
    <button class="end" onclick={onend}>End encounter</button>
  </header>
  <div class="scroll">
    <button class="image" bind:this={imageBtn} aria-label="View {card.name} full screen" onclick={() => (big = true)}>
      <img src={card.image} alt={card.name} />
    </button>
  </div>
</aside>

{#if big}
  <button class="full" bind:this={closeBtn} aria-label="Close full screen card" onclick={close}>
    <img src={card.image} alt={card.name} />
  </button>
{/if}

<style>
  .encounter-card {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 18px 18px;
    background: var(--paper);
    border-left: 2px solid var(--ink);
    overflow: hidden;
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  h2 {
    flex: 1;
    margin: 0;
    font-size: 22px;
  }
  .sub {
    display: block;
    font-size: 14px;
    font-weight: 400;
    color: var(--muted);
  }
  .end {
    min-width: 48px;
    min-height: 48px;
    padding: 0 14px;
    font: inherit;
    font-size: 17px;
    color: var(--ink);
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 6px;
    cursor: pointer;
    touch-action: manipulation;
  }
  .scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }
  .image {
    display: block;
    width: 100%;
    padding: 0;
    border: 2px solid var(--rule);
    border-radius: 6px;
    background: none;
    cursor: zoom-in;
  }
  .image img {
    display: block;
    width: 100%;
    height: auto;
  }
  .full {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: grid;
    place-items: center;
    padding: 12px;
    border: 0;
    background: rgba(20, 16, 10, 0.9);
    cursor: zoom-out;
  }
  .full img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  :focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
</style>
