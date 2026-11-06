<script lang="ts">
  import type { DungeonTables } from '../../systems/dungeon/tables';
  import EncounterText from './EncounterText.svelte';
  import { totalXp, treasureLines, type Encounter } from '../../systems/dungeon/combat';

  interface Props {
    encounter: Encounter;
    tables?: DungeonTables | null;
    /** Treasure lines name reference tables as buttons. */
    onopentable?: (code: string, modifier: number) => void;
    /** Thrown weapons can be recovered only with a hero. */
    hasHero: boolean;
    ondone: () => void;
    /** Roll a D6 to get thrown weapon `i` (an index into encounter.throws) back. */
    onrecover?: (i: number) => void;
  }
  let { encounter, tables = null, onopentable, hasHero, ondone, onrecover }: Props = $props();
  /** Weapons thrown this fight, with their index in encounter.throws. */
  const thrown = $derived((encounter.throws ?? []).map((t, i) => ({ t, i })).filter(({ t }) => t.kind === 'weapon'));

  const lines = $derived(treasureLines(encounter));
  const xp = $derived(totalXp(encounter));
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
  {#if thrown.length && hasHero}
    <ul class="treasure" aria-label="Thrown weapons">
      {#each thrown as { t, i } (i)}
        <li data-testid="thrown-weapon">
          {#if t.deflected}{t.name}: lost (it was deflected)
          {:else if t.recovered === true}{t.name}: recovered, back in your pack
          {:else if t.recovered === false}{t.name}: lost
          {:else}<button type="button" onclick={() => onrecover?.(i)}>🎲 Recover {t.name} (4–6)</button>{/if}
        </li>
      {/each}
    </ul>
  {/if}
  <p class="xp" data-testid="victory-xp">XP total: {xp}{#if hasHero && xp > 0}<span class="small"> (added as each creature fell)</span>{/if}</p>
  <div class="row">
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
  .small {
    font-size: 15px;
    font-weight: 400;
  }
</style>
