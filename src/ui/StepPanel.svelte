<script lang="ts">
  import type { DungeonMap } from '../core/types';
  import type { Tool } from './historyStore';

  interface Props {
    tool: Tool;
    map: DungeonMap;
    collapsed: boolean;
    ontoggle: () => void;
  }

  let { tool, map, collapsed, ontoggle }: Props = $props();

  const titles: Record<Tool, string> = {
    play: 'Play',
    door: 'Door',
    stairs: 'Stairs',
    note: 'Note',
    select: 'Select',
  };

  function hintFor(t: Tool, m: DungeonMap): string {
    switch (t) {
      case 'play':
        return m.rooms.length === 0 ? 'Tap a square on the bottom edge to place the entrance' : 'Tap an open exit to start a room, or a floor square to walk there';
      case 'door':
        return 'Tap a door to edit it, or a bare wall facing open space to add an exit';
      case 'stairs':
        return 'Tap a floor square to add stairs, or tap stairs to edit them';
      case 'note':
        return 'Tap a floor square to add a note, or tap a note to edit it';
      case 'select':
        return 'Tap a room to see its details';
    }
  }

  const hint = $derived(hintFor(tool, map));
</script>

<aside class="panel" class:collapsed aria-label="Step panel">
  <button class="toggle" onclick={ontoggle} aria-expanded={!collapsed} aria-label={collapsed ? 'Show panel' : 'Hide panel'}>
    <span class="chevron" aria-hidden="true">{collapsed ? '‹' : '›'}</span>
  </button>
  {#if !collapsed}
    <div class="body">
      <h2>{titles[tool]}</h2>
      <p class="hint">{hint}</p>
    </div>
  {/if}
</aside>

<style>
  .panel {
    display: flex;
    min-width: 0;
    min-height: 0;
    background: var(--paper);
    border-left: 2px solid var(--ink);
    overflow: auto;
  }
  .toggle {
    flex: none;
    width: 48px;
    min-height: 48px;
    align-self: stretch;
    font: inherit;
    font-size: 28px;
    color: var(--ink);
    background: var(--paper-dim);
    border: none;
    border-right: 1px solid var(--rule);
    cursor: pointer;
    touch-action: manipulation;
  }
  .toggle:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: -3px;
  }
  .body {
    flex: 1;
    min-width: 0;
    padding: 12px 18px;
  }
  h2 {
    margin: 0 0 10px;
    font-size: 22px;
  }
  .hint {
    margin: 0;
    font-size: 19px;
    line-height: 1.4;
  }

  /* Bottom sheet on narrow screens: the toggle becomes a full-width strip on top. */
  @media (max-width: 699.98px) {
    .panel {
      flex-direction: column;
      border-left: none;
      border-top: 2px solid var(--ink);
    }
    .toggle {
      width: 100%;
      height: 48px;
      flex: none;
      border-right: none;
      border-bottom: 1px solid var(--rule);
    }
    .chevron {
      display: inline-block;
      transform: rotate(90deg);
    }
  }
</style>
