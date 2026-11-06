<script lang="ts">
  // The Door tool's panel: edit a tapped door, or add one on a tapped bare wall. The Door tool
  // is the manual exception tool: no exit rules, only checkDoorTool's refusals.
  import { type Command, removeDoor, updateDoor } from '../../core/commands';
  import { addDoorWithTool, checkDoorTool } from '../../core/doortool';
  import { randomId } from '../../core/ids';
  import { withPadlock } from '../../core/doorLock';
  import type { Door, DungeonMap } from '../../core/types';
  import { dungeonSystem } from '../../systems/dungeon';
  import { choiceOf, doorChoices, doorFromChoice } from '../doorChoice';
  import { doorSymbol, SYMBOL_SIZE } from '../doorSymbol';
  import { entryNote, type Selection } from '../tapRouting';

  interface Props {
    map: DungeonMap;
    selection: Extract<Selection, { kind: 'door' } | { kind: 'wall' }>;
    /** Runs the command through History; false (with the reason shown) when it is rejected. */
    onexec: (cmd: Command | null) => boolean;
    onselect: (s: Selection | null) => void;
  }

  let { map, selection, onexec, onselect }: Props = $props();

  const door = $derived(selection.kind === 'door' ? map.doors.find((d) => d.id === selection.doorId) : undefined);
  const entry = $derived(door ? entryNote(map, door.id) : null);
  const check = $derived(selection.kind === 'wall' ? checkDoorTool(map, selection.edge) : null);

  // ---- editing a door ----

  type Padlock = 'none' | 'locked' | 'opened';
  const padlock = $derived<Padlock>(!door?.lock ? 'none' : door.lock.locked ? 'locked' : 'opened');

  function edit(d: Door, change: Partial<Door>) {
    onexec(updateDoor(d, { ...d, ...change }));
  }

  function setPadlock(d: Door, p: Padlock) {
    if (p === padlock) return;
    onexec(updateDoor(d, withPadlock(d, p)));
  }

  let qualityText = $state('');
  let qualityError = $state<string | null>(null);
  // Follow the door (another door tapped, Undo, Redo): show its quality, drop a stale error.
  $effect(() => {
    qualityText = door?.lock?.quality == null ? '' : String(door.lock.quality);
    qualityError = null;
  });

  function setQuality(d: Door) {
    if (!d.lock) return;
    const t = qualityText.trim();
    const q = t === '' ? null : Number(t);
    if (q !== null && !(Number.isInteger(q) && q >= 1 && q <= 12)) {
      qualityError = 'Quality is a whole number from 1 to 12, or blank';
      return;
    }
    qualityError = null;
    if (q === d.lock.quality) return;
    edit(d, { lock: { ...d.lock, quality: q } });
  }

  function remove(d: Door) {
    if (onexec(removeDoor(d))) onselect(null);
  }

  // ---- adding a door on a bare wall ----

  let newChoice = $state('wooden');

  function add() {
    if (selection.kind !== 'wall') return;
    const { type, secret } = doorFromChoice(newChoice);
    // On success the wall selection resolves to the new door (resolveSelection).
    onexec(addDoorWithTool(map, selection.edge, type, secret, randomId));
  }

  const choices = doorChoices(dungeonSystem.doorTypes);
  const choiceName = (id: string) => choices.find((t) => t.id === id)?.name ?? id;
</script>

{#snippet types(current: string, choose: (id: string) => void)}
  <div class="types" role="group" aria-label="Door type">
    {#each choices as t (t.id)}
      <button class="type" aria-pressed={current === t.id} onclick={() => choose(t.id)}>
        <canvas use:doorSymbol={t.id} style="width: {SYMBOL_SIZE}px; height: {SYMBOL_SIZE}px" aria-hidden="true"></canvas>
        <span>{t.name}</span>
      </button>
    {/each}
  </div>
{/snippet}

<div class="editor" data-editor="door">
  {#if door}
    <h3>{choiceName(choiceOf(door))}</h3>
    {@render types(choiceOf(door), (id) => id !== choiceOf(door) && edit(door, doorFromChoice(id)))}
    <div class="field">
      <span class="label" id="padlock-label">Padlock</span>
      <div class="row" role="group" aria-labelledby="padlock-label">
        <button aria-pressed={padlock === 'none'} onclick={() => setPadlock(door, 'none')}>None</button>
        <button aria-pressed={padlock === 'locked'} onclick={() => setPadlock(door, 'locked')}>Locked</button>
        <button aria-pressed={padlock === 'opened'} onclick={() => setPadlock(door, 'opened')}>Opened</button>
      </div>
    </div>
    {#if door.lock?.damaged}<p class="warn" data-testid="lock-damaged">Lock damaged</p>{/if}
    {#if door.lock}
      <form class="quality" onsubmit={(e) => { e.preventDefault(); setQuality(door); }}>
        <label class="field">
          <span class="label">Quality (1–12, optional)</span>
          <input name="quality" type="text" inputmode="numeric" autocomplete="off" bind:value={qualityText} onchange={() => setQuality(door)} />
        </label>
        <button type="submit">Set</button>
      </form>
      {#if qualityError}<p class="error" role="alert">{qualityError}</p>{/if}
    {/if}
    {#if entry}
      <p class="warn">{entry}, so it can't be removed</p>
    {:else}
      <div class="row">
        <button class="danger" onclick={() => remove(door)}>Remove door</button>
      </div>
    {/if}
  {:else if check}
    {#if check.ok}
      <h3>Add door here</h3>
      <p>{check.facesOpenSpace ? 'It faces open space, so it becomes an open exit with an exit square.' : 'It connects the two areas.'}</p>
      {@render types(newChoice, (id) => (newChoice = id))}
      <div class="row">
        <button class="primary" onclick={add}>Add door</button>
      </div>
    {:else}
      <p class="error" role="alert">{check.reason}</p>
    {/if}
  {/if}
</div>

<style>
  .editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--rule);
  }
  h3 {
    margin: 0;
    font-size: 20px;
  }
  .types {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 8px;
  }
  .type {
    display: flex;
    align-items: center;
    gap: 8px;
    text-align: left;
    padding: 2px 10px 2px 4px !important;
  }
  canvas {
    flex: none;
    background: #f7f2e7;
    border-radius: 4px;
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
  .quality {
    display: flex;
    align-items: flex-end;
    gap: 10px;
  }
  .quality input {
    width: 96px;
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
