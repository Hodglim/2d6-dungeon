<script lang="ts">
  import { searchCards, type CardPack, type CreatureCard } from '../../systems/dungeon/cards';

  interface Props {
    pack: CardPack;
    onpick: (card: CreatureCard) => void;
    onclose: () => void;
  }
  let { pack, onpick, onclose }: Props = $props();

  let query = $state('');
  let level = $state('all');
  const levels = $derived([...new Set(pack.cards.map((c) => c.level))].sort((a, b) => a - b));
  const results = $derived(searchCards(pack, query, level === 'all' ? null : Number(level)));
</script>

<aside class="encounter-picker" aria-label="Encounter search">
  <header>
    <h2>Encounter</h2>
    <button class="close" onclick={onclose} aria-label="Close encounter search">Close</button>
  </header>
  <div class="filters">
    <input type="search" aria-label="Search creatures" placeholder="Search by name" bind:value={query} autocomplete="off" />
    <select aria-label="Dungeon level" bind:value={level}>
      <option value="all">All</option>
      {#each levels as l (l)}<option value={String(l)}>Level {l}</option>{/each}
    </select>
  </div>
  <ul class="results">
    {#each results as c (c.id)}
      <li><button class="pick" onclick={() => onpick(c)}><span class="name">{c.name}</span><span class="lvl">Level {c.level}</span></button></li>
    {:else}
      <li class="none">No creature matches.</li>
    {/each}
  </ul>
</aside>

<style>
  .encounter-picker {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 18px 18px;
    background: var(--paper);
    border-left: 2px solid var(--ink);
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
  .none {
    color: var(--muted);
    padding: 8px 2px;
  }
  :focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
</style>
