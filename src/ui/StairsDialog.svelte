<script lang="ts">
  import { canEat, restOnStairs, type Hero } from '../systems/dungeon/hero';

  interface Props {
    /** The hero, or null in a map-only game. */
    hero: Hero | null;
    nextLevel: number;
    onconfirm: (opts: { eat: boolean; bandage: boolean }) => void;
    oncancel: () => void;
  }
  let { hero, nextLevel, onconfirm, oncancel }: Props = $props();

  let bandage = $state(false);
  const eatHp = $derived(hero ? restOnStairs(hero, { eat: true, bandage }).hp : 0);
  const skipHp = $derived(hero ? restOnStairs(hero, { eat: false, bandage: false }).hp : 0);
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && oncancel()} />

<div class="scrim">
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="stairs-title" data-testid="stairs-dialog">
    <h2 id="stairs-title">Go down to Level {nextLevel}</h2>
    {#if hero}
      <p>Rest on the stairs before you go. HP now {hero.hp} of {hero.hpBaseline}; rations {hero.rations}.</p>
      <label class="tick"><input type="checkbox" bind:checked={bandage} /> Cloth or bandage</label>
      <div class="choices">
        <button type="button" class="primary" disabled={!canEat(hero)} onclick={() => onconfirm({ eat: true, bandage })}>
          Eat a ration<small>HP {hero.hp} → {eatHp}, rations {hero.rations} → {Math.max(0, hero.rations - 1)}</small>
        </button>
        <button type="button" onclick={() => onconfirm({ eat: false, bandage: false })}>
          Don't eat<small>HP {hero.hp} → {skipHp}</small>
        </button>
      </div>
      {#if !canEat(hero)}<p class="muted">No rations left.</p>{/if}
      <p class="muted">Going down can't be undone. Your Level {nextLevel - 1} map is kept under Menu, Earlier levels.</p>
      <div class="actions"><button type="button" onclick={oncancel}>Cancel</button></div>
    {:else}
      <p>Start the next level's map. Your Level {nextLevel - 1} map is kept under Menu, Earlier levels.</p>
      <div class="actions">
        <button type="button" onclick={oncancel}>Cancel</button>
        <button type="button" class="primary" onclick={() => onconfirm({ eat: false, bandage: false })}>Go down</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .scrim { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; padding: 16px; background: rgba(20, 16, 10, 0.45); }
  .dialog { width: min(480px, 100%); max-height: 100%; overflow: auto; padding: 20px 22px; background: var(--paper); color: var(--ink); border: 2px solid var(--ink); border-radius: 8px; }
  h2 { margin: 0 0 10px; font-size: 24px; }
  p { margin: 0 0 14px; font-size: 19px; line-height: 1.4; }
  .muted { font-size: 16px; color: var(--muted); }
  .tick { display: flex; align-items: center; gap: 12px; min-height: 48px; font-size: 19px; }
  .tick input { width: 24px; height: 24px; margin: 0; accent-color: var(--ink); }
  .choices { display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
  .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10px; }
  button { min-width: 96px; min-height: 48px; padding: 6px 18px; font: inherit; font-size: 18px; color: var(--ink); background: var(--paper); border: 2px solid var(--ink); border-radius: 6px; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  button small { font-size: 15px; opacity: 0.85; }
  button.primary { color: var(--paper); background: var(--ink); }
  button:disabled { opacity: 0.45; cursor: default; }
  button:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
</style>
