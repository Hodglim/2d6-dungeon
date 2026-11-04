<script lang="ts">
  import type { HistoryView, Tool } from './historyStore';

  interface Props {
    view: HistoryView;
    tool: Tool;
    coverage: number;
    menuOpen: boolean;
    /** The Hero panel is showing in the sidebar. */
    heroOpen?: boolean;
    /** The Encounter panel is showing in the sidebar. */
    encounterOpen?: boolean;
    /** The Tables pane is showing in the sidebar. */
    tablesOpen?: boolean;
    /** Start-up hasn't finished: nothing on the toolbar may act yet. */
    disabled?: boolean;
    /** A room is being placed: only Play stays available, so the room can't be dropped by accident. */
    placing?: boolean;
    ontool: (tool: Tool) => void;
    onundo: () => void;
    onredo: () => void;
    onmenu: () => void;
    onhero: () => void;
    onencounter: () => void;
    ontables: () => void;
  }

  let { view, tool, coverage, menuOpen, heroOpen = false, encounterOpen = false, tablesOpen = false, disabled = false, placing = false, ontool, onundo, onredo, onmenu, onhero, onencounter, ontables }: Props = $props();

  const tools: { id: Tool; label: string }[] = [
    { id: 'play', label: 'Play' },
    { id: 'door', label: 'Door' },
    { id: 'stairs', label: 'Stairs' },
    { id: 'note', label: 'Note' },
    { id: 'select', label: 'Select' },
  ];
</script>

<header class="toolbar">
  <button class="icon" aria-label="Menu" aria-expanded={menuOpen} {disabled} onclick={onmenu}>☰</button>
  <div class="group">
    <button class="history" disabled={disabled || !view.canUndo} onclick={onundo} title={view.undoLabel ? `Undo ${view.undoLabel}` : 'Nothing to undo'}>
      <span aria-hidden="true">↶</span> <span class="label">Undo{view.undoLabel ? ` ${view.undoLabel}` : ''}</span>
    </button>
    <button class="history" disabled={disabled || !view.canRedo} onclick={onredo} title={view.redoLabel ? `Redo ${view.redoLabel}` : 'Nothing to redo'}>
      <span class="label">Redo{view.redoLabel ? ` ${view.redoLabel}` : ''}</span> <span aria-hidden="true">↷</span>
    </button>
  </div>
  <div class="group tools" role="group" aria-label="Tools">
    {#each tools as t (t.id)}
      <button class="tool" aria-pressed={tool === t.id} disabled={disabled || (placing && t.id !== 'play')} title={placing && t.id !== 'play' ? 'Finish or cancel the room first' : undefined} onclick={() => ontool(t.id)}>{t.label}</button>
    {/each}
  </div>
  <button class="hero" aria-pressed={heroOpen} {disabled} onclick={onhero}>{view.hero === null ? 'Create hero' : 'Hero'}</button>
  <button class="encounter" aria-pressed={encounterOpen} {disabled} onclick={onencounter}>Encounter</button>
  <button class="tables" aria-pressed={tablesOpen} {disabled} onclick={ontables}>Tables</button>
  <div class="coverage" title="Map coverage" aria-label="Map coverage {Math.round(coverage * 100)}%">
    {Math.round(coverage * 100)}%
  </div>
</header>

<style>
  .toolbar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px 10px;
    padding: 6px 10px;
    background: var(--paper);
    border-bottom: 2px solid var(--ink);
  }
  .group {
    display: flex;
    gap: 6px;
    min-width: 0;
  }
  button {
    min-width: 48px;
    min-height: 48px;
    padding: 0 10px;
    font: inherit;
    font-size: 17px;
    color: var(--ink);
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 6px;
    cursor: pointer;
    touch-action: manipulation;
  }
  button:disabled {
    color: var(--muted);
    border-color: var(--muted);
    cursor: default;
  }
  button:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
  .icon {
    font-size: 22px;
    padding: 0;
  }
  .history {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 170px;
  }
  .history .label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .tool[aria-pressed='true'],
  .encounter[aria-pressed='true'],
  .tables[aria-pressed='true'],
  .hero[aria-pressed='true'] {
    color: var(--paper);
    background: var(--ink);
    font-weight: 600;
  }
  .coverage {
    margin-left: auto;
    min-width: 56px;
    min-height: 44px;
    display: grid;
    place-items: center;
    font-size: 18px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    border: 2px solid var(--ink);
    border-radius: 22px;
    padding: 0 6px;
  }
</style>
