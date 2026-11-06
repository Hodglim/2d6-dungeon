<script lang="ts" module>
  let seq = 0;
</script>

<script lang="ts">
  // Reference-table text: codes of other reference tables are buttons that open them ("XX2 +1"),
  // also a code that is a creature table too. Creature-only codes and creature names stay plain text.
  // A dice phrase ("Roll a D6") is a button that opens the dice roller on that die and rolls once.
  // With `amounts`, dice to count ("2D6 +10 SC") are buttons too: they roll in the roller and show the total beside them.
  import { scanReference } from '../../systems/dungeon/encounterText';
  import { useDiceDesk } from '../diceDeskContext';
  import { diceLabel, rollDice, rollTotal, type DiceKind } from '../diceRoller';
  import type { DungeonTables } from '../../systems/dungeon/tables';
  import { rollName } from '../encounter/encounterActions';

  interface Props {
    text: string;
    tables: DungeonTables | null;
    onopen: (code: string, modifier: number) => void;
    /** Make dice amounts roll buttons; the text is what they're from ("XX1 9"). */
    amounts?: string;
  }
  let { text, tables, onopen, amounts }: Props = $props();

  const desk = useDiceDesk();
  const parts = $derived(scanReference(text, tables, { amounts: amounts !== undefined }));

  // Each amount's total, by its place in the text. Lives as long as this text is on screen.
  let totals = $state<Record<number, string>>({});
  const jobBase = `amount:${++seq}`;

  function rollAmount(i: number, what: string, dice: DiceKind, modifier: number) {
    if (!desk) return;
    const unit = /\s([A-Z]{2,3})$/.exec(what)?.[1];
    const count = rollDice(dice, () => 0).length;
    desk.ask({
      id: `${jobBase}:${i}`,
      kind: 'request',
      label: unit ? `${amounts} ${unit}` : (amounts ?? ''),
      dice,
      modifier,
      modifierEditable: false,
      oneShot: true,
      rolled: (faces) => void (totals[i] = rollTotal(dice, faces, modifier)),
      enter: (values) => {
        const faces = values.map((v) => (/^\s*[1-6]\s*$/.test(v) ? Number(v) : NaN));
        if (faces.length === count && !faces.some(Number.isNaN)) totals[i] = rollTotal(dice, faces, modifier);
      },
    });
  }
</script>

{#each parts as p, i (i)}{#if p.kind === 'table'}<button type="button" class="code" onclick={() => onopen(p.code, p.modifier)}>{rollName(p.code, p.modifier)}</button>{:else if p.kind === 'dice' && desk}<button type="button" class="code" onclick={() => desk.rollFree(p.dice)}>🎲 Roll {diceLabel(p.dice)}</button>{:else if p.kind === 'amount' && desk}<button type="button" class="code" onclick={() => rollAmount(i, p.text, p.dice, p.modifier)}>🎲 {p.text}</button>{#if totals[i] !== undefined}<span class="total" role="status">{` = ${totals[i]}`}</span>{/if}{:else}{p.text}{/if}{/each}

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
  .total {
    font-weight: 700;
  }
  .code:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
</style>
