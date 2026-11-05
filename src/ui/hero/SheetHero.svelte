<script lang="ts">
  import type { Hero, ListKey } from '../../systems/dungeon/hero';
  import Boxes from './Boxes.svelte';

  /** Who the hero is and how they are doing: identity, stats, Conditions and Favour. */
  interface Props {
    hero: Hero;
    onedit: (next: Hero, opts?: { label?: string; mergeKey?: string; limit?: ListKey }) => void;
  }
  let { hero, onedit }: Props = $props();

  const c = $derived(hero.rules.conditions);

  type Stat = 'shift' | 'discipline' | 'precision';
  const stats: Stat[] = ['shift', 'discipline', 'precision'];
  type TextKey = 'name' | 'weapon' | 'title';
  type WholeKey = 'level' | 'hpBaseline' | 'xp' | Stat;

  /** Free text: one commit per change, no mergeKey. */
  function setText(e: Event, key: TextKey) {
    const v = (e.currentTarget as HTMLInputElement).value;
    if (v !== hero[key]) onedit({ ...hero, [key]: v });
  }
  /** A whole number at or above `min`; anything else snaps back. Level changes no other stat. */
  function setWhole(e: Event, key: WholeKey, min: number) {
    const el = e.currentTarget as HTMLInputElement;
    const n = Number(el.value.trim());
    if (el.value.trim() === '' || !Number.isInteger(n) || n < min) {
      el.value = String(hero[key]);
      return;
    }
    if (n !== hero[key]) onedit({ ...hero, [key]: n });
  }
  function setRunes(e: Event) {
    const v = (e.currentTarget as HTMLInputElement).value;
    if (v !== hero.appliedRunes) onedit({ ...hero, appliedRunes: v });
  }
  const setFavour = (god: string, points: number) =>
    onedit({ ...hero, favour: hero.favour.map((f) => (f.god === god ? { ...f, points } : f)) });
</script>

<div class="page">
  <section>
    <div class="row ident">
      <label class="grow"><span class="cap">Name</span><input type="text" aria-label="Hero name" value={hero.name} onchange={(e) => setText(e, 'name')} /></label>
      <label class="grow"><span class="cap">Weapon</span><input type="text" aria-label="Hero weapon" value={hero.weapon} onchange={(e) => setText(e, 'weapon')} /></label>
    </div>
    <div class="row ident">
      <label><span class="cap">Level</span><input class="num" type="text" inputmode="numeric" aria-label="Hero level" value={hero.level} onchange={(e) => setWhole(e, 'level', 1)} /></label>
      <label class="grow"><span class="cap">Title</span><input type="text" aria-label="Hero title" value={hero.title} onchange={(e) => setText(e, 'title')} /></label>
      <label><span class="cap">HP baseline</span><input class="num" type="text" inputmode="numeric" aria-label="HP baseline" value={hero.hpBaseline} onchange={(e) => setWhole(e, 'hpBaseline', 0)} /></label>
      <label><span class="cap">XP</span><input class="num" type="text" inputmode="numeric" aria-label="XP total" value={hero.xp} onchange={(e) => setWhole(e, 'xp', 0)} /></label>
    </div>
    <div class="row stats">
      {#each stats as s (s)}
        <label>
          <span class="cap">{s}</span>
          <input class="num" type="text" inputmode="numeric" value={hero[s]} onchange={(e) => setWhole(e, s, 0)} />
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

  <!-- One name column shared by both sections: every row's boxes (or effect) start on the same line. -->
  <div class="tracks">
  <section class="track">
    <h3>Conditions</h3>
    <div class="tracker" data-testid="conditions">
      <span class="what">{c.bloodied.label}</span>
      <Boxes label={c.bloodied.label} filled={hero.bloodied} total={c.bloodied.boxes} onset={(n) => onedit({ ...hero, bloodied: n })} />
      <span class="what">{c.soaked.label}</span>
      <Boxes label={c.soaked.label} filled={hero.soaked} total={c.soaked.boxes} onset={(n) => onedit({ ...hero, soaked: n })} />
      <button class="toggle" aria-pressed={hero.fever} onclick={() => onedit({ ...hero, fever: !hero.fever })}>{c.fever.label}</button>
      <span class="effect">{c.fever.effect}</span>
      <button class="toggle" aria-pressed={hero.pneumonia} onclick={() => onedit({ ...hero, pneumonia: !hero.pneumonia })}>{c.pneumonia.label}</button>
      <span class="effect">{c.pneumonia.effect}</span>
    </div>
  </section>

  {#if hero.favour.length}
    <section class="track">
      <h3>Favour</h3>
      <div class="tracker" data-testid="favour">
        {#each hero.favour as f (f.god)}
          <span class="what">{f.god}</span>
          <Boxes label="{f.god} favour" filled={f.points} total={hero.rules.favourBoxes} onset={(n) => setFavour(f.god, n)} />
        {/each}
      </div>
    </section>
  {/if}
  </div>
</div>

<style>
  .tracks {
    container-type: inline-size;
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    column-gap: 14px;
    row-gap: 16px;
  }
  .track,
  .tracker {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: center;
    row-gap: 10px;
  }
  .track :global(h3) {
    grid-column: 1 / -1;
    margin-bottom: 0;
  }
  .what {
    font-size: 16px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  /* Both toggles as wide as the name column, so their effects line up with the boxes above. */
  .toggle {
    justify-self: stretch;
  }
  /* Too narrow for a name beside its boxes: each name sits on top of its own row. */
  @container (max-width: 520px) {
    .tracks {
      grid-template-columns: minmax(0, 1fr);
    }
    .tracker {
      row-gap: 4px;
    }
    .tracker > :global(:nth-child(2n)) {
      margin-bottom: 10px;
    }
    .toggle {
      justify-self: start;
    }
  }
</style>
