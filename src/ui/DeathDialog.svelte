<script lang="ts">
  // The hero is at 0 HP or below. In a fight the creature finishes them off: confirm the death.
  // Out of one they fall unconscious and roll on the recovery table here, in the floating roller
  // the dialog holds while the rest of the app is shut; then the adventure is over or the hero wakes.
  import { tick } from 'svelte';
  import type { RefRoll, RefTable } from '../systems/dungeon/referenceTables';
  import type { DungeonTables } from '../systems/dungeon/tables';
  import type { DiceDesk } from './diceDesk';
  import DicePanel from './DicePanel.svelte';
  import type { DeathCause } from './endings';
  import TableView from './tables/TableView.svelte';

  interface Props {
    heroName: string;
    cause: DeathCause;
    /** The file's recovery table, if it names one. */
    recovery: { code: string; table: RefTable } | null;
    tables: DungeonTables | null;
    desk: DiceDesk;
    modifier: number;
    result: RefRoll | null;
    onresult: (r: RefRoll) => void;
    onopen: (code: string, modifier: number) => void;
    onconfirm: () => void;
    oncancel: () => void;
  }
  let { heroName, cause, recovery, tables, desk, modifier, result, onresult, onopen, onconfirm, oncancel }: Props = $props();

  let cancel = $state<HTMLButtonElement>();
  $effect(() => cancel?.focus());

  const JOB = 'recovery-roll';
  // Aim the roller at the recovery roll and open it, once the table's roll card has put its job.
  $effect(() => {
    if (cause !== 'unconscious' || !recovery) return;
    void tick().then(() => desk.aimAt(JOB));
  });
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && oncancel()} />

<div class="scrim">
  {#if cause === 'slain'}
    <div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="death-title" aria-describedby="death-text">
      <h2 id="death-title">Your hero has fallen: confirm their death?</h2>
      <p id="death-text">{heroName} is at 0 HP or below in a fight, and the foe finishes them off. Confirming ends the game; it can't be undone. Cancel leaves everything as it is.</p>
      <div class="actions">
        <button type="button" bind:this={cancel} onclick={oncancel}>Cancel</button>
        <button type="button" class="primary" onclick={onconfirm}>Confirm death</button>
      </div>
    </div>
  {:else}
    <div class="dialog wide" role="alertdialog" aria-modal="true" aria-labelledby="death-title" aria-describedby="death-text">
      <h2 id="death-title">Your hero falls unconscious</h2>
      <p id="death-text">
        {heroName} is at 0 HP or below, and not by a foe's hand.
        {#if recovery}
          Roll on the recovery table and follow what it says.
        {:else}
          Roll on your recovery table and follow what it says. (Name it in your table file as <code>recoveryTable</code> to roll it here.)
        {/if}
      </p>
      {#if recovery}
        <div class="body">
        <div class="table">
          <TableView
            code={recovery.code}
            table={recovery.table}
            {tables}
            {modifier}
            {result}
            canBack={false}
            nav={false}
            jobId={JOB}
            {onresult}
            {onopen}
            onback={() => {}}
            onlist={() => {}}
          />
        </div>
        <div class="roller"><DicePanel {desk} /></div>
        </div>
      {/if}
      <p class="hint">If the hero wakes, put their HP and anything the table took right on the hero sheet.</p>
      <div class="actions">
        <button type="button" bind:this={cancel} onclick={oncancel}>Hero wakes</button>
        <button type="button" class="primary" onclick={onconfirm}>Adventure over</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 35;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(20, 16, 10, 0.55);
  }
  .dialog {
    width: min(480px, 100%);
    max-height: 100%;
    overflow: auto;
    box-sizing: border-box;
    padding: 20px 22px;
    background: var(--paper);
    color: var(--ink);
    border: 2px solid var(--danger);
    border-radius: 8px;
  }
  .dialog.wide {
    width: min(900px, 100%);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .wide > p,
  .wide > h2 {
    margin: 0;
  }
  h2 {
    margin: 0 0 10px;
    font-size: 24px;
  }
  p {
    margin: 0 0 16px;
    font-size: 19px;
    line-height: 1.4;
  }
  .hint {
    font-size: 17px;
    color: var(--muted);
  }
  .table {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  /* The table beside the floating roller, which sits here while the app behind is shut. */
  .body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 12px;
  }
  .roller {
    display: grid;
    justify-items: center;
  }
  @media (max-width: 699.98px) {
    .body {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 10px;
  }
  button {
    min-width: 96px;
    min-height: 48px;
    padding: 0 18px;
    font: inherit;
    font-size: 18px;
    color: var(--ink);
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 6px;
    cursor: pointer;
    touch-action: manipulation;
  }
  button.primary {
    color: var(--paper);
    background: var(--danger);
    border-color: var(--danger);
  }
</style>
