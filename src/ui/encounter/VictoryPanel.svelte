<script lang="ts">
  import { totalXp, treasureLines, type Encounter } from '../../systems/dungeon/combat';

  interface Props {
    encounter: Encounter;
    /** Add XP is offered only with a hero. */
    hasHero: boolean;
    onaddxp: () => void;
    ondone: () => void;
  }
  let { encounter, hasHero, onaddxp, ondone }: Props = $props();

  const lines = $derived(treasureLines(encounter));
  const xp = $derived(totalXp(encounter));
  /** XP not yet added to the hero (kept in the encounter, so Undo and reloads agree with the sheet). */
  const toAdd = $derived(Math.max(0, xp - encounter.xpAwarded));
</script>

<section class="victory" aria-labelledby="victory-title">
  <h3 id="victory-title">Victory</h3>
  {#if lines.length}
    <ul class="treasure" aria-label="Treasure">
      {#each lines as line, i (i)}<li data-testid="treasure-line">{line}</li>{/each}
    </ul>
  {:else}
    <p class="none">No treasure to roll for</p>
  {/if}
  <p class="xp" data-testid="victory-xp">XP total: {xp}</p>
  <div class="row">
    {#if hasHero && xp > 0}
      <button type="button" disabled={toAdd === 0} onclick={onaddxp}>{toAdd === 0 ? `${xp} XP added` : `Add ${toAdd} XP`}</button>
    {/if}
    <button type="button" class="primary" onclick={ondone}>Done</button>
  </div>
</section>

<style>
  .victory {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    background: var(--paper-dim);
    border-left: 4px solid var(--accent);
  }
  h3 {
    margin: 0;
    font-size: 21px;
  }
  .treasure {
    margin: 0;
    padding-left: 20px;
    font-size: 18px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .none {
    margin: 0;
    color: var(--muted);
    font-size: 17px;
  }
  .xp {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  button {
    min-width: 48px;
    min-height: 48px;
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
