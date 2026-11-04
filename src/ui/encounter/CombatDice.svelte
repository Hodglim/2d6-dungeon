<script lang="ts">
  import DiceEntry from '../DiceEntry.svelte';
  import DieFace from '../DieFace.svelte';

  /**
   * A plain roller for damage and anything else: two dice by default, or one. The attack dice,
   * with their doubles and shifting, are TurnDice.
   */
  let { title = 'Dice' }: { title?: string } = $props();
  let one = $state(false);
  let result = $state<number[] | null>(null);
  let error = $state<string | null>(null);
  /** Bumped after every roll so the entry starts fresh (it stays settled after a roll). */
  let round = $state(0);

  const d6 = () => Math.floor(Math.random() * 6) + 1;

  function show(values: number[]) {
    result = values;
    error = null;
    round++;
  }

  function enter(raw: string[]) {
    const vals = raw.map((v) => v.trim());
    if (!vals.every((v) => /^[1-6]$/.test(v))) {
      error = one ? 'Type a number from 1 to 6.' : 'Type a number from 1 to 6 in each die.';
      return;
    }
    show(vals.map(Number));
  }

  function toggle() {
    one = !one;
    result = null;
    error = null;
    round++;
  }

  const total = $derived(result ? result.reduce((s, v) => s + v, 0) : 0);
</script>

<section class="combat-dice" aria-label={title}>
  <div class="head">
    <h3>{title}</h3>
    <button aria-pressed={one} onclick={toggle}>One die</button>
  </div>
  {#key round}
    <DiceEntry
      dice={one ? 'd6' : '2d6'}
      label="D6"
      {error}
      enterLabel="Use these"
      rollLabel="🎲 Roll"
      onenter={enter}
      onroll={() => (one ? [d6()] : [d6(), d6()])}
      onrolled={show}
    />
  {/key}
  {#if result}
    <div class="result" role="status" data-testid="dice-result">
      <span class="faces">
        <DieFace value={result[0]!} colour="red" size={40} />
        {#if result.length > 1}<DieFace value={result[1]!} colour="blue" size={40} />{/if}
      </span>
      <span class="total">{result.length > 1 ? `${result[0]} + ${result[1]} = ${total}` : String(total)}</span>
    </div>
  {/if}
</section>

<style>
  .combat-dice {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  h3 {
    flex: 1;
    margin: 0;
    font-size: 19px;
  }
  .head button {
    min-height: 48px;
    min-width: 48px;
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
  .head button[aria-pressed='true'] {
    color: var(--paper);
    background: var(--ink);
  }
  .result {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .faces {
    display: inline-flex;
    gap: 6px;
  }
  .total {
    font-size: 24px;
    font-weight: 700;
  }
  :focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
</style>
