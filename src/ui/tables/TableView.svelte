<script lang="ts">
  // One reference table: header, intro, rows, notes, and (when it has dice) a roll with a modifier.
  // Rolling only shows a result: nothing here touches the game.
  import { naturalTotal, rollReference, type RefRoll, type RefTable } from '../../systems/dungeon/referenceTables';
  import { rollD6 } from '../../systems/dungeon/rules';
  import type { DungeonTables } from '../../systems/dungeon/tables';
  import DiceEntry from '../DiceEntry.svelte';
  import RefText from './RefText.svelte';
  import { isSlug } from './tablesState';

  interface Props {
    code: string;
    table: RefTable;
    tables: DungeonTables | null;
    modifier: number;
    result: RefRoll | null;
    canBack: boolean;
    onmodifier: (n: number) => void;
    onresult: (r: RefRoll) => void;
    onopen: (code: string, modifier: number) => void;
    onback: () => void;
    onlist: () => void;
  }
  let { code, table, tables, modifier, result, canBack, onmodifier, onresult, onopen, onback, onlist }: Props = $props();

  const minus = (n: number) => (n < 0 ? `−${Math.abs(n)}` : String(n));
  const rolls = $derived(table.dice !== null);
  const usesModifier = $derived(table.dice !== null && table.dice !== 'd66');
  /** Cells after the roll column (rollable tables), or every column (lists). */
  const cellHeads = $derived(rolls ? table.columns.slice(1) : table.columns);
  /** The result's row, unless the table changed under it. */
  const hit = $derived(result && result.row !== null ? (table.rows[result.row] ?? null) : null);

  let typedError = $state<string | null>(null);
  /** Remounts the dice after each roll (and for each table) so they start clean. */
  let rollSeq = $state(0);

  function apply(faces: number[]) {
    const r = rollReference(table, faces, modifier);
    if (!r) return;
    typedError = null;
    rollSeq++;
    onresult(r);
  }

  function rollFaces(): number[] {
    if (table.dice === 'd3') return [Math.floor(Math.random() * 3) + 1];
    if (table.dice === 'd6') return [rollD6(Math.random)];
    return [rollD6(Math.random), rollD6(Math.random)];
  }

  function enter(values: string[]) {
    const faces = values.map((v) => (/^\s*\d+\s*$/.test(v) ? Number(v) : NaN));
    if (!table.dice || naturalTotal(table.dice, faces) === null) {
      typedError = table.dice === 'd3' ? 'Type a number from 1 to 3.' : table.dice === 'd6' ? 'Type a number from 1 to 6.' : 'Type a number from 1 to 6 on each die.';
      return;
    }
    apply(faces);
  }

  // The modifier field: − and + buttons, or typing a whole number (a minus sign of either kind).
  // While the field has focus it keeps what was typed; it is reformatted only on blur.
  let draft = $state<string | null>(null);
  function typed(e: Event) {
    const raw = (e.currentTarget as HTMLInputElement).value;
    draft = raw;
    const v = raw.trim().replace(/[−–]/g, '-');
    if (/^[+-]?\d{1,3}$/.test(v)) onmodifier(Number(v));
  }

  const sum = $derived.by(() => {
    if (!result) return '';
    if (result.modifier === 0) return String(result.natural);
    return `${result.natural} ${result.modifier < 0 ? '−' : '+'} ${Math.abs(result.modifier)} = ${minus(result.total)}`;
  });

  // The matching row comes into view when a result lands.
  let rowEls = $state<HTMLTableRowElement[]>([]);
  $effect(() => {
    const i = result?.row;
    if (i === null || i === undefined) return;
    rowEls[i]?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  });
</script>

<div class="nav">
  {#if canBack}<button type="button" onclick={onback}>‹ Back</button>{/if}
  <button type="button" onclick={onlist}>☰ List</button>
</div>

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
    {#key `${code}:${rollSeq}`}
      <DiceEntry
        dice={table.dice}
        label={table.dice === 'd3' ? 'D3' : 'D6'}
        labels={table.dice === 'd66' ? ['Red · tens', 'Blue · units'] : undefined}
        error={typedError}
        enterLabel="Use this"
        onenter={enter}
        onroll={rollFaces}
        onrolled={apply}
      />
    {/key}
    {#if usesModifier}
      <div class="mod">
        <label for="ref-mod-{code}">Modifier</label>
        <button type="button" aria-label="Modifier down" onclick={() => { draft = null; onmodifier(modifier - 1); }}>−</button>
        <input id="ref-mod-{code}" type="text" inputmode="numeric" autocomplete="off" value={draft ?? minus(modifier)} oninput={typed} onblur={() => (draft = null)} />
        <button type="button" aria-label="Modifier up" onclick={() => { draft = null; onmodifier(modifier + 1); }}>+</button>
      </div>
    {/if}
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
  .mod {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .mod label {
    font-weight: 600;
    margin-right: 4px;
  }
  .mod input {
    width: 70px;
    text-align: center;
    font-weight: 700;
    padding: 0 6px;
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
  button,
  input {
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
  button:focus-visible,
  input:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
</style>
