<script lang="ts">
  // Reference-table text: codes of other reference tables are buttons that open them ("XX2 +1"),
  // also a code that is a creature table too. Creature-only codes and creature names stay plain text.
  // A dice phrase ("Roll a D6") is a button that opens the dice roller on that die and rolls once.
  import { scanReference } from '../../systems/dungeon/encounterText';
  import { useDiceDesk } from '../diceDeskContext';
  import { diceLabel } from '../diceRoller';
  import type { DungeonTables } from '../../systems/dungeon/tables';
  import { rollName } from '../encounter/encounterActions';

  interface Props {
    text: string;
    tables: DungeonTables | null;
    onopen: (code: string, modifier: number) => void;
  }
  let { text, tables, onopen }: Props = $props();

  const desk = useDiceDesk();
  const parts = $derived(scanReference(text, tables));
</script>

{#each parts as p, i (i)}{#if p.kind === 'table'}<button type="button" class="code" onclick={() => onopen(p.code, p.modifier)}>{rollName(p.code, p.modifier)}</button>{:else if p.kind === 'dice' && desk}<button type="button" class="code" onclick={() => desk.rollFree(p.dice)}>🎲 Roll {diceLabel(p.dice)}</button>{:else}{p.text}{/if}{/each}

<style>
  .code {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    min-width: 44px;
    margin: 2px 0;
    padding: 0 10px;
    font: inherit;
    font-weight: 700;
    color: var(--ink);
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 6px;
    cursor: pointer;
    touch-action: manipulation;
    vertical-align: middle;
    white-space: nowrap;
  }
  .code:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
</style>
