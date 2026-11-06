<script lang="ts">
  // The Tables pane: search and browse the table file's reference tables, read one, roll on it;
  // and look at the card pack's god and herb cards, full screen on a tap.
  // Its state belongs to the app shell, so switching tabs keeps it; none of it is game state
  // (a rolled potion added to the hero goes through History like any other hero edit).
  import { findTable } from '../../systems/dungeon/referenceTables';
  import { CARD_KINDS, cardsOfKind, type CardKind, type CardPack, type CreatureCard } from '../../systems/dungeon/cards';
  import type { DungeonTables } from '../../systems/dungeon/tables';
  import type { Hero } from '../../systems/dungeon/hero';
  import type { KnownPotion } from '../../systems/dungeon/potions';
  import TableView from './TableView.svelte';
  import { goBack, isSlug, openTable, searchTables, setResult, showList, type TablesGroup, type TablesState } from './tablesState';

  interface Props {
    tables: DungeonTables | null;
    /** The card pack: its god and herb cards are shown here. */
    cards?: CardPack | null;
    state: TablesState;
    onstate: (s: TablesState) => void;
    onclose: () => void;
    /** The hero: a potion rolled on a table can be added to their sheet. */
    hero?: Hero | null;
    onaddpotion?: (p: KnownPotion) => void;
  }
  let { tables, cards = null, state: s, onstate, onclose, hero = null, onaddpotion }: Props = $props();

  const KIND_LABEL: Record<CardKind, string> = { god: 'Gods', herb: 'Herbs' };
  /** The card kinds the pack has, each with a chip of its own after the table groups. */
  const kinds = $derived(CARD_KINDS.filter((k) => cardsOfKind(cards, k, '').length > 0));
  const isKind = (g: TablesGroup): g is CardKind => (CARD_KINDS as string[]).includes(g);

  const TABLE_CHIPS: { id: TablesGroup; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'generic', label: 'Generic' },
    { id: 'random', label: 'Random' },
    { id: 'loot', label: 'Loot' },
    { id: 'level', label: 'Level' },
    { id: 'optional', label: 'Optional' },
  ];

  const hasRef = $derived(Object.keys(tables?.tables.referenceTables ?? {}).length > 0);
  const chips = $derived([...(hasRef ? TABLE_CHIPS : TABLE_CHIPS.slice(0, 1)), ...kinds.map((k) => ({ id: k, label: KIND_LABEL[k] }))]);
  /** A card-kind chip left over from a pack since removed shows everything instead. */
  const group = $derived(isKind(s.group) && !kinds.includes(s.group) ? 'all' : s.group);
  const shown = $derived(s.open !== null ? findTable(tables, s.open) : null);
  const matches = $derived(searchTables(tables, s.query, group));
  /** Under a card chip, that kind's cards; under All with a search, any god or herb whose name matches. */
  const cardHits = $derived(
    isKind(group) ? cardsOfKind(cards, group, s.query) : group === 'all' && s.query.trim() ? kinds.flatMap((k) => cardsOfKind(cards, k, s.query)) : [],
  );

  /** The card shown full screen. */
  let big = $state<CreatureCard | null>(null);
  let closeBig = $state<HTMLButtonElement>();
  $effect(() => {
    if (big) closeBig?.focus();
  });
  function onKey(e: KeyboardEvent) {
    if (big && e.key === 'Escape') {
      e.preventDefault();
      big = null;
    }
  }

  // Opening a table, going back or to the list starts the pane body at the top.
  let body: HTMLDivElement | undefined = $state();
  const view = $derived(`${s.open ?? ''}|${s.back.length}`);
  $effect(() => {
    void view;
    body?.scrollTo?.({ top: 0 });
  });

  function open(code: string, modifier = 0) {
    // A code in the text resolves to the table's own id (any case).
    const t = findTable(tables, code);
    if (t) onstate(openTable(s, t.code, modifier));
  }
</script>

<svelte:window onkeydown={onKey} />

<aside class="tables-pane" aria-label="Tables">
  <div class="body" bind:this={body}>
    <header>
      <h2>Tables</h2>
      <button class="close" onclick={onclose} aria-label="Close tables">Close</button>
    </header>

    {#if !hasRef && kinds.length === 0}
      <p class="empty" data-testid="tables-empty">
        {#if !tables}No table file is loaded. Load your table file (with referenceTables) to read and roll on its tables here, or see the format guide.{:else}Your table file has no reference tables yet. Load a table file with referenceTables, or see the format guide.{/if}
      </p>
    {:else if shown}
      {#key shown.code}
        <TableView
          code={shown.code}
          table={shown.table}
          {tables}
          modifier={s.modifier[shown.code] ?? 0}
          result={s.results[shown.code] ?? null}
          canBack={s.back.length > 0}
          onresult={(r) => onstate(setResult(s, shown.code, r))}
          onopen={open}
          onback={() => onstate(goBack(s))}
          onlist={() => onstate(showList(s))}
          {hero}
          {onaddpotion}
        />
      {/key}
    {:else}
      <input
        class="search"
        type="search"
        placeholder={hasRef ? 'Search by code or name' : 'Search by name'}
        aria-label="Search tables"
        autocomplete="off"
        value={s.query}
        oninput={(e) => onstate({ ...s, query: (e.currentTarget as HTMLInputElement).value })}
      />
      <div class="chips" role="group" aria-label="Table group">
        {#each chips as c (c.id)}
          <button type="button" aria-pressed={group === c.id} onclick={() => onstate({ ...s, group: c.id })}>{c.label}</button>
        {/each}
      </div>
      {#if matches.length === 0 && cardHits.length === 0}
        <p class="empty">{isKind(group) ? 'No cards match.' : 'No tables match.'}</p>
      {:else if matches.length > 0}
        <ul class="list">
          {#each matches as m (m.code)}
            <li>
              <button type="button" onclick={() => open(m.code)}>
                <span class="name">{#if !isSlug(m.code)}<b>{m.code}</b>{' — '}{/if}{m.table.name}</span>
                <span class="page">· p. {m.table.page}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      {#if cardHits.length > 0}
        <ul class="cards" aria-label="Cards">
          {#each cardHits as c (c.id)}
            <li>
              <button type="button" class="card" aria-label="View {c.name} full screen" onclick={() => (big = c)}>
                <img src={c.image} alt="" />
                <span>{c.name}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
</aside>

{#if big}
  <button class="full" bind:this={closeBig} aria-label="Close full screen card" onclick={() => (big = null)}>
    <img src={big.image} alt={big.name} />
  </button>
{/if}

<style>
  .tables-pane {
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
    gap: 14px;
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
  .empty {
    margin: 0;
    font-size: 18px;
    line-height: 1.45;
  }
  button,
  input {
    min-height: 48px;
    font: inherit;
    font-size: 17px;
    color: var(--ink);
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 6px;
    touch-action: manipulation;
  }
  button {
    min-width: 48px;
    padding: 0 14px;
    cursor: pointer;
  }
  button:focus-visible,
  input:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
  .search {
    padding: 0 12px;
    font-size: 18px;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chips button {
    min-height: 44px;
    padding: 0 12px;
    border-radius: 22px;
  }
  .chips button[aria-pressed='true'] {
    color: var(--paper);
    background: var(--ink);
    font-weight: 600;
  }
  .list {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .list button {
    width: 100%;
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 0 6px;
    padding: 10px 12px;
    text-align: left;
    border-width: 1px;
    border-color: var(--rule);
  }
  .page {
    color: var(--muted);
  }
  .cards {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px;
  }
  .cards .card {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px;
    border-width: 1px;
    border-color: var(--rule);
    cursor: zoom-in;
  }
  .cards img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 4px;
  }
  .cards span {
    font-size: 15px;
    line-height: 1.2;
    text-align: center;
  }
  .full {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: grid;
    place-items: center;
    padding: 12px;
    border: 0;
    border-radius: 0;
    background: rgba(20, 16, 10, 0.9);
    cursor: zoom-out;
  }
  /* God and herb cards are taller than they are wide: fit the whole card on the screen. */
  .full img {
    max-width: calc(100vw - 24px);
    max-height: calc(100dvh - 24px);
    object-fit: contain;
  }
</style>
