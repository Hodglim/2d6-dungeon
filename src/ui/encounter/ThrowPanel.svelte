<script lang="ts">
  // Before the hero's attack: throw a carried throwing weapon (round 1, once a fight) or potion bomb
  // at a standing creature. Each throw rolls, uses up what was thrown and takes the damage off.
  import type { Encounter, Foe, ThrowLog } from '../../systems/dungeon/combat';
  import type { Hero } from '../../systems/dungeon/hero';
  import { carriedBombs, carriedThrowing, type CarriedWeapon, type PotionBomb } from '../../systems/dungeon/throwing';
  import type { DungeonTables } from '../../systems/dungeon/tables';

  interface Props {
    encounter: Encounter;
    hero: Hero;
    tables: DungeonTables;
    onweapon: (c: CarriedWeapon, foeId: string) => void;
    onbomb: (c: { bomb: PotionBomb; index: number }, foeId: string) => void;
  }
  let { encounter, hero, tables, onweapon, onbomb }: Props = $props();

  const standing = $derived(encounter.foes.filter((f) => f.hp > 0));
  let picked = $state('');
  const target = $derived(standing.find((f) => f.id === picked) ?? standing[0] ?? null);

  /** One throwing weapon at the start of a fight: round 1, and none thrown yet. */
  const weaponOpen = $derived(encounter.round === 1 && !(encounter.throws ?? []).some((t) => t.kind === 'weapon'));
  const weapons = $derived(weaponOpen ? carriedThrowing(hero, tables.tables.throwingWeapons ?? []) : []);
  /** One button per kind of bomb carried, throwing the first of them. */
  const bombs = $derived.by(() => {
    const all = carriedBombs(hero, tables.tables.potionBombs ?? []);
    const seen = new Map<string, { bomb: PotionBomb; index: number; count: number }>();
    for (const b of all) {
      const s = seen.get(b.bomb.name);
      if (s) s.count++;
      else seen.set(b.bomb.name, { ...b, count: 1 });
    }
    return [...seen.values()];
  });
  const thisRound = $derived((encounter.throws ?? []).filter((t) => t.round === encounter.round));
  const foeName = (id: string) => encounter.foes.find((f: Foe) => f.id === id)?.name ?? 'the creature';

  function line(t: ThrowLog): string {
    if (t.kind === 'weapon') {
      const off = t.interrupts?.length ? `, ${t.interrupts.join(' and ')} took some off` : '';
      const lost = t.deflected ? ' Deflected: the weapon is lost.' : '';
      return `${t.name} at ${foeName(t.foeId)}: D66 ${t.faces.join('')}${off}. ${t.damage} damage.${lost}`;
    }
    const rolled = t.faces.length ? ` (rolled ${t.faces.join(' + ')})` : '';
    return `${t.name} at ${foeName(t.foeId)}: ${t.damage ? `${t.damage} damage${rolled}.` : 'no damage.'}`;
  }
</script>

{#if standing.length && (weapons.length || bombs.length || thisRound.length)}
  <section class="throw" aria-labelledby="throw-title" data-testid="throw-panel">
    <h3 id="throw-title">Throw before you attack</h3>
    {#if standing.length > 1 && (weapons.length || bombs.length)}
      <label class="target">
        <span>At</span>
        <select bind:value={picked} aria-label="Throw at">
          {#each standing as f (f.id)}<option value={f.id}>{f.name}</option>{/each}
        </select>
      </label>
    {/if}
    {#if target && (weapons.length || bombs.length)}
      <div class="row">
        {#each weapons as w (`${w.list}:${w.index}`)}
          <button type="button" onclick={() => onweapon(w, target.id)}>🗡 Throw {w.item}</button>
        {/each}
        {#each bombs as b (b.bomb.name)}
          <button type="button" title={b.bomb.effect} onclick={() => onbomb(b, target.id)}>💣 {b.bomb.name}{b.count > 1 ? ` (${b.count})` : ''}</button>
        {/each}
      </div>
    {/if}
    {#if thisRound.length}
      <ul class="log" aria-label="Thrown this round">
        {#each thisRound as t, i (i)}<li data-testid="throw-result">{line(t)}</li>{/each}
      </ul>
    {/if}
  </section>
{/if}

<style>
  .throw {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 10px;
    border: 2px solid var(--rule);
    border-radius: 8px;
    background: var(--paper);
  }
  h3 {
    margin: 0;
    font-size: 16px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
  }
  .target {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 17px;
  }
  select {
    min-height: 44px;
    font: inherit;
    font-size: 17px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  button {
    min-height: 44px;
    padding: 0 12px;
    font: inherit;
    font-size: 17px;
    color: var(--ink);
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 6px;
    cursor: pointer;
    touch-action: manipulation;
  }
  button:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
  .log {
    margin: 0;
    padding-left: 18px;
    font-size: 16px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
</style>
