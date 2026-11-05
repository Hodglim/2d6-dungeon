<script lang="ts">
  import type { DungeonTables } from '../../systems/dungeon/tables';
  import EncounterText from './EncounterText.svelte';
  import { totalXp, treasureLines, type Encounter } from '../../systems/dungeon/combat';

  interface Props {
    encounter: Encounter;
    tables?: DungeonTables | null;
    /** Treasure lines name reference tables as buttons. */
    onopentable?: (code: string, modifier: number) => void;
    /** Add XP is offered only with a hero. */
    hasHero: boolean;
    onaddxp: () => void;
    ondone: () => void;
  }
  let { encounter, tables = null, onopentable, hasHero, onaddxp, ondone }: Props = $props();

  const lines = $derived(treasureLines(encounter));
  const xp = $derived(totalXp(encounter));
  /** XP not yet added to the hero (kept in the encounter, so Undo and reloads agree with the sheet). */
  const toAdd = $derived(Math.max(0, xp - encounter.xpAwarded));
  /** Done was tapped with XP still to add: ask before closing the fight without it. */
  let confirming = $state(false);
  const unadded = $derived(hasHero && toAdd > 0);
  $effect(() => {
    if (!unadded) confirming = false;
  });

  function done() {
    if (unadded && !confirming) {
      confirming = true;
      return;
    }
    ondone();
  }
  function addAndDone() {
    onaddxp();
    ondone();
  }
</script>

<section class="victory" aria-labelledby="victory-title">
  <h3 id="victory-title">Victory</h3>
  {#if lines.length}
    <ul class="treasure" aria-label="Treasure">
      {#each lines as line, i (i)}<li data-testid="treasure-line"><EncounterText text={line} {tables} {onopentable} /></li>{/each}
    </ul>
  {:else}
    <p class="none">No treasure to roll for</p>
  {/if}
  <p class="xp" data-testid="victory-xp">XP total: {xp}</p>
  <div class="row">
    {#if hasHero && xp > 0}
      <button type="button" disabled={toAdd === 0} onclick={onaddxp}>{toAdd === 0 ? `${xp} XP added` : `Add ${toAdd} XP`}</button>
    {/if}
    <button type="button" class="primary" onclick={done}>Done</button>
  </div>
  {#if confirming}
    <div class="confirm" role="alert">
      <p>You haven't added the {toAdd} XP to your hero yet.</p>
      <div class="row">
        <button type="button" class="primary" onclick={addAndDone}>Add {toAdd} XP and finish</button>
        <button type="button" onclick={ondone}>Finish without XP</button>
        <button type="button" onclick={() => (confirming = false)}>Back</button>
      </div>
    </div>
  {/if}
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
  .confirm {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 10px;
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 6px;
  }
  .confirm p {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
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
