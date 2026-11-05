<script lang="ts">
  // A creature-table roll waiting at the top of the encounter pane: "Roll on PRAC1 −1", a D6
  // rolled in the floating dice roller (or typed in there), and × to drop it unrolled.
  import type { PendingRoll } from '../../systems/dungeon/combat';
  import RollCard from '../RollCard.svelte';
  import type { DiceJob } from '../diceDesk';
  import { rollName } from './encounterActions';

  interface Props {
    roll: PendingRoll;
    /** Its place in the queue: two rolls on the same table get different roller requests. */
    index: number;
    /** Shown under the roll (an unknown table, say). */
    error?: string | null;
    /** The raw die, 1–6, once rolled or typed (the modifier is not yet added). */
    ondie: (die: number) => void;
    onremove: () => void;
  }
  let { roll, index, error = null, ondie, onremove }: Props = $props();

  // The stored modifier is applied when the entry resolves, so the roller cannot change it.
  const job: DiceJob = $derived({
    id: `pending:${index}:${roll.code}`,
    kind: 'request',
    label: `Roll on ${roll.code}`,
    dice: 'd6',
    modifier: roll.modifier || null,
    modifierEditable: false,
    rolled: (f) => ondie(f[0]!),
    enter: (values) => {
      const t = (values[0] ?? '').trim();
      if (!/^[1-6]$/.test(t)) return 'Type the die, 1 to 6.';
      ondie(Number(t));
    },
    error,
  });
</script>

<section class="pending" data-testid="pending-roll" aria-label="Roll on {rollName(roll.code, roll.modifier)}">
  <header>
    <h3>Roll on {rollName(roll.code, roll.modifier)}</h3>
    <button type="button" class="remove" aria-label="Remove roll on {rollName(roll.code, roll.modifier)}" onclick={onremove}>×</button>
  </header>
  <RollCard {job} />
</section>

<style>
  .pending {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 12px 12px;
    background: var(--paper-dim);
    border-left: 4px solid var(--accent);
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  h3 {
    flex: 1;
    margin: 0;
    font-size: 19px;
  }
  .remove {
    min-width: 48px;
    min-height: 48px;
    font: inherit;
    font-size: 24px;
    line-height: 1;
    color: var(--ink);
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 6px;
    cursor: pointer;
    touch-action: manipulation;
  }
  .remove:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
</style>
