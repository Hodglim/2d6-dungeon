<script lang="ts">
  import type { DisplayToggles } from '../render/renderer';
  import { isSoundEnabled, setSoundEnabled } from './sound';

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
    /** Download a blank table file to fill in from your own books. */
    ontemplate?: () => void;
    onloadcards: () => void;
    onremovetables: () => void;
    onremovecards: () => void;
    /** Levels above the current one, oldest first. */
    earlier?: { level: number; label: string }[];
    onearlier?: (index: number) => void;
    /** "Playing with real dice": the roller takes typed results instead of rolling. */
    realDice?: boolean;
    onrealdice?: (on: boolean) => void;
  }

  let { toggles = $bindable(), onclose, onnewmap, ondemo, onfit, onexport, onimport, tablesName, cardsName, onloadtables, ontemplate = () => {}, onloadcards, onremovetables, onremovecards, earlier = [], onearlier = () => {}, realDice = false, onrealdice = () => {} }: Props = $props();

  const toggleLabels: Record<keyof DisplayToggles, string> = {
    grid: 'Grid',
    shadows: 'Wall shadows',
    hatching: 'Hatching',
    decals: 'Decorations',
    footprints: 'Footprints',
    token: 'Token',
  };
  const toggleNames = Object.keys(toggleLabels) as (keyof DisplayToggles)[];

  let sound = $state(isSoundEnabled());

  // The toolbar wraps to several rows on a phone, so a fixed allowance for it is not enough: cap the
  // menu at the room left below where it starts, so it scrolls instead of running off the screen.
  let menuEl: HTMLDivElement;
  let maxHeight = $state<number | null>(null);
  function fit() {
    maxHeight = Math.max(160, window.innerHeight - menuEl.getBoundingClientRect().top - 8);
  }
  $effect(fit);

  function act(fn: () => void) {
    return () => {
      onclose();
      fn();
    };
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} onresize={fit} />

<div class="backdrop" role="presentation" onclick={onclose}></div>
<div class="menu" role="menu" aria-label="Menu" bind:this={menuEl} style:max-height={maxHeight === null ? null : `${maxHeight}px`}>
  <button role="menuitem" onclick={act(onnewmap)}>New game…</button>
  <button role="menuitem" onclick={act(ondemo)}>Load demo map</button>
  <button role="menuitem" onclick={act(onfit)}>Fit map to screen</button>
  <button role="menuitem" onclick={act(onexport)}>Export game</button>
  <button role="menuitem" onclick={act(onimport)}>Import game…</button>
  {#if earlier.length}
    <h3>Earlier levels</h3>
    {#each earlier as e, i (e.level)}
      <button role="menuitem" onclick={act(() => onearlier(i))}>{e.label}</button>
    {/each}
  {/if}
  <h3>Your files</h3>
  <button role="menuitem" onclick={act(onloadtables)}>Load table file…</button>
  <div class="status" data-status="tables">
    <span>{tablesName ? `Table file: ${tablesName}` : 'No table file loaded'}</span>
    {#if tablesName}<button class="remove" onclick={onremovetables}>Remove</button>{/if}
  </div>
  <button role="menuitem" onclick={act(ontemplate)}>Download blank table file</button>
  <button role="menuitem" onclick={act(onloadcards)}>Load creature cards…</button>
  <div class="status" data-status="cards">
    <span>{cardsName ? `Creature cards: ${cardsName}` : 'No creature cards loaded'}</span>
    {#if cardsName}<button class="remove" onclick={onremovecards}>Remove</button>{/if}
  </div>
  <h3>Display</h3>
  {#each toggleNames as name (name)}
    <label><input type="checkbox" bind:checked={toggles[name]} /> {toggleLabels[name]}</label>
  {/each}
  <h3>Dice</h3>
  <label data-testid="dice-enter"><input type="checkbox" checked={realDice} onchange={(e) => onrealdice(e.currentTarget.checked)} /> Playing with real dice</label>
  <h3>Sound</h3>
  <label><input type="checkbox" checked={sound} onchange={(e) => setSoundEnabled((sound = e.currentTarget.checked))} /> Sound effects</label>
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
    box-sizing: border-box;
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
