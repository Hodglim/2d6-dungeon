<script lang="ts">
  /**
   * Passing a level: the new level's stats, any new manoeuvre slots to fill, and an optional swap
   * of one manoeuvre for another from the weapon (up to the new max manoeuvre level).
   */
  import { levelUp, levelUpChoiceProblem, levelUpOptions, levelUpWith, nextLevelRow, type Hero } from '../../systems/dungeon/hero';
  import type { DungeonTables } from '../../systems/dungeon/tables';
  import ManoeuvreTable from '../ManoeuvreTable.svelte';

  interface Props {
    hero: Hero;
    tables: DungeonTables | null;
    onconfirm: (next: Hero, label: string) => void;
    oncancel: () => void;
  }
  let { hero, tables, onconfirm, oncancel }: Props = $props();

  const row = $derived(nextLevelRow(hero));
  const opts = $derived(levelUpOptions(hero, tables));
  const after = $derived(levelUp(hero));

  let add = $state<string[]>([]);
  let out = $state<string | null>(null);
  let swapIn = $state<string | null>(null);

  const outIndex = $derived(out === null ? -1 : hero.manoeuvres.findIndex((m) => m.name === out));
  const choice = $derived({ add, swap: outIndex >= 0 && swapIn ? { out: outIndex, in: swapIn } : null });
  const problem = $derived(levelUpChoiceProblem(hero, tables, choice));
  /** A swap half made (one dropped, none picked to take its place) holds the level up. */
  const halfSwap = $derived(out !== null && swapIn === null);

  const changes = $derived(
    [
      `HP +${after.hp - hero.hp}`,
      ...(['shift', 'discipline', 'precision'] as const)
        .filter((k) => after[k] !== hero[k])
        .map((k) => `${k[0]!.toUpperCase()}${k.slice(1)} ${hero[k]} → ${after[k]}`),
      ...(after.hpBaseline !== hero.hpBaseline ? [`HP baseline ${hero.hpBaseline} → ${after.hpBaseline}`] : []),
      ...(row && row.maxManoeuvreLevel !== hero.rules.levels.find((l) => l.level === hero.level)?.maxManoeuvreLevel
        ? [`Manoeuvres up to level ${row.maxManoeuvreLevel}`]
        : []),
    ].join(' · '),
  );

  function toggleAdd(name: string) {
    if (add.includes(name)) add = add.filter((n) => n !== name);
    else if (add.length < opts.newSlots) add = [...add, name];
  }
  function toggleOut(name: string) {
    out = out === name ? null : out === null ? name : out;
    if (out === null) swapIn = null;
  }
  function toggleIn(name: string) {
    swapIn = swapIn === name ? null : swapIn === null ? name : swapIn;
  }
  function confirm() {
    if (!row || problem || halfSwap) return;
    onconfirm(levelUpWith(hero, tables, choice), `Level up to ${row.title}`);
  }
</script>

<section class="level-up" aria-labelledby="level-up-title">
  <h3 id="level-up-title">Level up to {row?.title}</h3>
  <p class="changes">Level {after.level} · {changes}</p>

  {#if !tables}
    <p class="note">Load your table file to choose manoeuvres.</p>
  {:else}
    {#if opts.newSlots > 0}
      {@const rows = opts.offered.filter((m) => m.name !== swapIn)}
      <h4>New manoeuvre slot{opts.newSlots === 1 ? '' : 's'}: pick up to {opts.newSlots}</h4>
      {#if rows.length}
        <ManoeuvreTable label="Manoeuvres for the new slots" {rows} selected={add} full={add.length >= opts.newSlots} ontoggle={toggleAdd} />
      {:else}
        <p class="note">{hero.weapon} has no more manoeuvres to offer at this level.</p>
      {/if}
    {/if}
    {#if opts.held.length && opts.offered.some((m) => !add.includes(m.name))}
      <h4>Swap one manoeuvre (optional)</h4>
      <p class="note">Drop one of yours…</p>
      <ManoeuvreTable
        label="Manoeuvre to swap out"
        rows={opts.held.map((m) => ({ name: m.name, dice: m.dice, damage: m.modifier }))}
        selected={out === null ? [] : [out]}
        full={out !== null}
        ontoggle={toggleOut}
      />
      {#if out !== null}
        <p class="note">…for one from {hero.weapon} (up to level {row?.maxManoeuvreLevel})</p>
        <ManoeuvreTable
          label="Manoeuvre to swap in"
          rows={opts.offered.filter((m) => !add.includes(m.name))}
          selected={swapIn === null ? [] : [swapIn]}
          full={swapIn !== null}
          ontoggle={toggleIn}
        />
      {/if}
    {/if}
  {/if}

  {#if problem}<p class="error" role="alert">{problem}</p>{/if}
  <div class="row">
    <button type="button" class="primary" disabled={!!problem || halfSwap} onclick={confirm}>Level up</button>
    <button type="button" onclick={oncancel}>Not now</button>
  </div>
  {#if halfSwap}<p class="note">Pick a manoeuvre to take its place, or untick the one to drop.</p>{/if}
</section>

<style>
  .level-up {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    background: #f1e3b8;
    border: 2px solid var(--ink);
    border-radius: 8px;
  }
  h3 {
    margin: 0;
    font-size: 20px;
  }
  h4 {
    margin: 6px 0 0;
    font-size: 15px;
    font-weight: 600;
    text-transform: uppercase;
  }
  p {
    margin: 0;
  }
  .changes {
    font-size: 16px;
    font-weight: 600;
  }
  .note {
    font-size: 15px;
  }
  .error {
    font-size: 15px;
    color: var(--danger, #9b1c1c);
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  button {
    min-height: 44px;
    padding: 0 14px;
    font: inherit;
    font-size: 17px;
    color: var(--ink);
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 6px;
    cursor: pointer;
    touch-action: manipulation;
  }
  button.primary {
    color: var(--paper);
    background: var(--ink);
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
