<script lang="ts">
  /** What the hero fights with: manoeuvres (offered from the weapon in the table file) and armour. */
  import { listLimit, overLimit, type Hero, type ListKey } from '../../systems/dungeon/hero';
  import type { DungeonTables } from '../../systems/dungeon/tables';
  import DieFace from '../DieFace.svelte';
  import DiceSet from '../DiceSet.svelte';
  import { parseDiceSet } from '../../systems/dungeon/armour';

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

  // typed rows
  const blank = () => ({ name: '', d1: 1, d2: 0, modifier: '' });
  let mDraft = $state(blank());
  let aDraft = $state({ name: '', set: '', modifier: '' });
  const aDice = $derived(parseDiceSet(aDraft.set));
  const diceOf = (d: { d1: number; d2: number }) => (d.d2 ? [d.d1, d.d2] : [d.d1]);

  function addManoeuvre() {
    const d = mDraft;
    if (!d.name.trim()) return;
    onedit({ ...hero, manoeuvres: [...hero.manoeuvres, { name: d.name.trim(), dice: diceOf(d), modifier: d.modifier.trim() }] }, { limit: 'manoeuvres' });
    mDraft = blank();
  }
  /** Armour takes a dice set as printed: "4", "6 & 5", "4 & 3 + 1". */
  function addArmour() {
    if (!aDraft.name.trim() || !aDice) return;
    onedit({ ...hero, armour: [...hero.armour, { name: aDraft.name.trim(), dice: aDice, modifier: aDraft.modifier.trim() }] }, { limit: 'armour' });
    aDraft = { name: '', set: '', modifier: '' };
  }
  function addOffered(m: { name: string; dice: number[]; damage: string }) {
    onedit({ ...hero, manoeuvres: [...hero.manoeuvres, { name: m.name, dice: [...m.dice], modifier: m.damage }] }, { limit: 'manoeuvres' });
  }
  function removeRow(key: 'manoeuvres' | 'armour', i: number) {
    onedit({ ...hero, [key]: hero[key].filter((_, j) => j !== i) });
  }
</script>

{#snippet adder(key: 'manoeuvres', d: { name: string; d1: number; d2: number; modifier: string })}
  <form class="row" onsubmit={(e) => { e.preventDefault(); addManoeuvre(); }}>
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
    <h3 class:over={overLimit(hero, 'manoeuvres')}>Manoeuvres {hero.manoeuvres.length} / {listLimit(hero, 'manoeuvres')}</h3>
    <div class="dgrid">
<div class="drow dhead" aria-hidden="true"><span class="grow">Name</span><span class="dcell">Red</span><span class="dcell">Blue</span><span class="mod">Damage</span><span></span></div>
    <ul>
      {#each hero.manoeuvres as m, i (i)}
        <li class="drow">
          <span class="grow">{m.name}</span>
          <span class="dcell">{#if m.dice[0]}<DieFace value={m.dice[0]} colour="red" />{/if}</span>
          <span class="dcell">{#if m.dice[1]}<DieFace value={m.dice[1]} colour="blue" />{/if}</span>
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
          <li class="drow">
            <span class="grow">{m.name}</span>
            <span class="dcell">{#if m.dice[0]}<DieFace value={m.dice[0]} colour="red" />{/if}</span>
            <span class="dcell">{#if m.dice[1]}<DieFace value={m.dice[1]} colour="blue" />{/if}</span>
            <span class="mod">{m.damage}</span>
            <button aria-label="Add {m.name}" onclick={() => addOffered(m)}>Add</button>
          </li>
        {/each}
      </ul>
    {/if}
    </div>
    {@render adder('manoeuvres', mDraft)}
  </section>

  <section>
    <h3 class:over={overLimit(hero, 'armour')}>Armour {hero.armour.length} / {listLimit(hero, 'armour')}</h3>
    <div class="dgrid">
<div class="drow dhead" aria-hidden="true"><span class="grow">Name</span><span class="dset">Dice set</span><span class="mod">Modifier</span><span></span></div>
    <ul>
      {#each hero.armour as a, i (i)}
        <li class="drow">
          <span class="grow">{a.name}</span>
          <span class="dset"><DiceSet dice={a.dice} size={32} /></span>
          <span class="mod">{a.modifier}</span>
          <button aria-label="Remove {a.name}" onclick={() => removeRow('armour', i)}>Remove</button>
        </li>
      {/each}
    </ul>
    </div>
    <form class="row" onsubmit={(e) => { e.preventDefault(); addArmour(); }}>
      <input type="text" class="grow" placeholder="Name" aria-label="New armour name" bind:value={aDraft.name} />
      <input
        type="text"
        class="short"
        placeholder="Dice set, e.g. 4 & 3 + 1"
        aria-label="New armour dice set"
        aria-invalid={aDraft.set.trim() !== '' && !aDice}
        bind:value={aDraft.set}
      />
      <input type="text" class="short" placeholder="Modifier" aria-label="New armour modifier" bind:value={aDraft.modifier} />
      <button type="submit" disabled={!aDraft.name.trim() || !aDice}>Add</button>
    </form>
    {#if aDraft.set.trim() !== '' && !aDice}
      <p class="empty">Write the dice set as printed: 4, 6 & 5, or 4 & 3 + 1.</p>
    {/if}
  </section>
</div>

<style>
  /* One shared grid per section so held and offered rows line up; li rows are subgrids. */
  .dgrid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 40px 40px max-content max-content;
    column-gap: 8px;
  }
  div.dgrid :global(ul) {
    display: contents;
  }
  .dgrid :global(p) {
    grid-column: 1 / -1;
  }
  .drow,
  .dgrid :global(li.drow) {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: center;
    margin-bottom: 6px;
  }
  .dhead {
    font-size: 15px;
    font-weight: 600;
    color: var(--muted);
    margin-bottom: 2px;
  }
  .dcell {
    display: flex;
    justify-content: center;
    min-height: 36px;
    align-items: center;
  }
  .dhead .dcell {
    min-height: 0;
  }
  /* An armour dice set takes the Red and Blue columns together (it can run to four dice). */
  .dset {
    grid-column: span 2;
    display: flex;
    align-items: center;
    min-height: 36px;
  }
  .dhead .dset {
    min-height: 0;
  }
  .drow .grow {
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .drow .mod {
    min-width: 76px;
    white-space: nowrap;
  }
  .drow button {
    min-height: 44px;
    min-width: 96px;
    padding-inline: 12px;
    text-align: center;
    white-space: nowrap;
  }
</style>
