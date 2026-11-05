<script lang="ts">
  import { listLimit, overLimit, type Hero, type ListKey } from '../../systems/dungeon/hero';
  import { knownPotions } from '../../systems/dungeon/potions';
  import type { DungeonTables } from '../../systems/dungeon/tables';
  import { addItem, removeItem } from './heroActions';
  import StringListEditor from './StringListEditor.svelte';

  /** Everything the hero carries: potions, scrolls, large and small items, and rations. */
  interface Props {
    hero: Hero;
    /** The player's table file: its known potions are offered to pick from. */
    tables?: DungeonTables | null;
    onedit: (next: Hero, opts?: { label?: string; mergeKey?: string; limit?: ListKey }) => void;
  }
  let { hero, tables = null, onedit }: Props = $props();

  const known = $derived(knownPotions(tables));
  let picked = $state('');
  let pName = $state('');
  let pEffect = $state('');
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
  function addPotion() {
    if (!pName.trim()) return;
    onedit({ ...hero, potions: [...hero.potions, { name: pName.trim(), effect: pEffect.trim() }] }, { limit: 'potions' });
    pName = '';
    pEffect = '';
  }

  let sDraft = $state({ name: '', orbit: '', dispelDoubles: '', effectModifier: '' });
  function addScroll() {
    if (!sDraft.name.trim()) return;
    onedit({ ...hero, scrolls: [...hero.scrolls, { name: sDraft.name.trim(), orbit: sDraft.orbit.trim(), dispelDoubles: sDraft.dispelDoubles.trim(), effectModifier: sDraft.effectModifier.trim() }] }, { limit: 'scrolls' });
    sDraft = { name: '', orbit: '', dispelDoubles: '', effectModifier: '' };
  }
  function removeRow(key: 'potions' | 'scrolls', i: number) {
    onedit({ ...hero, [key]: hero[key].filter((_, j) => j !== i) });
  }

  const slots = $derived(Math.max(hero.rules.limits.largeItems, hero.largeItems.length));
  let slotText = $state('');
  function addLarge() {
    if (!slotText.trim()) return;
    onedit(addItem(hero, 'large', slotText), { limit: 'largeItems' });
    slotText = '';
  }
  function setRations(n: number) {
    if (n >= 0) onedit({ ...hero, rations: n });
  }
</script>

<div class="page">
  <section>
    <h3 class:over={overLimit(hero, 'potions')}>Potions {hero.potions.length} / {listLimit(hero, 'potions')}</h3>
    {#if hero.potions.length}
      <ul>
        {#each hero.potions as p, i (i)}
          <li>
            <span class="grow"><strong>{p.name}</strong>{p.effect ? ` · ${p.effect}` : ''}</span>
            <button aria-label="Remove {p.name}" onclick={() => removeRow('potions', i)}>Remove</button>
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
    <h3 class:over={overLimit(hero, 'scrolls')}>Scrolls {hero.scrolls.length} / {listLimit(hero, 'scrolls')}</h3>
    {#if hero.scrolls.length}
      <ul>
        {#each hero.scrolls as s, i (i)}
          <li class="scroll">
            <span class="grow"><strong>{s.name}</strong> · orbit {s.orbit} · dispel doubles {s.dispelDoubles} · effect {s.effectModifier}</span>
            <button aria-label="Remove {s.name}" onclick={() => removeRow('scrolls', i)}>Remove</button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="empty">None</p>
    {/if}
    <form class="row" onsubmit={(e) => { e.preventDefault(); addScroll(); }}>
      <input type="text" class="grow" placeholder="Name" aria-label="New scroll name" bind:value={sDraft.name} />
      <input type="text" class="short" placeholder="Orbit" aria-label="New scroll orbit" bind:value={sDraft.orbit} />
      <input type="text" class="short" placeholder="Dispel doubles" aria-label="New scroll dispel doubles" bind:value={sDraft.dispelDoubles} />
      <input type="text" class="short" placeholder="Effect mod" aria-label="New scroll effect modifier" bind:value={sDraft.effectModifier} />
      <button type="submit" disabled={!sDraft.name.trim()}>Add</button>
    </form>
  </section>

  <StringListEditor
    title="Small items"
    items={hero.smallItems}
    placeholder="Small item"
    onadd={(t) => onedit(addItem(hero, 'small', t))}
    onremove={(i) => onedit(removeItem(hero, 'smallItems', i))}
  />

  <section>
    <h3 class:over={overLimit(hero, 'largeItems')}>Large and heavy items {hero.largeItems.length} / {hero.rules.limits.largeItems}</h3>
    <ol class="slots">
      {#each { length: slots } as _, i (i)}
        <li class:over={i >= hero.rules.limits.largeItems}>
          <span class="n">{i + 1}</span>
          {#if hero.largeItems[i] !== undefined}
            <span class="grow">{hero.largeItems[i]}</span>
            <button aria-label="Remove {hero.largeItems[i]}" onclick={() => onedit(removeItem(hero, 'largeItems', i))}>Remove</button>
          {:else}
            <span class="grow empty">empty</span>
          {/if}
        </li>
      {/each}
    </ol>
    <form class="row" onsubmit={(e) => { e.preventDefault(); addLarge(); }}>
      <input type="text" class="grow" placeholder="Large item" aria-label="New large item" bind:value={slotText} />
      <button type="submit" disabled={!slotText.trim()}>Add</button>
    </form>
  </section>

  <section>
    <h3>Rations</h3>
    <div class="row">
      <button aria-label="Rations down" disabled={hero.rations === 0} onclick={() => setRations(hero.rations - 1)}>−</button>
      <strong class="total">{hero.rations}</strong>
      <button aria-label="Rations up" onclick={() => setRations(hero.rations + 1)}>+</button>
    </div>
  </section>
</div>

<style>
  .pick {
    width: 100%;
    max-width: 420px;
    margin-bottom: 8px;
  }
</style>
