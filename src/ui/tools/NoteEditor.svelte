<script lang="ts">
  // The Note tool's panel: write a new note for a tapped floor square, or edit or remove a
  // tapped note. Nothing reaches the map until Add / Save. Keyed by the selection in
  // StepPanel, so a draft never carries over to another square.
  import { addFeature, type Command, removeFeature, updateFeature } from '../../core/commands';
  import { randomId } from '../../core/ids';
  import type { DungeonMap, Feature } from '../../core/types';
  import type { Selection } from '../tapRouting';

  interface Props {
    map: DungeonMap;
    selection: Extract<Selection, { kind: 'feature' } | { kind: 'newNote' }>;
    onexec: (cmd: Command | null) => boolean;
    onselect: (s: Selection | null) => void;
  }

  let { map, selection, onexec, onselect }: Props = $props();

  type Note = Extract<Feature, { kind: 'note' }>;
  const note = $derived(
    selection.kind === 'feature' ? map.features.find((f): f is Note => f.id === selection.featureId && f.kind === 'note') : undefined,
  );

  let text = $state('');
  // Seed from the note, and follow it through Save, Undo and Redo.
  $effect(() => {
    text = note?.text ?? '';
  });
  const blank = $derived(text.trim() === '');

  function add() {
    if (selection.kind !== 'newNote' || blank) return;
    const f: Note = { id: randomId(), kind: 'note', x: selection.cell.x, y: selection.cell.y, text: text.trim() };
    if (onexec(addFeature(f))) onselect({ kind: 'feature', featureId: f.id });
  }

  function save(n: Note) {
    if (blank || text.trim() === n.text) return;
    onexec(updateFeature(n, { ...n, text: text.trim() }));
  }

  function remove(n: Note) {
    if (onexec(removeFeature(n))) onselect(null);
  }
</script>

{#if selection.kind === 'newNote' || note}
  <form class="editor" data-editor="note" onsubmit={(e) => { e.preventDefault(); if (note) save(note); else add(); }}>
    <label class="field">
      <span class="label">{note ? 'Note' : 'New note'}</span>
      <textarea rows="4" bind:value={text} placeholder="What's here?"></textarea>
    </label>
    <div class="row">
      {#if note}
        <button type="submit" class="primary" disabled={blank || text.trim() === note.text}>Save</button>
        <button type="button" class="danger" onclick={() => remove(note)}>Remove note</button>
      {:else}
        <button type="button" onclick={() => onselect(null)}>Cancel</button>
        <button type="submit" class="primary" disabled={blank}>Add note</button>
      {/if}
    </div>
  </form>
{/if}

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--rule);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .label {
    font-size: 17px;
    font-weight: 600;
  }
  textarea {
    min-height: 48px;
    box-sizing: border-box;
    padding: 8px 12px;
    font: inherit;
    font-size: 18px;
    color: var(--ink);
    background: #fff;
    border: 2px solid var(--ink);
    border-radius: 6px;
  }
  .danger {
    color: var(--danger) !important;
    border-color: var(--danger) !important;
  }
</style>
