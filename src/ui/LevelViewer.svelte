<script lang="ts">
  import { DEFAULT_TOGGLES } from '../render/renderer';
  import type { DungeonMap } from '../core/types';
  import MapView from './MapView.svelte';

  interface Props {
    map: DungeonMap;
    title: string;
    onclose: () => void;
  }
  let { map, title, onclose }: Props = $props();
  // MapView with no tap or hover handlers can only pan and zoom: nothing here reaches History.
  const toggles = { ...DEFAULT_TOGGLES };
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="viewer" role="dialog" aria-modal="true" aria-label={title} data-testid="level-viewer">
  <header>
    <h2>{title} <span>(read-only)</span></h2>
    <button type="button" onclick={onclose}>Close</button>
  </header>
  <div class="map"><MapView {map} {toggles} /></div>
</div>

<style>
  .viewer { position: fixed; inset: 0; z-index: 40; display: flex; flex-direction: column; background: var(--paper); color: var(--ink); }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 16px; border-bottom: 2px solid var(--ink); }
  h2 { margin: 0; font-size: 22px; }
  h2 span { font-size: 16px; font-weight: 400; color: var(--muted); }
  button { min-width: 96px; min-height: 48px; padding: 0 18px; font: inherit; font-size: 18px; color: var(--paper); background: var(--ink); border: 2px solid var(--ink); border-radius: 6px; cursor: pointer; }
  .map { flex: 1; min-height: 0; position: relative; display: flex; }
  .map :global(.map-view) { flex: 1; }
</style>
