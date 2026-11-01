<script lang="ts">
  import { listLimit, overLimit, type Hero, type ListKey } from '../../systems/dungeon/hero';
  import type { DungeonTables } from '../../systems/dungeon/tables';
  import DicePair from '../DicePair.svelte';

  interface Props {
    hero: Hero;
    tables: DungeonTables | null;
    onedit: (next: Hero, opts?: { label?: string; mergeKey?: string; limit?: ListKey }) => void;
  }
  let { hero, tables, onedit }: Props = $props();

  const row = $derived(hero.rules.levels.find((l) => l.level === hero.level) ?? null);
  const weapon = $derived(tables?.tables.weapons.find((w) => w.name === hero.weapon) ?? null);
  /** The weapon's manoeuvres this level may hold, less the ones already on the sheet. */
  const offered = $derived(
    weapon && row ? weapon.manoeuvres.filter((m) => m.level <= row.maxManoeuvreLevel && !hero.manoeuvres.some((x) => x.name === m.name)) : [],
  );

  type Stat = 'shift' | 'discipline' | 'precision';
  const stats: Stat[] = ['shift', 'discipline', 'precision'];

  function setStat(e: Event, key: Stat) {
    const el = e.currentTarget as HTMLInputElement;
    const n = Number(el.value.trim());
    if (el.value.trim() === '' || !Number.isInteger(n) || n < 0) {
      el.value = String(hero[key]);
      return;
    }
    if (n !== hero[key]) onedit({ ...hero, [key]: n });
  }
  function setRunes(e: Event) {
    const v = (e.currentTarget as HTMLInputElement).value;
    if (v !== hero.appliedRunes) onedit({ ...hero, appliedRunes: v });
  }

  // typed rows
  const blank = () => ({ name: '', d1: 1, d2: 0, modifier: '' });
  let mDraft = $state(blank());
  let aDraft = $state(blank());
  let sDraft = $state({ name: '', orbit: '', dispelDoubles: '', effectModifier: '' });
  const diceOf = (d: { d1: number; d2: number }) => (d.d2 ? [d.d1, d.d2] : [d.d1]);

  function addRow(key: 'manoeuvres' | 'armour') {
    const d = key === 'manoeuvres' ? mDraft : aDraft;
    if (!d.name.trim()) return;
    onedit({ ...hero, [key]: [...hero[key], { name: d.name.trim(), dice: diceOf(d), modifier: d.modifier.trim() }] }, { limit: key });
    if (key === 'manoeuvres') mDraft = blank();
    else aDraft = blank();
  }
  function addOffered(m: { name: string; dice: number[]; damage: string }) {
    onedit({ ...hero, manoeuvres: [...hero.manoeuvres, { name: m.name, dice: [...m.dice], modifier: m.damage }] }, { limit: 'manoeuvres' });
  }
  function removeRow(key: 'manoeuvres' | 'armour' | 'scrolls', i: number) {
    onedit({ ...hero, [key]: hero[key].filter((_, j) => j !== i) });
  }
  function addScroll() {
    if (!sDraft.name.trim()) return;
    onedit({ ...hero, scrolls: [...hero.scrolls, { name: sDraft.name.trim(), orbit: sDraft.orbit.trim(), dispelDoubles: sDraft.dispelDoubles.trim(), effectModifier: sDraft.effectModifier.trim() }] }, { limit: 'scrolls' });
    sDraft = { name: '', orbit: '', dispelDoubles: '', effectModifier: '' };
  }
</script>

{#snippet adder(key: 'manoeuvres' | 'armour', d: { name: string; d1: number; d2: number; modifier: string })}
  <form class="row" onsubmit={(e) => { e.preventDefault(); addRow(key); }}>
    <input type="text" class="grow" placeholder="Name" aria-label="New {key} name" bind:value={d.name} />
    <select aria-label="New {key} red die" bind:value={d.d1}>
      {#each [1, 2, 3, 4, 5, 6] as n (n)}<option value={n}>{n}</option>{/each}
    </select>
    <select aria-label="New {key} blue die" bind:value={d.d2}>
      <option value={0}>none</option>
      {#each [1, 2, 3, 4, 5, 6] as n (n)}<option value={n}>{n}</option>{/each}
    </select>
    <input type="text" class="short" placeholder="Modifier" aria-label="New {key} modifier" bind:value={d.modifier} />
    <button type="submit" disabled={!d.name.trim()}>Add</button>
  </form>
{/snippet}

<div class="page">
  <section>
    <h3>{hero.name}</h3>
    <p>{hero.weapon} · Level {hero.level} {hero.title}</p>
    <div class="row stats">
      {#each stats as s (s)}
        <label>
          <span class="cap">{s}</span>
          <input class="num" type="text" inputmode="numeric" value={hero[s]} onchange={(e) => setStat(e, s)} />
        </label>
      {/each}
    </div>
    <label class="wide">
      <span class="cap">Applied runes</span>
      <input type="text" value={hero.appliedRunes} onchange={setRunes} />
    </label>
    <div class="cond legend">
      <span class="cap">Legend level</span>
      <button aria-label="Legend level down" disabled={hero.legendLevel === 0} onclick={() => onedit({ ...hero, legendLevel: hero.legendLevel - 1 })}>−</button>
      <strong class="total">{hero.legendLevel}</strong>
      <button aria-label="Legend level up" disabled={hero.legendLevel >= 10} onclick={() => onedit({ ...hero, legendLevel: hero.legendLevel + 1 })}>+</button>
    </div>
  </section>

  <section>
    <h3 class:over={overLimit(hero, 'manoeuvres')}>Manoeuvres {hero.manoeuvres.length} / {listLimit(hero, 'manoeuvres')}</h3>
    <ul>
      {#each hero.manoeuvres as m, i (i)}
        <li>
          <span class="grow">{m.name}</span>
          <DicePair dice={m.dice} />
          <span class="mod">{m.modifier}</span>
          <button aria-label="Remove {m.name}" onclick={() => removeRow('manoeuvres', i)}>Remove</button>
        </li>
      {/each}
    </ul>
    {#if !tables}
      <p class="empty">Load your table file to choose manoeuvres</p>
    {:else if offered.length}
      <p class="cap">Choose from {hero.weapon} (up to level {row?.maxManoeuvreLevel ?? hero.level})</p>
      <ul>
        {#each offered as m (m.name)}
          <li>
            <span class="grow">{m.name}</span>
            <DicePair dice={m.dice} />
            <span class="mod">{m.damage}</span>
            <button aria-label="Add {m.name}" onclick={() => addOffered(m)}>Add</button>
          </li>
        {/each}
      </ul>
    {/if}
    {@render adder('manoeuvres', mDraft)}
  </section>

  <section>
    <h3 class:over={overLimit(hero, 'armour')}>Armour {hero.armour.length} / {listLimit(hero, 'armour')}</h3>
    <ul>
      {#each hero.armour as a, i (i)}
        <li>
          <span class="grow">{a.name}</span>
          <DicePair dice={a.dice} />
          <span class="mod">{a.modifier}</span>
          <button aria-label="Remove {a.name}" onclick={() => removeRow('armour', i)}>Remove</button>
        </li>
      {/each}
    </ul>
    {@render adder('armour', aDraft)}
  </section>

  <section>
    <h3 class:over={overLimit(hero, 'scrolls')}>Scrolls {hero.scrolls.length} / {listLimit(hero, 'scrolls')}</h3>
    <ul>
      {#each hero.scrolls as s, i (i)}
        <li class="scroll">
          <span class="grow"><strong>{s.name}</strong> · orbit {s.orbit} · dispel doubles {s.dispelDoubles} · effect {s.effectModifier}</span>
          <button aria-label="Remove {s.name}" onclick={() => removeRow('scrolls', i)}>Remove</button>
        </li>
      {/each}
    </ul>
    <form class="row" onsubmit={(e) => { e.preventDefault(); addScroll(); }}>
      <input type="text" class="grow" placeholder="Name" aria-label="New scroll name" bind:value={sDraft.name} />
      <input type="text" class="short" placeholder="Orbit" aria-label="New scroll orbit" bind:value={sDraft.orbit} />
      <input type="text" class="short" placeholder="Dispel doubles" aria-label="New scroll dispel doubles" bind:value={sDraft.dispelDoubles} />
      <input type="text" class="short" placeholder="Effect mod" aria-label="New scroll effect modifier" bind:value={sDraft.effectModifier} />
      <button type="submit" disabled={!sDraft.name.trim()}>Add</button>
    </form>
  </section>
</div>
