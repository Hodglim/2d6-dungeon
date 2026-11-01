<script lang="ts">
  import type { DisplayToggles } from '../render/renderer';

  interface Props {
    toggles: DisplayToggles;
    onclose: () => void;
    onnewmap: () => void;
    ondemo: () => void;
    onfit: () => void;
    onexport: () => void;
    onimport: () => void;
    tablesName: string | null;
    cardsName: string | null;
    onloadtables: () => void;
    onloadcards: () => void;
    onremovetables: () => void;
    onremovecards: () => void;
  }

  let { toggles = $bindable(), onclose, onnewmap, ondemo, onfit, onexport, onimport, tablesName, cardsName, onloadtables, onloadcards, onremovetables, onremovecards }: Props = $props();

  const toggleLabels: Record<keyof DisplayToggles, string> = {
    grid: 'Grid',
    shadows: 'Wall shadows',
    hatching: 'Hatching',
    decals: 'Decorations',
    footprints: 'Footprints',
    token: 'Token',
  };
  const toggleNames = Object.keys(toggleLabels) as (keyof DisplayToggles)[];

  function act(fn: () => void) {
    return () => {
      onclose();
      fn();
    };
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="backdrop" role="presentation" onclick={onclose}></div>
<div class="menu" role="menu" aria-label="Menu">
  <button role="menuitem" onclick={act(onnewmap)}>New game…</button>
  <button role="menuitem" onclick={act(ondemo)}>Load demo map</button>
  <button role="menuitem" onclick={act(onfit)}>Fit map to screen</button>
  <button role="menuitem" onclick={act(onexport)}>Export game</button>
  <button role="menuitem" onclick={act(onimport)}>Import game…</button>
  <h3>Your files</h3>
  <button role="menuitem" onclick={act(onloadtables)}>Load table file…</button>
  <div class="status" data-status="tables">
    <span>{tablesName ? `Table file: ${tablesName}` : 'No table file loaded'}</span>
    {#if tablesName}<button class="remove" onclick={onremovetables}>Remove</button>{/if}
  </div>
  <button role="menuitem" onclick={act(onloadcards)}>Load creature cards…</button>
  <div class="status" data-status="cards">
    <span>{cardsName ? `Creature cards: ${cardsName}` : 'No creature cards loaded'}</span>
    {#if cardsName}<button class="remove" onclick={onremovecards}>Remove</button>{/if}
  </div>
  <h3>Display</h3>
  {#each toggleNames as name (name)}
    <label><input type="checkbox" bind:checked={toggles[name]} /> {toggleLabels[name]}</label>
  {/each}
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 10;
  }
  .menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 8px;
    z-index: 11;
    display: flex;
    flex-direction: column;
    min-width: 260px;
    max-height: calc(100dvh - 80px);
    overflow: auto;
    padding: 6px 0;
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 6px;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  }
  button,
  label {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    padding: 0 18px;
    font: inherit;
    font-size: 18px;
    color: var(--ink);
    text-align: left;
    background: none;
    border: none;
    cursor: pointer;
  }
  button:hover,
  label:hover {
    background: var(--paper-dim);
  }
  button:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: -3px;
  }
  input {
    width: 24px;
    height: 24px;
    margin: 0;
    accent-color: var(--ink);
  }
  .status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 48px;
    padding: 0 18px;
    font-size: 16px;
    color: var(--muted);
    overflow-wrap: anywhere;
  }
  .remove {
    min-width: 72px;
    justify-content: center;
    border: 2px solid var(--ink);
    border-radius: 6px;
  }
  h3 {
    margin: 6px 0 0;
    padding: 8px 18px 4px;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    border-top: 1px solid var(--rule);
  }
</style>
