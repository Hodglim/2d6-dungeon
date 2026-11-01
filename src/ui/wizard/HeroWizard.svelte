<script lang="ts">
  import type { Hero } from '../../systems/dungeon/hero';
  import { createHero } from '../../systems/dungeon/hero';
  import type { DungeonTables } from '../../systems/dungeon/tables';
  import DicePair from '../DicePair.svelte';
  import ManoeuvreTable from '../ManoeuvreTable.svelte';
  import {
    MAX_MAP_SIZE,
    MIN_MAP_SIZE,
    emptyDraft,
    mapSizeProblem,
    pickableManoeuvres,
    startingManoeuvreCount,
    toggleManoeuvre,
    wizardStepValid,
    wizardSteps,
    type WizardMode,
    type WizardStep,
  } from './steps';

  interface Props {
    tables: DungeonTables | null;
    mode: WizardMode;
    onbegin: (result: { width: number; height: number; title: string; hero: Hero | null }) => void;
    oncancel: () => void;
    onloadtables: () => void;
  }

  let { tables, mode, onbegin, oncancel, onloadtables }: Props = $props();

  const steps = $derived(wizardSteps(mode));
  let index = $state(0);
  let draft = $state(emptyDraft());

  const step = $derived<WizardStep>(steps[index]!);
  const valid = $derived(wizardStepValid(step, draft, tables));
  const last = $derived(index === steps.length - 1);
  const sizeError = $derived(mapSizeProblem(draft));
  const count = $derived(tables ? startingManoeuvreCount(tables) : 0);
  const pickable = $derived(tables ? pickableManoeuvres(tables, draft.weapon) : []);
  const shownWeapon = $derived(tables?.tables.weapons.find((w) => w.name === draft.weapon) ?? tables?.tables.weapons[0] ?? null);
  const TITLES: Record<WizardStep, string> = {
    game: 'New game',
    name: 'Name your hero',
    weapon: 'Weapon & manoeuvres',
    armour: 'Choose armour',
    scroll: 'Choose a scroll',
    review: 'Review',
  };

  let cleared = $state(false);
  function chooseWeapon(name: string) {
    if (draft.weapon !== name) {
      cleared = draft.manoeuvres.length > 0;
      draft.manoeuvres = [];
    }
    draft.weapon = name;
  }

  function begin(withHero: boolean) {
    const hero = withHero && tables ? createHero(tables, { ...draft, name: draft.name.trim() }) : null;
    onbegin({ width: draft.width, height: draft.height, title: draft.title.trim(), hero });
  }

  function next() {
    if (!valid) return;
    if (last) begin(true);
    else index += 1;
  }
  const back = () => (index > 0 ? (index -= 1) : oncancel());

  const review = $derived.by(() => {
    if (step !== 'review' || !tables || !valid) return null;
    return createHero(tables, { ...draft, name: draft.name.trim() });
  });
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && oncancel()} />

<div class="scrim">
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="wizard-title" data-step={step}>
    <header>
      <h2 id="wizard-title">{TITLES[step]}</h2>
      <p class="progress">Step {index + 1} of {steps.length}</p>
    </header>

    <div class="body">
      {#if step === 'game'}
        <div class="row">
          <label>Width <input type="number" min={MIN_MAP_SIZE} max={MAX_MAP_SIZE} step="1" inputmode="numeric" bind:value={draft.width} /></label>
          <label>Height <input type="number" min={MIN_MAP_SIZE} max={MAX_MAP_SIZE} step="1" inputmode="numeric" bind:value={draft.height} /></label>
        </div>
        <label>Title <input type="text" bind:value={draft.title} placeholder="Optional" autocomplete="off" /></label>
        {#if sizeError}<p class="error" role="alert">{sizeError}</p>{/if}
        {#if !tables}
          <p class="note">No table file is loaded, so you can't make a hero yet. Load your table file, or start with the map only.</p>
          <div><button type="button" onclick={onloadtables}>Load table file…</button></div>
        {/if}
        <div><button type="button" class="start-bare" disabled={!!sizeError} onclick={() => begin(false)}>Start without a hero</button></div>
      {:else if step === 'name'}
        <label>Name <input type="text" bind:value={draft.name} placeholder="Your hero's name" autocomplete="off" /></label>
        {#if tables}
          {@const s = tables.tables.starting}
          <p class="note">Every hero starts the same: Level {s.level}, {s.hp} HP, Shift {s.shift}, Discipline {s.discipline}, Precision {s.precision}.</p>
        {/if}
      {:else if step === 'weapon' && tables}
        {@const level = tables.tables.starting.level}
        <div class="weapons" role="group" aria-label="Weapons">
          {#each tables.tables.weapons as w (w.name)}
            {@const n = w.manoeuvres.filter((m) => m.level === level).length}
            <button type="button" class="option weapon" class:preview={shownWeapon?.name === w.name && draft.weapon !== w.name} aria-pressed={draft.weapon === w.name} onclick={() => chooseWeapon(w.name)}>
              <strong>{w.name}</strong>
              <span class="dmg">{n} manoeuvre{n === 1 ? '' : 's'}</span>
            </button>
          {/each}
        </div>
        {#if shownWeapon}
          <p class="note">
            {#if !draft.weapon}Tap a weapon to choose it. Previewing {shownWeapon.name}.
            {:else}Pick {count} ({draft.manoeuvres.length} chosen).
              {#if draft.manoeuvres.length >= count}<span class="hint">Deselect one to choose another</span>{/if}
            {/if}
            {#if cleared}<span class="hint">Your picks were cleared</span>{/if}
          </p>
          <ManoeuvreTable
            label="{shownWeapon.name} manoeuvres"
            rows={draft.weapon ? pickable : shownWeapon.manoeuvres.filter((m) => m.level === level)}
            selected={draft.manoeuvres}
            disabled={!draft.weapon}
            full={draft.manoeuvres.length >= count}
            ontoggle={(name) => { cleared = false; draft.manoeuvres = toggleManoeuvre(draft.manoeuvres, name, count); }}
          />
        {/if}
      {:else if step === 'armour' && tables}
        <div class="options">
          {#each tables.tables.startingArmour as a (a.name)}
            <button type="button" class="option" aria-pressed={draft.armour === a.name} onclick={() => (draft.armour = a.name)}>
              <strong>{a.name}</strong>
              <span class="line"><DicePair dice={a.dice} /> <span class="dmg">Modifier {a.modifier}</span></span>
            </button>
          {/each}
        </div>
      {:else if step === 'scroll' && tables}
        <div class="options">
          {#each tables.tables.startingScrolls as s (s.name)}
            <button type="button" class="option" aria-pressed={draft.scroll === s.name} onclick={() => (draft.scroll = s.name)}>
              <strong>{s.name}</strong>
              <span class="dmg">{s.effect}</span>
            </button>
          {/each}
        </div>
      {:else if step === 'review' && review}
        {@const sc = review.scrolls[0]}
        {@const kit = [...review.smallItems, ...review.largeItems]}
        <div class="sheet">
          <header class="card-head">
            <h3>{review.name}</h3>
            <p class="sub">Level {review.level} · {review.title}</p>
          </header>
          <div class="tiles">
            {#each [['HP', review.hp], ['Shift', review.shift], ['Discipline', review.discipline], ['Precision', review.precision]] as [label, n] (label)}
              <div class="tile"><span class="num">{n}</span><span class="lab">{label}</span></div>
            {/each}
          </div>
          <div class="cols">
            <section class="left">
              <h4>Weapon — {review.weapon}</h4>
              <ManoeuvreTable label="Manoeuvres" rows={review.manoeuvres.map((m) => ({ name: m.name, dice: m.dice, damage: m.modifier }))} />
              <h4>Armour</h4>
              <ManoeuvreTable label="Armour" lastLabel="Modifier" rows={review.armour.map((a) => ({ name: a.name, dice: a.dice, damage: a.modifier }))} />
            </section>
            <section class="right">
              <h4>Scroll</h4>
              {#if sc}
                <p class="item">{sc.name}</p>
                <p class="muted">{[sc.effectModifier, sc.orbit && `Orbit ${sc.orbit}`, sc.dispelDoubles && `Dispel doubles ${sc.dispelDoubles}`].filter(Boolean).join(' · ')}</p>
              {:else}<p class="muted">None</p>{/if}
              <h4>Potions</h4>
              {#if review.potions.length}<ul class="chips">{#each review.potions as p, i (i)}<li>{p.name}</li>{/each}</ul>{:else}<p class="muted">None</p>{/if}
              <h4>Kit</h4>
              {#if kit.length}<ul class="chips">{#each kit as k, i (i)}<li>{k}</li>{/each}</ul>{:else}<p class="muted">None</p>{/if}
              <h4>Rations</h4>
              <p class="item">{review.rations}</p>
            </section>
          </div>
        </div>
      {/if}
    </div>

    <footer>
      <button type="button" class="cancel" onclick={oncancel}>Cancel</button>
      <span class="spacer"></span>
      <button type="button" class="back" disabled={index === 0} onclick={back}>Back</button>
      <button type="button" class="primary next" disabled={!valid} onclick={next}>{last ? 'Begin' : 'Next'}</button>
    </footer>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(20, 16, 10, 0.45);
  }
  .dialog {
    display: flex;
    flex-direction: column;
    width: min(900px, 100%);
    height: min(85vh, calc(100vh - 32px));
    padding: 18px 22px;
    box-sizing: border-box;
    background: var(--paper);
    color: var(--ink);
    border: 2px solid var(--ink);
    border-radius: 8px;
  }
  header h2 {
    margin: 0;
    font-size: 24px;
  }
  .progress {
    margin: 2px 0 10px;
    font-size: 15px;
    opacity: 0.75;
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 2px;
  }
  footer {
    display: flex;
    gap: 10px;
    padding-top: 12px;
  }
  .spacer {
    flex: 1;
  }
  .row {
    display: flex;
    gap: 14px;
  }
  .row label {
    flex: 1;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 17px;
    font-weight: 600;
  }
  input {
    min-height: 48px;
    padding: 0 12px;
    font: inherit;
    font-size: 19px;
    font-weight: 400;
    color: var(--ink);
    background: #fff;
    border: 2px solid var(--ink);
    border-radius: 6px;
    min-width: 0;
  }
  .error {
    margin: 0;
    color: var(--danger);
    font-size: 17px;
  }
  .note {
    margin: 0;
    font-size: 17px;
  }
  .options {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .option {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    text-align: left;
    padding: 10px 14px;
    min-height: 56px;
  }
  .option[aria-pressed='true'] {
    background: #f1e3b8;
    border-width: 4px;
    padding: 8px 12px;
  }
  .weapons {
    position: sticky;
    top: -2px;
    z-index: 1;
    background: var(--paper);
    padding: 2px 0 6px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .weapon {
    flex: 1 1 180px;
    min-height: 64px;
    justify-content: center;
  }
  .weapon.preview {
    border-style: dashed;
  }
  .hint {
    margin-left: 8px;
    font-weight: 600;
    color: var(--danger);
  }
  .dmg {
    font-weight: 400;
    font-size: 16px;
  }
  .sheet {
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .card-head h3 {
    margin: 0;
    font-size: 32px;
    line-height: 1.1;
  }
  .sub {
    margin: 2px 0 0;
    font-size: 17px;
    color: var(--muted);
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 6px 4px;
    border: 2px solid var(--ink);
    border-radius: 6px;
  }
  .tile .num {
    font-size: 30px;
    font-weight: 700;
    line-height: 1.1;
  }
  .tile .lab,
  .sheet h4 {
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  .sheet h4 {
    margin: 0 0 6px;
  }
  .cols {
    display: grid;
    grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
    gap: 14px 24px;
  }
  .left h4:not(:first-child) {
    margin-top: 12px;
  }
  .right h4:not(:first-child) {
    margin-top: 12px;
  }
  .right p {
    margin: 0;
  }
  .item {
    font-size: 18px;
    font-weight: 600;
  }
  .muted {
    font-size: 15px;
    color: var(--muted);
  }
  .chips {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chips li {
    padding: 4px 10px;
    border: 1px solid var(--muted);
    border-radius: 14px;
    font-size: 16px;
  }
  @container (max-width: 640px) {
    .cols {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  button {
    min-width: 96px;
    min-height: 48px;
    padding: 0 18px;
    font: inherit;
    font-size: 18px;
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
    opacity: 0.45;
    cursor: default;
  }
</style>
