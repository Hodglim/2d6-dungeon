<script lang="ts">
  // A creature-table roll waiting at the top of the encounter pane: "Roll on PRAC1 −1", a D6
  // (rolled with the animation, or typed in), and × to drop it unrolled.
  import type { PendingRoll } from '../../systems/dungeon/combat';
  import { rollD6 } from '../../systems/dungeon/rules';
  import DiceEntry from '../DiceEntry.svelte';
  import { rollName } from './encounterActions';

  interface Props {
    roll: PendingRoll;
    /** Shown under the die (an unknown table, say). */
    error?: string | null;
    /** The raw die, 1–6, once rolled or typed (the modifier is not yet added). */
    ondie: (die: number) => void;
    onremove: () => void;
  }
  let { roll, error = null, ondie, onremove }: Props = $props();

  let typedError = $state<string | null>(null);

  function enter(values: string[]) {
    const t = (values[0] ?? '').trim();
    if (!/^[1-6]$/.test(t)) {
      typedError = 'Type the die, 1 to 6.';
      return;
    }
    typedError = null;
    ondie(Number(t));
  }
</script>

<section class="pending" data-testid="pending-roll" aria-label="Roll on {rollName(roll.code, roll.modifier)}">
  <header>
    <h3>Roll on {rollName(roll.code, roll.modifier)}</h3>
    <button type="button" class="remove" aria-label="Remove roll on {rollName(roll.code, roll.modifier)}" onclick={onremove}>×</button>
  </header>
  <DiceEntry
    dice="d6"
    label="D6"
    error={typedError ?? error}
    enterLabel="Use this"
    onenter={enter}
    onroll={() => [rollD6(Math.random)]}
    onrolled={(v) => ondie(v[0]!)}
  />
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
