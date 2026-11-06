<script lang="ts">
  import DieFace from './DieFace.svelte';

  interface Row {
    name: string;
    dice: number[];
    damage: string;
  }
  interface Props {
    rows: Row[];
    /** Names currently picked; when given, each row becomes a toggle with a checkbox cell. */
    selected?: string[];
    /** True when no more may be picked (unpicked rows then look dimmed and ignore taps). */
    full?: boolean;
    ontoggle?: (name: string) => void;
    label?: string;
    /** Preview only: tick boxes shown but not usable. */
    disabled?: boolean;
    /** Header for the last column (Damage for manoeuvres, Modifier for armour). */
    lastLabel?: string;
    /** A second section in the same grid (e.g. armour) so its columns line up with the rows above. */
    extra?: { title: string; lastLabel: string; rows: Row[] };
  }
  let { rows, selected, full = false, ontoggle, label = 'Manoeuvres', disabled = false, lastLabel = 'Damage', extra }: Props = $props();
  const selectable = $derived(selected !== undefined);
</script>

<div class="mtable" class:selectable role="group" aria-label={label}>
  <div class="head" aria-hidden="true">
    {#if selectable}<span class="pick"></span>{/if}
    <span class="name">Name</span><span class="dcell">Red</span><span class="dcell">Blue</span><span class="dmg">{lastLabel}</span>
  </div>
  {#each rows as m (m.name)}
    {#snippet cells()}
      {#if selectable}<span class="pick"><span class="box" aria-hidden="true">{selected?.includes(m.name) ? '✓' : ''}</span></span>{/if}
      <span class="name">{m.name}</span>
      <span class="dcell">{#if m.dice[0]}<DieFace value={m.dice[0]} colour="red" size={36} />{/if}</span>
      <span class="dcell">{#if m.dice[1]}<DieFace value={m.dice[1]} colour="blue" size={36} />{/if}</span>
      <span class="dmg">{m.damage}</span>
    {/snippet}
    {#if selectable}
      {@const on = !!selected?.includes(m.name)}
      <button type="button" class="row" role="checkbox" aria-checked={on} aria-disabled={disabled || (full && !on)} {disabled} class:on class:dim={disabled || (full && !on)} onclick={() => ontoggle?.(m.name)}>
        {@render cells()}
      </button>
    {:else}
      <div class="row">{@render cells()}</div>
    {/if}
  {/each}
  {#if extra}
    <h4 class="section">{extra.title}</h4>
    <div class="head" aria-hidden="true">
      <span class="name">Name</span><span class="dcell">Red</span><span class="dcell">Blue</span><span class="dmg">{extra.lastLabel}</span>
    </div>
    {#each extra.rows as m (m.name)}
      <div class="row">
        <span class="name">{m.name}</span>
        <span class="dcell">{#if m.dice[0]}<DieFace value={m.dice[0]} colour="red" size={36} />{/if}</span>
        <span class="dcell">{#if m.dice[1]}<DieFace value={m.dice[1]} colour="blue" size={36} />{/if}</span>
        <span class="dmg">{m.damage}</span>
      </div>
    {/each}
  {/if}
</div>

<style>
  .mtable {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 40px 40px max-content;
    column-gap: 10px;
  }
  /* 44px: a row's padding and border come out of its edge tracks, leaving 32px for the tick box. */
  .mtable.selectable {
    grid-template-columns: 44px minmax(0, 1fr) 40px 40px max-content;
  }
  .section {
    grid-column: 1 / -1;
    margin: 12px 0 6px;
    font-size: 14px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
  }
  /*
   * .mtable twice: Svelte scopes the inner class with :where(), so a host panel's own
   * `.panel :global(.row)` flex rule would otherwise tie with this one and win on order.
   */
  .mtable.mtable .head,
  .mtable.mtable .row {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: center;
    gap: normal;
  }
  /* The same for padding: a host's `button` rule would otherwise squeeze the tick-box column. */
  .mtable.mtable .row {
    padding: 4px 10px;
  }
  .mtable.mtable button.row.on {
    padding: 2px 8px;
  }
  .head {
    font-size: 15px;
    font-weight: 600;
    color: var(--muted);
    padding: 0 10px 4px;
  }
  .row {
    min-height: 52px;
    margin-bottom: 6px;
    padding: 4px 10px;
    box-sizing: border-box;
    border: 2px solid var(--ink);
    border-radius: 6px;
    background: var(--paper);
    color: var(--ink);
    font: inherit;
    font-size: 18px;
    text-align: left;
    cursor: default;
  }
  button.row {
    cursor: pointer;
    touch-action: manipulation;
    min-width: 0;
  }
  button.row.on {
    background: #f1e3b8;
    border-width: 4px;
    padding: 2px 8px;
  }
  button.row.dim {
    opacity: 0.5;
  }
  .name {
    min-width: 0;
    overflow-wrap: anywhere;
    font-weight: 600;
  }
  .head .name {
    font-weight: 600;
  }
  .dcell {
    display: flex;
    justify-content: center;
    align-items: center;
  }
  .dmg {
    min-width: 70px;
    white-space: nowrap;
  }
  .pick {
    display: flex;
    justify-content: center;
  }
  .box {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    box-sizing: border-box;
    border: 2px solid var(--ink);
    border-radius: 5px;
    background: #fff;
    font-weight: 700;
    font-size: 20px;
    line-height: 1;
  }
</style>
