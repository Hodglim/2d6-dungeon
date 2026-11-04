<script lang="ts">
  import { searchCards, type CardPack } from '../../systems/dungeon/cards';
  import type { DungeonTables } from '../../systems/dungeon/tables';

  interface Props {
    /** Without a pack there are no pictures to search; table creatures and typed names still work. */
    pack: CardPack | null;
    tables: DungeonTables | null;
    /** A stored card pack exists but could not be read. */
    cardsUnreadable?: boolean;
    onpick: (name: string) => void;
    onclose: () => void;
  }
  let { pack, tables, cardsUnreadable = false, onpick, onclose }: Props = $props();

  let query = $state('');
  let level = $state('all');
  const levels = $derived(
    [...new Set([...(pack?.cards ?? []).map((c) => c.level), ...Object.values(tables?.tables.creatures ?? {}).map((c) => c.level)])].sort((a, b) => a - b),
  );
  const want = $derived(level === 'all' ? null : Number(level));
  const cardHits = $derived(pack ? searchCards(pack, query, want) : []);
  /** Creatures in the table file that have no card of their own. */
  const tableHits = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const carded = new Set((pack?.cards ?? []).map((c) => c.name.toLowerCase()));
    return Object.entries(tables?.tables.creatures ?? {})
      .filter(([n, c]) => !carded.has(n.toLowerCase()) && (!q || n.toLowerCase().includes(q)) && (want === null || c.level === want))
      .map(([n, c]) => ({ name: n, level: c.level }))
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
  });
  const typed = $derived(query.trim());
  const exact = $derived(
    [...cardHits.map((c) => c.name), ...tableHits.map((c) => c.name)].some((n) => n.toLowerCase() === typed.toLowerCase()),
  );
</script>

<section class="encounter-picker" aria-label="Add creature">
  <header>
    <h2>Add creature</h2>
    <button class="close" onclick={onclose} aria-label="Close creature search">Close</button>
  </header>
  {#if !pack}
    <p class="note">{cardsUnreadable ? "Couldn't read your stored creature cards — try loading them again to search by picture." : 'Load creature cards to search by picture.'}</p>
  {/if}
  <div class="filters">
    <input type="search" aria-label="Search creatures" placeholder="Search or type a name" bind:value={query} autocomplete="off" />
    {#if levels.length > 0}
      <select aria-label="Dungeon level" bind:value={level}>
        <option value="all">All</option>
        {#each levels as l (l)}<option value={String(l)}>Level {l}</option>{/each}
      </select>
    {/if}
  </div>
  <ul class="results">
    {#if typed && !exact}
      <li><button class="pick add" onclick={() => onpick(typed)}><span class="name">Add “{typed}”</span></button></li>
    {/if}
    {#each cardHits as c (c.id)}
      <li><button class="pick" onclick={() => onpick(c.name)}><span class="name">{c.name}</span><span class="lvl">Level {c.level}</span></button></li>
    {/each}
    {#each tableHits as c (c.name)}
      <li><button class="pick" onclick={() => onpick(c.name)}><span class="name">{c.name}</span><span class="lvl">Level {c.level}</span></button></li>
    {/each}
    {#if !typed && cardHits.length === 0 && tableHits.length === 0}
      <li class="none">Type a creature's name to add it.</li>
    {/if}
  </ul>
</section>

<style>
  .encounter-picker {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
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
  button,
  input,
  select {
    min-height: 48px;
    font: inherit;
    font-size: 17px;
    color: var(--ink);
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 6px;
  }
  button {
    min-width: 48px;
    padding: 0 14px;
    cursor: pointer;
    touch-action: manipulation;
  }
  input,
  select {
    padding: 0 10px;
  }
  .filters {
    display: flex;
    gap: 8px;
  }
  .filters input {
    flex: 1;
    min-width: 0;
  }
  .results {
    flex: 1;
    min-height: 0;
    margin: 0;
    padding: 0;
    list-style: none;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .pick {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    text-align: left;
    background: var(--paper-dim);
    border-color: var(--rule);
  }
  .lvl {
    color: var(--muted);
    font-size: 15px;
    white-space: nowrap;
  }
  .note {
    margin: 0;
    color: var(--muted);
    font-size: 16px;
  }
  .add {
    font-weight: 600;
  }
  .none {
    color: var(--muted);
    padding: 8px 2px;
  }
  :focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
</style>
