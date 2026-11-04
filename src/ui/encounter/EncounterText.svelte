<script lang="ts">
  // A room's encounter text (or a creature-table text result) with its actions as buttons:
  // "Roll on CODE ±n" for a creature-table code, "Fight Name" for a creature named in capitals,
  // "Open CODE ±n" for a reference-table code.
  import { scanEncounter } from '../../systems/dungeon/encounterText';
  import type { DungeonTables } from '../../systems/dungeon/tables';
  import { rollName } from './encounterActions';

  interface Props {
    text: string;
    tables: DungeonTables | null;
    onroll?: (code: string, modifier: number) => void;
    onfight?: (name: string) => void;
    onopentable?: (code: string, modifier: number) => void;
  }
  let { text, tables, onroll, onfight, onopentable }: Props = $props();

  const parts = $derived(scanEncounter(text, tables));
  // Only the actions this place wires get a button (a treasure line wires just the tables).
  const actions = $derived(
    parts.filter((p) => (p.kind === 'roll' && onroll) || (p.kind === 'fight' && onfight) || (p.kind === 'table' && onopentable)),
  );
</script>

<span class="enc-text">{#each parts as p, i (i)}{#if p.kind === 'text'}{p.text}{:else}<span class="ref">{p.text}</span>{/if}{/each}</span>
{#if actions.length}
  <span class="enc-actions" data-testid="encounter-actions">
    {#each actions as a, i (i)}
      {#if a.kind === 'roll'}
        <button type="button" onclick={() => onroll?.(a.code, a.modifier)}>🎲 Roll on {rollName(a.code, a.modifier)}</button>
      {:else if a.kind === 'fight'}
        <button type="button" onclick={() => onfight?.(a.name)}>⚔ Fight {a.name}</button>
      {:else if a.kind === 'table'}
        <button type="button" aria-label={`Open table ${rollName(a.code, a.modifier)}`} onclick={() => onopentable?.(a.code, a.modifier)}>📖 Open {rollName(a.code, a.modifier)}</button>
      {/if}
    {/each}
  </span>
{/if}

<style>
  .ref {
    font-weight: 700;
  }
  .enc-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 8px;
  }
  button {
    min-height: 48px;
    min-width: 48px;
    padding: 0 14px;
    font: inherit;
    font-size: 17px;
    font-weight: 600;
    color: var(--ink);
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 6px;
    cursor: pointer;
    touch-action: manipulation;
  }
  button:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
</style>
