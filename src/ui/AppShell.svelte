<script lang="ts">
  import { demoMap } from '../app/demo';
  import { createMap } from '../core/campaign';
  import { History } from '../core/history';
  import { coverage } from '../core/query';
  import type { DungeonMap } from '../core/types';
  import type { Pick } from '../render/hit';
  import { DEFAULT_TOGGLES, type DisplayToggles } from '../render/renderer';
  import { dungeonSystem } from '../systems/dungeon';
  import { historyStore, type Tool } from './historyStore';
  import MapView from './MapView.svelte';
  import Menu from './Menu.svelte';
  import NewMapDialog, { type NewMapValues } from './NewMapDialog.svelte';
  import StepPanel from './StepPanel.svelte';
  import Toolbar from './Toolbar.svelte';

  const history = new History(createMap(dungeonSystem, { width: 25, height: 25 }));
  const view = historyStore(history);

  let tool = $state<Tool>('play');
  let toggles = $state<DisplayToggles>({ ...DEFAULT_TOGGLES });
  let menuOpen = $state(false);
  let newMapOpen = $state(false);
  let confirmDemo = $state(false);
  let panelCollapsed = $state(false);
  let mapView = $state<ReturnType<typeof MapView>>();

  const cover = $derived(coverage($view.map));
  /** Replacing the map would lose something: content on it, or undo history. */
  const hasWork = $derived(hasContent($view.map) || $view.canUndo);

  function hasContent(m: DungeonMap): boolean {
    return m.rooms.length > 0 || m.doors.length > 0 || m.features.length > 0 || m.token !== null;
  }

  function createNewMap(v: NewMapValues) {
    newMapOpen = false;
    history.reset(createMap(dungeonSystem, { width: v.width, height: v.height, level: v.level, title: v.title }));
  }

  function loadDemo() {
    confirmDemo = false;
    history.reset(demoMap());
  }

  function onTap(p: Pick) {
    // Tool behaviour (play flow, door/stairs/note editing, selection) is wired in later tasks.
    void p;
  }

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable]')) return;
    const key = e.key.toLowerCase();
    if (!(e.ctrlKey || e.metaKey) || (key !== 'z' && key !== 'y')) return;
    e.preventDefault();
    if (key === 'y' || e.shiftKey) history.redo();
    else history.undo();
  }
</script>

<svelte:window onkeydown={onKey} />

<div class="shell" class:collapsed={panelCollapsed}>
  <div class="top">
    <Toolbar
      view={$view}
      {tool}
      coverage={cover}
      {menuOpen}
      ontool={(t) => (tool = t)}
      onundo={() => history.undo()}
      onredo={() => history.redo()}
      onmenu={() => (menuOpen = !menuOpen)}
    />
    {#if menuOpen}
      <Menu
        bind:toggles
        onclose={() => (menuOpen = false)}
        onnewmap={() => (newMapOpen = true)}
        ondemo={() => (hasWork ? (confirmDemo = true) : loadDemo())}
        onfit={() => mapView?.fit()}
      />
    {/if}
  </div>
  <MapView bind:this={mapView} map={$view.map} {toggles} ontap={onTap} />
  <StepPanel {tool} map={$view.map} collapsed={panelCollapsed} ontoggle={() => (panelCollapsed = !panelCollapsed)} />
</div>

{#if newMapOpen}
  <NewMapDialog confirmDiscard={hasWork} oncreate={createNewMap} oncancel={() => (newMapOpen = false)} />
{/if}

{#if confirmDemo}
  <div class="scrim">
    <div class="confirm" role="alertdialog" aria-modal="true" aria-labelledby="demo-title">
      <h2 id="demo-title">Load demo map</h2>
      <p>This replaces the current map — there's no saving yet</p>
      <div class="actions">
        <button onclick={() => (confirmDemo = false)}>Cancel</button>
        <button class="primary" onclick={loadDemo}>Replace map</button>
      </div>
    </div>
  </div>
{/if}

<style>
  :global(:root) {
    --ink: #1f1a14;
    --paper: #f7f2e7;
    --paper-dim: #ece4d2;
    --rule: #c9bda4;
    --muted: #8a7f6d;
    --accent: #2f6fb3;
    --danger: #a3221b;
  }
  :global(html, body) {
    margin: 0;
    height: 100%;
    overflow: hidden;
    overscroll-behavior: none;
    background: var(--paper);
    color: var(--ink);
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    -webkit-tap-highlight-color: transparent;
  }
  .shell {
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) clamp(280px, 30%, 440px);
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas:
      'top top'
      'map panel';
  }
  .shell.collapsed {
    grid-template-columns: minmax(0, 1fr) 48px;
  }
  .top {
    grid-area: top;
    position: relative;
    z-index: 5;
  }
  .shell > :global(.map-view) {
    grid-area: map;
  }
  .shell > :global(.panel) {
    grid-area: panel;
  }
  @media (max-width: 699.98px) {
    .shell,
    .shell.collapsed {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr) auto;
      grid-template-areas:
        'top'
        'map'
        'panel';
    }
    .shell > :global(.panel) {
      max-height: 40dvh;
    }
  }

  .scrim {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(20, 16, 10, 0.45);
  }
  .confirm {
    width: min(460px, 100%);
    padding: 20px 22px;
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 8px;
  }
  .confirm h2 {
    margin: 0 0 10px;
    font-size: 24px;
  }
  .confirm p {
    margin: 0 0 16px;
    font-size: 19px;
    line-height: 1.4;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
  .actions button {
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
  .actions button.primary {
    color: var(--paper);
    background: var(--ink);
  }
</style>
