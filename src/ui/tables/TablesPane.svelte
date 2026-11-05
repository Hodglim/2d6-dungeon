<script lang="ts">
  // The Tables pane: search and browse the table file's reference tables, read one, roll on it.
  // Its state belongs to the app shell, so switching tabs keeps it; none of it is game state.
  import { findTable, type RefGroup } from '../../systems/dungeon/referenceTables';
  import type { DungeonTables } from '../../systems/dungeon/tables';
  import TableView from './TableView.svelte';
  import { goBack, isSlug, openTable, searchTables, setResult, showList, type TablesState } from './tablesState';

  interface Props {
    tables: DungeonTables | null;
    state: TablesState;
    onstate: (s: TablesState) => void;
    onclose: () => void;
  }
  let { tables, state: s, onstate, onclose }: Props = $props();

  const CHIPS: { id: RefGroup | 'all'; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'generic', label: 'Generic' },
    { id: 'random', label: 'Random' },
    { id: 'loot', label: 'Loot' },
    { id: 'level', label: 'Level' },
    { id: 'optional', label: 'Optional' },
  ];

  const hasRef = $derived(Object.keys(tables?.tables.referenceTables ?? {}).length > 0);
  const shown = $derived(s.open !== null ? findTable(tables, s.open) : null);
  const matches = $derived(searchTables(tables, s.query, s.group));

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

<aside class="tables-pane" aria-label="Tables">
  <div class="body" bind:this={body}>
    <header>
      <h2>Tables</h2>
      <button class="close" onclick={onclose} aria-label="Close tables">Close</button>
    </header>

    {#if !hasRef}
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
        />
      {/key}
    {:else}
      <input
        class="search"
        type="search"
        placeholder="Search by code or name"
        aria-label="Search tables"
        autocomplete="off"
        value={s.query}
        oninput={(e) => onstate({ ...s, query: (e.currentTarget as HTMLInputElement).value })}
      />
      <div class="chips" role="group" aria-label="Table group">
        {#each CHIPS as c (c.id)}
          <button type="button" aria-pressed={s.group === c.id} onclick={() => onstate({ ...s, group: c.id })}>{c.label}</button>
        {/each}
      </div>
      {#if matches.length === 0}
        <p class="empty">No tables match.</p>
      {:else}
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
    {/if}
  </div>
</aside>

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
</style>
