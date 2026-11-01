<script lang="ts" module>
  export interface NewMapValues {
    width: number;
    height: number;
    level: string;
    title: string;
  }
</script>

<script lang="ts">
  import { MAX_MAP_SIZE } from '../core/campaign';

  interface Props {
    oncreate: (values: NewMapValues) => void;
    oncancel: () => void;
  }

  let { oncreate, oncancel }: Props = $props();

  const MIN = 20;
  const MAX = MAX_MAP_SIZE;

  let width = $state(25);
  let height = $state(25);
  let level = $state('');
  let title = $state('');

  function sizeError(name: string, v: unknown): string | null {
    return typeof v === 'number' && Number.isInteger(v) && v >= MIN && v <= MAX ? null : `${name} must be a whole number from ${MIN} to ${MAX}`;
  }
  const error = $derived(sizeError('Width', width) ?? sizeError('Height', height));

  function submit(e: SubmitEvent) {
    e.preventDefault();
    if (error) return;
    oncreate({ width, height, level: level.trim(), title: title.trim() });
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && oncancel()} />

<div class="scrim">
  <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="new-map-title">
    <form onsubmit={submit}>
      <h2 id="new-map-title">New map</h2>
      <div class="row">
        <label>Width <input type="number" min={MIN} max={MAX} step="1" inputmode="numeric" bind:value={width} /></label>
        <label>Height <input type="number" min={MIN} max={MAX} step="1" inputmode="numeric" bind:value={height} /></label>
      </div>
      <label>Level <input type="text" bind:value={level} placeholder="e.g. 1" /></label>
      <label>Title <input type="text" bind:value={title} placeholder="Optional" /></label>
      {#if error}<p class="error" role="alert">{error}</p>{/if}
      <div class="actions">
        <button type="button" onclick={oncancel}>Cancel</button>
        <button type="submit" class="primary" disabled={!!error}>Create</button>
      </div>
    </form>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(20, 16, 10, 0.45);
  }
  .dialog {
    width: min(460px, 100%);
    max-height: 100%;
    overflow: auto;
    padding: 20px 22px;
    background: var(--paper);
    color: var(--ink);
    border: 2px solid var(--ink);
    border-radius: 8px;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  h2 {
    margin: 0;
    font-size: 24px;
  }
  .row {
    display: flex;
    gap: 14px;
  }
  .row label {
    flex: 1;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 17px;
    font-weight: 600;
  }
  input {
    min-height: 48px;
    padding: 0 12px;
    font: inherit;
    font-size: 19px;
    font-weight: 400;
    color: var(--ink);
    background: #fff;
    border: 2px solid var(--ink);
    border-radius: 6px;
    min-width: 0;
  }
  .error {
    margin: 0;
    color: var(--danger);
    font-size: 17px;
  }
  .actions {
    display: flex;
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
  }
  button.primary {
    color: var(--paper);
    background: var(--ink);
  }
  button:disabled {
    opacity: 0.45;
    cursor: default;
  }
</style>
