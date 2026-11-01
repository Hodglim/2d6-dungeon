<script lang="ts">
  import type { ExecResult } from '../../core/history';
  import type { PlayFlow, Step } from '../../interaction/playflow';

  interface Props {
    flow: PlayFlow;
    step: Extract<Step, { kind: 'label' }>;
    oncommit: (run: () => ExecResult | null) => void;
  }

  let { flow, step, oncommit }: Props = $props();

  // Seeded once from the draft (e.g. "Entrance Room"); the step object is stable while labelling.
  // svelte-ignore state_referenced_locally
  let type = $state(step.draft.room.label.type);
  // svelte-ignore state_referenced_locally
  let unique = $state(step.draft.room.label.unique);
  // svelte-ignore state_referenced_locally
  let narrative = $state(step.draft.room.label.narrative);

  const title = $derived(step.draft.source.kind === 'entrance' ? 'Entrance room' : `Room ${step.draft.room.number}`);
</script>

<h2>{title}</h2>
{#if step.dropped > 0}
  <p class="warn">{step.dropped} {step.dropped === 1 ? "exit couldn't" : "exits couldn't"} be placed</p>
{/if}
<form class="label" onsubmit={(e) => { e.preventDefault(); oncommit(() => flow.finish({ type: type.trim(), unique, narrative: narrative.trim() })); }}>
  <label class="field">Room type <input type="text" bind:value={type} placeholder="e.g. Lamp Room" /></label>
  <label class="check"><input type="checkbox" bind:checked={unique} /> Unique</label>
  <label class="field">Narrative <textarea rows="3" bind:value={narrative}></textarea></label>
  <div class="row">
    <button type="button" onclick={() => oncommit(() => flow.finish(null))}>Skip</button>
    <button type="submit" class="primary">Done</button>
  </div>
</form>

<style>
  .label {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 17px;
    font-weight: 600;
  }
  .field input,
  textarea {
    min-height: 48px;
    box-sizing: border-box;
    padding: 8px 12px;
    font: inherit;
    font-size: 18px;
    font-weight: 400;
    color: var(--ink);
    background: #fff;
    border: 2px solid var(--ink);
    border-radius: 6px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 48px;
    font-size: 18px;
  }
  .check input {
    width: 28px;
    height: 28px;
    margin: 0;
    accent-color: var(--ink);
  }
</style>
