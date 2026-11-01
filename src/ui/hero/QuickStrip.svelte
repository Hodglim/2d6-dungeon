<script lang="ts">
  import type { ListKey } from '../../systems/dungeon/hero';
  import type { Hero } from '../../systems/dungeon/hero';
  import { addItem, addXp, adjustCoin, adjustHp, type Coin } from './heroActions';

  interface EditOpts {
    label?: string;
    mergeKey?: string;
    limit?: ListKey;
  }
  interface Props {
    hero: Hero;
    onedit: (next: Hero, opts?: EditOpts) => void;
  }
  let { hero, onedit }: Props = $props();

  let xpAmount = $state('');
  let itemText = $state('');
  let itemSize = $state<'large' | 'small'>('large');

  const threshold = $derived(hero.rules.levels.find((l) => l.level === hero.level)?.xpToLevelUp ?? null);

  /** A typed whole number: commit on blur or Enter, put the old value back when it isn't one. */
  function typed(e: Event, current: number, min: number | null, apply: (n: number) => Hero) {
    const el = e.currentTarget as HTMLInputElement;
    const raw = el.value.trim();
    const n = Number(raw);
    if (raw === '' || !Number.isInteger(n) || (min !== null && n < min)) {
      el.value = String(current);
      return;
    }
    if (n !== current) onedit(apply(n));
  }

  function addXpBox() {
    const n = Number(xpAmount);
    if (!Number.isInteger(n) || n === 0) return;
    onedit(addXp(hero, n), { mergeKey: 'xp' });
    xpAmount = '';
  }

  function addItemBox() {
    if (!itemText.trim()) return;
    onedit(addItem(hero, itemSize, itemText), itemSize === 'large' ? { limit: 'largeItems' } : {});
    itemText = '';
  }

  const coins: { key: Coin; label: string }[] = [
    { key: 'gc', label: 'GC' },
    { key: 'sc', label: 'SC' },
    { key: 'cc', label: 'CC' },
  ];
</script>

<section class="strip" aria-label="Quick strip">
  <div class="cell">
    <span class="tag">HP</span>
    <button aria-label="HP down" onclick={() => onedit(adjustHp(hero, -1), { mergeKey: 'hp' })}>−</button>
    <input
      class="num"
      type="text"
      inputmode="numeric"
      aria-label="HP"
      value={hero.hp}
      onchange={(e) => typed(e, hero.hp, null, (n) => adjustHp(hero, n - hero.hp))}
    />
    <button aria-label="HP up" onclick={() => onedit(adjustHp(hero, 1), { mergeKey: 'hp' })}>+</button>
    <span class="of">/ {hero.hpBaseline}</span>
  </div>

  <div class="cell">
    <span class="tag">XP</span>
    <strong class="total" aria-label="XP total">{hero.xp}</strong>
    <span class="of">{threshold === null ? 'top level' : `next at ${threshold}`}</span>
    <form class="inline" onsubmit={(e) => { e.preventDefault(); addXpBox(); }}>
      <input class="num" type="text" inputmode="numeric" aria-label="XP to add" placeholder="+XP" bind:value={xpAmount} />
      <button type="submit" disabled={!Number.isInteger(Number(xpAmount)) || Number(xpAmount) === 0 || xpAmount.trim() === ''}>Add XP</button>
    </form>
  </div>

  <div class="cell coins">
    {#each coins as c (c.key)}
      <span class="coin">
        <span class="tag">{c.label}</span>
        <button aria-label="{c.label} down" disabled={hero.coins[c.key] === 0} onclick={() => onedit(adjustCoin(hero, c.key, -1), { mergeKey: c.key })}>−</button>
        <input
          class="num"
          type="text"
          inputmode="numeric"
          aria-label={c.label}
          value={hero.coins[c.key]}
          onchange={(e) => typed(e, hero.coins[c.key], 0, (n) => adjustCoin(hero, c.key, n - hero.coins[c.key]))}
        />
        <button aria-label="{c.label} up" onclick={() => onedit(adjustCoin(hero, c.key, 1), { mergeKey: c.key })}>+</button>
      </span>
    {/each}
  </div>

  <form class="cell items" onsubmit={(e) => { e.preventDefault(); addItemBox(); }}>
    <input type="text" class="grow" aria-label="Add item" placeholder="Add item" bind:value={itemText} />
    <div class="size" role="group" aria-label="Item size">
      <button type="button" aria-pressed={itemSize === 'large'} onclick={() => (itemSize = 'large')}>Large</button>
      <button type="button" aria-pressed={itemSize === 'small'} onclick={() => (itemSize = 'small')}>Small</button>
    </div>
    <button type="submit" disabled={!itemText.trim()}>Add</button>
  </form>
</section>

<style>
  .strip {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    background: var(--paper-dim);
    border: 2px solid var(--ink);
    border-radius: 8px;
  }
  .cell {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .coin {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .inline {
    display: inline-flex;
    gap: 6px;
    align-items: center;
  }
  .tag {
    min-width: 28px;
    font-weight: 700;
    font-size: 17px;
  }
  .total {
    min-width: 36px;
    font-size: 22px;
    font-variant-numeric: tabular-nums;
  }
  .of {
    font-size: 16px;
    color: var(--muted);
  }
  .num {
    width: 64px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .coins {
    gap: 10px;
  }
  .items .size {
    display: inline-flex;
    gap: 4px;
  }
  .grow {
    flex: 1;
    min-width: 120px;
  }
</style>
