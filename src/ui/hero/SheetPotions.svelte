<script lang="ts">
  import { listLimit, overLimit, type Hero, type ListKey } from '../../systems/dungeon/hero';
  import { knownPotions } from '../../systems/dungeon/potions';
  import type { DungeonTables } from '../../systems/dungeon/tables';
  import { adjustCoin, removeItem, type Coin, type StringList } from './heroActions';
  import Boxes from './Boxes.svelte';
  import StringListEditor from './StringListEditor.svelte';

  interface Props {
    hero: Hero;
    /** The player's table file: its known potions are offered to pick from. */
    tables?: DungeonTables | null;
    onedit: (next: Hero, opts?: { label?: string; mergeKey?: string; limit?: ListKey }) => void;
  }
  let { hero, tables = null, onedit }: Props = $props();

  const known = $derived(knownPotions(tables));
  let picked = $state('');
  /** Picking a known potion fills in its name and effect (still editable before Add). */
  function pick(e: Event) {
    const key = (e.currentTarget as HTMLSelectElement).value;
    const [g, i] = key.split(':').map(Number);
    const p = known[g!]?.items[i!];
    if (p) {
      pName = p.name;
      pEffect = p.effect;
    }
    picked = '';
  }

  let pName = $state('');
  let pEffect = $state('');
  const c = $derived(hero.rules.conditions);

  function addPotion() {
    if (!pName.trim()) return;
    onedit({ ...hero, potions: [...hero.potions, { name: pName.trim(), effect: pEffect.trim() }] }, { limit: 'potions' });
    pName = '';
    pEffect = '';
  }
  function setCoin(e: Event, coin: Coin) {
    const el = e.currentTarget as HTMLInputElement;
    const n = Number(el.value.trim());
    if (el.value.trim() === '' || !Number.isInteger(n) || n < 0) {
      el.value = String(hero.coins[coin]);
      return;
    }
    if (n !== hero.coins[coin]) onedit(adjustCoin(hero, coin, n - hero.coins[coin]));
  }
  const addTo = (key: StringList) => (text: string) => onedit({ ...hero, [key]: [...hero[key], text.trim()] });
  const removeFrom = (key: StringList) => (i: number) => onedit(removeItem(hero, key, i));
  const setFavour = (god: string, points: number) =>
    onedit({ ...hero, favour: hero.favour.map((f) => (f.god === god ? { ...f, points } : f)) });

  const coins: { key: Coin; label: string }[] = [
    { key: 'gc', label: 'GC' },
    { key: 'sc', label: 'SC' },
    { key: 'cc', label: 'CC' },
  ];
</script>

<div class="page">
  <section>
    <h3 class:over={overLimit(hero, 'potions')}>Potions {hero.potions.length} / {listLimit(hero, 'potions')}</h3>
    {#if hero.potions.length}
      <ul>
        {#each hero.potions as p, i (i)}
          <li>
            <span class="grow"><strong>{p.name}</strong>{p.effect ? ` · ${p.effect}` : ''}</span>
            <button aria-label="Remove {p.name}" onclick={() => onedit({ ...hero, potions: hero.potions.filter((_, j) => j !== i) })}>Remove</button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">None</p>
    {/if}
    {#if known.length}
      <select class="pick" aria-label="Choose a known potion" bind:value={picked} onchange={pick}>
        <option value="">Choose from your table file…</option>
        {#each known as g, gi (g.label)}
          <optgroup label={g.label}>
            {#each g.items as p, i (p.name)}<option value={`${gi}:${i}`}>{p.name}</option>{/each}
          </optgroup>
        {/each}
      </select>
    {/if}
    <form class="row" onsubmit={(e) => { e.preventDefault(); addPotion(); }}>
      <input type="text" class="short" placeholder="Name" aria-label="New potion name" bind:value={pName} />
      <input type="text" class="grow" placeholder="Effect" aria-label="New potion effect" bind:value={pEffect} />
      <button type="submit" disabled={!pName.trim()}>Add</button>
    </form>
  </section>

  <section>
    <h3>Conditions</h3>
    <div class="cond">
      <span class="cap">{c.bloodied.label}</span>
      <Boxes label={c.bloodied.label} filled={hero.bloodied} total={c.bloodied.boxes} onset={(n) => onedit({ ...hero, bloodied: n })} />
    </div>
    <div class="cond">
      <span class="cap">{c.soaked.label}</span>
      <Boxes label={c.soaked.label} filled={hero.soaked} total={c.soaked.boxes} onset={(n) => onedit({ ...hero, soaked: n })} />
    </div>
    <div class="cond">
      <button aria-pressed={hero.fever} onclick={() => onedit({ ...hero, fever: !hero.fever })}>{c.fever.label}</button>
      <span class="effect">{c.fever.effect}</span>
    </div>
    <div class="cond">
      <button aria-pressed={hero.pneumonia} onclick={() => onedit({ ...hero, pneumonia: !hero.pneumonia })}>{c.pneumonia.label}</button>
      <span class="effect">{c.pneumonia.effect}</span>
    </div>
  </section>

  <section>
    <h3>Coins</h3>
    <div class="row">
      {#each coins as k (k.key)}
        <label>
          <span class="cap">{k.label}</span>
          <input class="num" type="text" inputmode="numeric" aria-label="{k.label} (sheet)" value={hero.coins[k.key]} onchange={(e) => setCoin(e, k.key)} />
        </label>
      {/each}
    </div>
  </section>

  <StringListEditor title="Treasure" items={hero.treasure} placeholder="Treasure" onadd={addTo('treasure')} onremove={removeFrom('treasure')} />
  <StringListEditor title="Prisoners" items={hero.prisoners} placeholder="Prisoner" onadd={addTo('prisoners')} onremove={removeFrom('prisoners')} />
  <StringListEditor title="Side quests" items={hero.sideQuests} placeholder="Side quest" onadd={addTo('sideQuests')} onremove={removeFrom('sideQuests')} />

  <section>
    <h3>Favour</h3>
    {#each hero.favour as f (f.god)}
      <div class="cond">
        <span class="cap">{f.god}</span>
        <Boxes label="{f.god} favour" filled={f.points} total={hero.rules.favourBoxes} onset={(n) => setFavour(f.god, n)} />
      </div>
    {/each}
  </section>
</div>

<style>
  .pick {
    width: 100%;
    max-width: 420px;
    margin-bottom: 8px;
  }
</style>
