<script lang="ts">
  import type { ExecResult } from '../../core/history';
  import type { PlayFlow, Step } from '../../interaction/playflow';
  import { dungeonSystem } from '../../systems/dungeon';
  import RollCard from '../RollCard.svelte';
  import type { DiceJob } from '../diceDesk';
  import DieFace from '../DieFace.svelte';
  import EncounterText from '../encounter/EncounterText.svelte';
  import { placingFirst, type EncounterHooks } from '../encounter/encounterActions';
  import type { DungeonTables } from '../../systems/dungeon/tables';

  interface Props {
    flow: PlayFlow;
    step: Extract<Step, { kind: 'label' }>;
    oncommit: (run: () => ExecResult | null) => void;
    tables?: DungeonTables | null;
    encounter?: EncounterHooks | null;
    /** Roll or Fight placed the room: it stays selected, so its text has a Room tab beside the fight. */
    onplaced?: (roomId: string) => void;
  }

  let { flow, step, oncommit, tables = null, encounter = null, onplaced }: Props = $props();

  // Seeded once from the draft (e.g. "Entrance Room"); the step object is stable while labelling.
  // svelte-ignore state_referenced_locally
  let type = $state(step.draft.room.label.type);
  // svelte-ignore state_referenced_locally
  let unique = $state(step.draft.room.label.unique);
  // svelte-ignore state_referenced_locally
  let narrative = $state(step.draft.room.label.narrative);

  const doorName = (id: string) => dungeonSystem.doorTypes.find((t) => t.id === id)?.name ?? id;
  /** Taken unique rooms the app re-rolled past on the last animated roll. */
  let rerolled = $state(0);
  const manual = $derived(step.roll === null || step.skipped);
  const kindName = $derived(step.roll?.kind === 'small' ? 'Small room' : step.roll?.kind === 'large' ? 'Large room' : 'Room');
  const twoD6 = $derived(step.roll !== null && step.roll.kind !== 'rooms');
  const chooseDoor = $derived((step.skipped || (step.roll === null && step.draft.doorsFromTable === true)) && step.chosen.length > 0 && step.draft.sizeClass !== 'small');

  const roomJob: DiceJob = $derived({
    id: 'room-table',
    kind: 'request',
    label: 'Room table',
    dice: twoD6 ? '2d6' : 'd66',
    modifier: null,
    roll: () => {
      const r = flow.rollRoomTable();
      rerolled = r?.rerolls ?? 0;
      return r ? r.dice : [];
    },
    rolled: (v) => flow.applyRoomTableResult(v),
    enter: (v) => {
      rerolled = 0;
      flow.enterRoomTable(v);
    },
    error: step.error,
  });
  const exitJob: DiceJob = $derived({
    id: 'exit-table',
    kind: 'request',
    label: 'Exit type',
    dice: 'd66',
    modifier: null,
    roll: () => flow.rollExitTable(),
    rolled: (v) => flow.applyExitTableResult(v),
    enter: (v) => {
      flow.enterExitTable(v);
    },
    error: step.error,
  });

  /**
   * Roll and Fight place the room first (as Done does): the fight is saved, the unplaced room is not.
   * A random exit type is rolled first: the encounter text shows once it is known, when Done can run.
   */
  const roomEncounter = $derived(
    encounter &&
      placingFirst(encounter, () => {
        const roomId = step.draft.room.id;
        oncommit(() => flow.finish(null));
        if (flow.step.kind !== 'idle') return false;
        onplaced?.(roomId);
        return true;
      }),
  );

  const title = $derived(step.draft.source.kind === 'entrance' ? 'Entrance room' : `Room ${step.draft.room.number}`);
</script>

<h2>{title}</h2>
{#if step.dropped > 0}
  <p class="warn">{step.dropped} {step.dropped === 1 ? "exit couldn't" : "exits couldn't"} be placed</p>
{/if}
{#if manual}
  {#if chooseDoor}
    <div class="doors" role="group" aria-label="Exit type">
      <span class="lead">Exit type</span>
      {#each dungeonSystem.doorTypes as t (t.id)}
        <button type="button" aria-pressed={step.exitType === t.id} onclick={() => flow.chooseLabelExitType(t.id)}>{t.name}</button>
      {/each}
    </div>
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
{:else if step.roll && !step.roll.available}
  <p data-testid="no-level-tables">{step.error ?? `Your table file has no Level ${step.roll.level} room tables.`}</p>
  <div class="row"><button type="button" onclick={() => flow.skipRoomTable()}>Skip</button></div>
{:else if step.roll && !step.result}
  <p>{kindName} roll — {twoD6 ? 'roll two dice, added together' : 'roll the red and blue dice'} in the dice roller — or type your own there.</p>
  <RollCard job={roomJob} />
  <div class="row"><button type="button" onclick={() => flow.skipRoomTable()}>Skip</button></div>
{:else if step.roll && step.result}
  {@const r = step.result}
  <div class="result" data-testid="room-result">
    <div class="dice" data-testid="roll-faces">
      {#each r.dice as face, i (i)}<DieFace value={face} colour={i === 0 ? 'red' : 'blue'} size={44} />{/each}
      {#if twoD6}<span class="sum">= {r.dice[0]! + r.dice[1]!}</span>{/if}
    </div>
    <p class="type">{r.entry.type}{#if r.entry.unique}<span class="badge">Unique</span>{/if}</p>
    <p>{r.entry.description}</p>
    {#if r.entry.encounter && !r.needsExit}<p data-testid="encounter-text"><strong>Encounter:</strong> {#if roomEncounter}<EncounterText text={r.entry.encounter} {tables} {...roomEncounter} />{:else}{r.entry.encounter}{/if}</p>{/if}
    {#if r.contents}
      <p data-testid="exit-result"><strong>Exits:</strong> {doorName(r.contents.door)}{r.contents.locked ? ', locked' : ''}</p>
    {/if}
    {#if r.capped}<p class="note">No unused rooms left on this table — accepted anyway</p>{/if}
    {#if rerolled > 0 && !r.capped}<p class="note">Re-rolled {rerolled} {rerolled === 1 ? 'time' : 'times'}: unique rooms already on this level.</p>{/if}
  </div>
  {#if r.needsExit}
    <p>This room's exit type is random. Roll the Exit Type table.</p>
    <RollCard job={exitJob} />
  {:else}
    <div class="row">
      <button type="button" onclick={() => { rerolled = 0; flow.discardRoomRoll(); }}>Roll again</button>
      <button type="button" class="primary" onclick={() => oncommit(() => flow.finish(null))}>Done</button>
    </div>
  {/if}
{/if}

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
  .doors {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .lead {
    flex-basis: 100%;
    font-size: 17px;
    font-weight: 600;
  }
  .result {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    background: var(--paper-dim);
    border-left: 4px solid var(--ink);
  }
  .dice {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .sum {
    font-size: 24px;
    font-weight: 700;
  }
  .type {
    font-size: 21px !important;
    font-weight: 700;
  }
  .note {
    font-size: 16px !important;
    color: var(--muted);
  }
</style>
