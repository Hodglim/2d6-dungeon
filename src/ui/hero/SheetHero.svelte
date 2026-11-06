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
  type WholeKey = 'level' | 'hpBaseline' | Stat;

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
  <section class="fields">
    <div class="row ident">
      <label class="grow"><span class="cap">Name</span><input type="text" aria-label="Hero name" value={hero.name} onchange={(e) => setText(e, 'name')} /></label>
      <label class="grow"><span class="cap">Weapon</span><input type="text" aria-label="Hero weapon" value={hero.weapon} onchange={(e) => setText(e, 'weapon')} /></label>
    </div>
    <div class="row ident">
      <label><span class="cap">Level</span><input class="num" type="text" inputmode="numeric" aria-label="Hero level" value={hero.level} onchange={(e) => setWhole(e, 'level', 1)} /></label>
      <label class="grow"><span class="cap">Title</span><input type="text" aria-label="Hero title" value={hero.title} onchange={(e) => setText(e, 'title')} /></label>
      <label><span class="cap">HP baseline</span><input class="num" type="text" inputmode="numeric" aria-label="HP baseline" value={hero.hpBaseline} onchange={(e) => setWhole(e, 'hpBaseline', 0)} /></label>
    </div>
    <div class="row stats">
      {#each stats as s (s)}
        <label>
          <span class="cap">{s}</span>
          <input class="num" type="text" inputmode="numeric" value={hero[s]} onchange={(e) => setWhole(e, s, 0)} />
        </label>
      {/each}
    </div>
    <label>
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

  <!-- Each tracker's name sits above its boxes, so a row of boxes never has to share its line. -->
  <section>
    <h3>Conditions</h3>
    <div class="tracker" data-testid="conditions">
      <div class="meter">
        <span class="what">{c.bloodied.label}</span>
        <Boxes label={c.bloodied.label} filled={hero.bloodied} total={c.bloodied.boxes} onset={(n) => onedit({ ...hero, bloodied: n })} />
      </div>
      <div class="meter">
        <span class="what">{c.soaked.label}</span>
        <Boxes label={c.soaked.label} filled={hero.soaked} total={c.soaked.boxes} onset={(n) => onedit({ ...hero, soaked: n })} />
      </div>
      <!-- Both toggles as wide as the wider one, so their effects line up. -->
      <div class="toggles">
        <button class="toggle" aria-pressed={hero.fever} onclick={() => onedit({ ...hero, fever: !hero.fever })}>{c.fever.label}</button>
        <span class="effect">{c.fever.effect}</span>
        <button class="toggle" aria-pressed={hero.pneumonia} onclick={() => onedit({ ...hero, pneumonia: !hero.pneumonia })}>{c.pneumonia.label}</button>
        <span class="effect">{c.pneumonia.effect}</span>
      </div>
    </div>
  </section>

  {#if hero.favour.length}
    <section>
      <h3>Favour</h3>
      <div class="tracker" data-testid="favour">
        {#each hero.favour as f (f.god)}
          <div class="meter">
            <span class="what">{f.god}</span>
            <Boxes label="{f.god} favour" filled={f.points} total={hero.rules.favourBoxes} onset={(n) => setFavour(f.god, n)} />
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>

<style>
  /* Room between the rows of fields, so no row's controls touch the next. */
  .fields {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .tracker {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .meter {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .what {
    font-size: 16px;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .toggles {
    display: grid;
    grid-template-columns: max-content minmax(0, 1fr);
    align-items: center;
    gap: 10px 14px;
  }
  .toggle {
    justify-self: stretch;
  }
  .effect {
    overflow-wrap: anywhere;
  }
  /* Too narrow for an effect beside its toggle: each effect sits under its own toggle. */
  @container (max-width: 360px) {
    .toggles {
      grid-template-columns: minmax(0, 1fr);
      row-gap: 4px;
    }
    .toggle {
      justify-self: start;
    }
  }
</style>
