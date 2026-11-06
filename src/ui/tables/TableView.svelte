<script lang="ts">
  // One reference table: header, intro, rows, notes, and (when it has dice) a roll with a modifier.
  // Rolling only shows a result: nothing here touches the game.
  import { naturalTotal, rollReference, type RefRoll, type RefTable } from '../../systems/dungeon/referenceTables';
  import type { DungeonTables } from '../../systems/dungeon/tables';
  import type { DiceJob } from '../diceDesk';
  import RollCard from '../RollCard.svelte';
  import RefText from './RefText.svelte';
  import { isSlug } from './tablesState';

  interface Props {
    code: string;
    table: RefTable;
    tables: DungeonTables | null;
    modifier: number;
    result: RefRoll | null;
    canBack: boolean;
    onresult: (r: RefRoll) => void;
    onopen: (code: string, modifier: number) => void;
    onback: () => void;
    onlist: () => void;
    /** The Back and List buttons (off where the table is shown on its own, as in the unconscious dialog). */
    nav?: boolean;
    /** The roller job's id; a second view of the same table (the unconscious dialog) needs its own. */
    jobId?: string;
  }
  let { code, table, tables, modifier, result, canBack, onresult, onopen, onback, onlist, nav = true, jobId }: Props = $props();

  const minus = (n: number) => (n < 0 ? `−${Math.abs(n)}` : String(n));
  const rolls = $derived(table.dice !== null);
  /** Cells after the roll column (rollable tables), or every column (lists). */
  const cellHeads = $derived(rolls ? table.columns.slice(1) : table.columns);
  /** The result's row, unless the table changed under it. */
  const hit = $derived(result && result.row !== null ? (table.rows[result.row] ?? null) : null);

  let typedError = $state<string | null>(null);

  function apply(faces: number[], m: number) {
    const r = rollReference(table, faces, m);
    if (!r) return;
    typedError = null;
    onresult(r);
  }

  function enter(values: string[], m: number): string | null {
    const faces = values.map((v) => (/^\s*\d+\s*$/.test(v) ? Number(v) : NaN));
    if (!table.dice || naturalTotal(table.dice, faces) === null) {
      typedError = table.dice === 'd3' || table.dice === 'd6' ? 'Type a number from 1 to 6.' : 'Type a number from 1 to 6 on each die.';
      return typedError;
    }
    apply(faces, m);
    return null;
  }

  /** The roll the floating roller aims at while this table is in front; `modifier` is only its starting value. */
  const job = $derived<DiceJob | null>(
    table.dice
      ? {
          id: jobId ?? `table:${code}`,
          kind: 'watcher',
          label: isSlug(code) ? table.name : `${code} ${table.name}`,
          dice: table.dice,
          modifier: table.dice === 'd66' ? null : modifier,
          rolled: (faces, m) => apply(faces, m),
          enter: (values, m) => enter(values, m),
          error: typedError,
        }
      : null,
  );

  const sum = $derived.by(() => {
    if (!result) return '';
    // A D3 shows the D6 face and how it reads: "5 → 3".
    const natural = result.d3Face !== undefined ? `${result.d3Face} → ${result.natural}` : String(result.natural);
    if (result.modifier === 0) return natural;
    return `${natural} ${result.modifier < 0 ? '−' : '+'} ${Math.abs(result.modifier)} = ${minus(result.total)}`;
  });

  // The matching row comes into view when a result lands.
  let rowEls = $state<HTMLTableRowElement[]>([]);
  $effect(() => {
    const i = result?.row;
    if (i === null || i === undefined) return;
    rowEls[i]?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  });
</script>

{#if nav}
  <div class="nav">
    {#if canBack}<button type="button" onclick={onback}>‹ Back</button>{/if}
    <button type="button" onclick={onlist}>☰ List</button>
  </div>
{/if}

<header class="head">
  <h3>
    {#if !isSlug(code)}<span class="tcode">{code}</span>{' — '}{/if}{table.name}
  </h3>
  <span class="meta">p. {table.page}{` · ${table.dice ?? 'list'}`}</span>
</header>

{#if table.intro}<p class="intro"><RefText text={table.intro} {tables} {onopen} /></p>{/if}

<div class="scroll">
  <table>
    <thead>
      <tr>
        {#if rolls}<th scope="col" class="roll">{table.columns[0] ?? ''}</th>{/if}
        {#each cellHeads as h, i (i)}<th scope="col">{h}</th>{/each}
      </tr>
    </thead>
    <tbody>
      {#each table.rows as row, i (i)}
        <tr bind:this={rowEls[i]} class:hit={result !== null && result.row === i} aria-current={result !== null && result.row === i ? 'true' : undefined}>
          {#if rolls}<td class="roll">{row.roll ?? ''}</td>{/if}
          {#each row.cells as c, j (j)}<td><RefText text={c} {tables} {onopen} /></td>{/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

{#if table.notes}<p class="notes"><RefText text={table.notes} {tables} {onopen} /></p>{/if}

{#if table.dice}
  <section class="rolling" aria-label="Roll on {code}">
    {#if job}<RollCard {job} />{/if}
    {#if result}
      <div class="result" role="status" data-testid="ref-result">
        <p class="line"><span class="sum">{sum}</span>{#if result.clamped !== result.total}<span class="counts">{` · counts as ${minus(result.clamped)}`}</span>{/if}</p>
        {#if hit}
          <div class="cells">
            {#each hit.cells as c, j (j)}
              <p>{#if cellHeads.length > 1 && cellHeads[j]}<span class="label">{cellHeads[j]}:</span>{' '}{/if}<RefText text={c} {tables} {onopen} /></p>
            {/each}
          </div>
        {:else}
          <p class="none">No row for {minus(result.clamped)}</p>
        {/if}
      </div>
    {/if}
  </section>
{/if}

<style>
  .nav {
    display: flex;
    gap: 8px;
  }
  .head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
  }
  h3 {
    margin: 0;
    font-size: 21px;
  }
  .tcode {
    font-variant-numeric: tabular-nums;
  }
  .meta {
    color: var(--muted);
    font-size: 16px;
  }
  .intro,
  .notes {
    margin: 0;
    font-size: 17px;
    line-height: 1.45;
  }
  .notes {
    color: var(--ink);
    padding-left: 10px;
    border-left: 3px solid var(--rule);
  }
  .scroll {
    flex: none; /* in the pane's scrolling column: never squashed to fit */
    overflow-x: auto;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 17px;
    line-height: 1.35;
  }
  th,
  td {
    padding: 6px 8px;
    text-align: left;
    vertical-align: top;
    border-bottom: 1px solid var(--rule);
  }
  th {
    font-size: 15px;
    border-bottom: 2px solid var(--ink);
  }
  .roll {
    width: 1%;
    white-space: nowrap;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  tr.hit td {
    background: #f3d98b;
  }
  tr.hit td:first-child {
    box-shadow: inset 4px 0 0 var(--ink);
  }
  .rolling {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    background: var(--paper-dim);
    border-radius: 8px;
  }
  .result {
    padding: 8px 12px;
    background: var(--paper);
    border-left: 4px solid var(--ink);
  }
  .result p {
    margin: 0;
  }
  .line {
    font-size: 20px;
  }
  .sum {
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }
  .counts {
    color: var(--ink);
  }
  .cells {
    margin-top: 6px;
    font-size: 18px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .label {
    font-weight: 600;
  }
  .none {
    margin-top: 6px !important;
    font-size: 18px;
    font-weight: 600;
    color: var(--danger);
  }
  button {
    min-height: 48px;
    font: inherit;
    font-size: 17px;
    color: var(--ink);
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 6px;
    touch-action: manipulation;
  }
  button {
    min-width: 48px;
    padding: 0 14px;
    cursor: pointer;
  }
  button:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
</style>
