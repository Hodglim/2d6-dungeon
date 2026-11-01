<script lang="ts">
  import type { History } from '../../core/history';
  import { levelUp, levelUpAvailable, listLimit, nextLevelRow, overLimit, type Hero, type ListKey } from '../../systems/dungeon/hero';
  import type { DungeonTables } from '../../systems/dungeon/tables';
  import { commitHero } from './heroActions';
  import QuickStrip from './QuickStrip.svelte';
  import SheetItems from './SheetItems.svelte';
  import SheetNarrative from './SheetNarrative.svelte';
  import SheetPotions from './SheetPotions.svelte';
  import SheetStats from './SheetStats.svelte';

  interface Props {
    hero: Hero;
    history: History;
    tables: DungeonTables | null;
    onclose: () => void;
  }
  let { hero, history, tables, onclose }: Props = $props();

  interface EditOpts {
    label?: string;
    mergeKey?: string;
    /** Warn (never block) when this edit pushes the list past its limit. */
    limit?: ListKey;
  }

  const TABS = [
    { id: 'stats', label: 'Stats' },
    { id: 'potions', label: 'Potions' },
    { id: 'story', label: 'Story' },
    { id: 'items', label: 'Items' },
  ] as const;
  let tab = $state<(typeof TABS)[number]['id']>('stats');
  let pending = $state.raw<{ next: Hero; opts: EditOpts; message: string } | null>(null);

  // An undo or redo under an open warning makes it stale.
  $effect(() => {
    void hero;
    pending = null;
  });

  function limitMessage(h: Hero, key: ListKey): string {
    const n = listLimit(h, key);
    switch (key) {
      case 'largeItems':
        return `Your backpack holds ${n} large ${n === 1 ? 'item' : 'items'} — drop or use one?`;
      case 'potions':
        return `You can carry ${n} ${n === 1 ? 'potion' : 'potions'} — drop or use one?`;
      case 'scrolls':
        return `You can carry ${n} ${n === 1 ? 'scroll' : 'scrolls'} — drop or use one?`;
      case 'armour':
        return `You can wear ${n} armour ${n === 1 ? 'piece' : 'pieces'} — drop one?`;
      case 'manoeuvres':
        return `Your level allows ${n} ${n === 1 ? 'manoeuvre' : 'manoeuvres'} — drop one?`;
    }
  }

  function edit(next: Hero, opts: EditOpts = {}) {
    const key = opts.limit;
    if (key && next[key].length > hero[key].length && overLimit(next, key)) {
      pending = { next, opts, message: limitMessage(next, key) };
      return;
    }
    commitHero(history, next, opts);
  }

  function addAnyway() {
    if (!pending) return;
    const { next, opts } = pending;
    pending = null;
    commitHero(history, next, opts);
  }

  const offer = $derived(levelUpAvailable(hero) ? nextLevelRow(hero) : null);
  function acceptLevelUp() {
    if (!offer || !levelUpAvailable(hero)) return;
    commitHero(history, levelUp(hero), { label: `Level up to ${offer.title}` });
  }
</script>

<aside class="hero-panel" aria-label="Hero panel">
  <div class="body">
    <header>
      <h2>{hero.name} <span class="sub">Level {hero.level} {hero.title}</span></h2>
      <button class="close" onclick={onclose} aria-label="Close hero panel">Close</button>
    </header>

    {#if offer}
      <div class="offer" role="status">
        <span class="grow">Level up to {offer.title}?</span>
        <button class="primary" onclick={acceptLevelUp}>Level up</button>
      </div>
    {/if}

    {#if pending}
      <div class="warn limit" role="alert">
        <p>{pending.message}</p>
        <div class="row">
          <button class="primary" onclick={addAnyway}>Add anyway</button>
          <button onclick={() => (pending = null)}>Cancel</button>
        </div>
      </div>
    {/if}

    <QuickStrip {hero} onedit={edit} />

    <div class="tabs" role="tablist" aria-label="Hero sheet pages">
      {#each TABS as t, i (t.id)}
        <button role="tab" id="hero-tab-{t.id}" aria-selected={tab === t.id} aria-controls="hero-page" onclick={() => (tab = t.id)}>
          {i + 1}. {t.label}
        </button>
      {/each}
    </div>

    <div id="hero-page" role="tabpanel" aria-labelledby="hero-tab-{tab}">
      {#if tab === 'stats'}
        <SheetStats {hero} {tables} onedit={edit} />
      {:else if tab === 'potions'}
        <SheetPotions {hero} onedit={edit} />
      {:else if tab === 'story'}
        <SheetNarrative {hero} onedit={edit} />
      {:else}
        <SheetItems {hero} onedit={edit} />
      {/if}
    </div>
  </div>
</aside>

<style>
  .hero-panel {
    min-width: 0;
    min-height: 0;
    display: flex;
    background: var(--paper);
    border-left: 2px solid var(--ink);
    overflow: hidden;
  }
  .body {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    padding: 12px 18px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
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
    font-size: 16px;
    font-weight: 400;
    color: var(--muted);
  }
  .offer {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    font-size: 19px;
    font-weight: 600;
    background: #f1e3b8;
    border: 2px solid var(--ink);
    border-radius: 8px;
  }
  .limit {
    padding: 8px 12px;
    background: var(--paper-dim);
    border-left: 4px solid var(--danger);
  }
  .limit p {
    margin: 0 0 8px;
    font-size: 18px;
  }
  .tabs {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .tabs button[aria-selected='true'] {
    color: var(--paper);
    background: var(--ink);
    font-weight: 600;
  }
  .grow {
    flex: 1;
  }

  /* Shared look for the sheet pages and the controls inside them. */
  .hero-panel :global(button) {
    min-width: 48px;
    min-height: 48px;
    padding: 0 14px;
    font: inherit;
    font-size: 18px;
    color: var(--ink);
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 6px;
    cursor: pointer;
    touch-action: manipulation;
  }
  .hero-panel :global(button.primary),
  .hero-panel :global(button[aria-pressed='true']) {
    color: var(--paper);
    background: var(--ink);
  }
  .hero-panel :global(button:disabled) {
    opacity: 0.45;
    cursor: default;
  }
  .hero-panel :global(button:focus-visible),
  .hero-panel :global(input:focus-visible),
  .hero-panel :global(select:focus-visible),
  .hero-panel :global(textarea:focus-visible) {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
  .hero-panel :global(input),
  .hero-panel :global(select),
  .hero-panel :global(textarea) {
    min-height: 48px;
    padding: 0 10px;
    font: inherit;
    font-size: 18px;
    color: var(--ink);
    background: #fff;
    border: 2px solid var(--ink);
    border-radius: 6px;
    min-width: 0;
    box-sizing: border-box;
  }
  .hero-panel :global(textarea) {
    width: 100%;
    padding: 8px 10px;
    resize: vertical;
  }
  .hero-panel :global(.page) {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .hero-panel :global(h3) {
    margin: 0 0 6px;
    font-size: 19px;
  }
  .hero-panel :global(h3.over) {
    color: var(--danger);
  }
  .hero-panel :global(p) {
    margin: 0 0 6px;
    font-size: 17px;
  }
  .hero-panel :global(.empty) {
    color: var(--muted);
  }
  .hero-panel :global(.cap) {
    font-size: 16px;
    font-weight: 600;
  }
  .hero-panel :global(.stats .cap) {
    text-transform: capitalize;
  }
  .hero-panel :global(ul),
  .hero-panel :global(ol) {
    margin: 0 0 8px;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .hero-panel :global(li) {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    font-size: 18px;
  }
  .hero-panel :global(li.over) {
    background: #f6d9d3;
  }
  .hero-panel :global(.n) {
    width: 24px;
    font-weight: 700;
    color: var(--muted);
  }
  .hero-panel :global(.mod) {
    min-width: 28px;
    font-weight: 600;
  }
  .hero-panel :global(.row) {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .hero-panel :global(label) {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .hero-panel :global(.wide) {
    margin-top: 8px;
  }
  .hero-panel :global(.grow) {
    flex: 1;
    min-width: 120px;
  }
  .hero-panel :global(.short) {
    width: 120px;
  }
  .hero-panel :global(.num) {
    width: 72px;
  }
  .hero-panel :global(.total) {
    min-width: 36px;
    text-align: center;
    font-size: 22px;
  }
  .hero-panel :global(.cond) {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
  }
  .hero-panel :global(.effect) {
    font-size: 16px;
    color: var(--muted);
  }
</style>
