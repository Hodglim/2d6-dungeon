<script lang="ts">
  // Rolling on the room tables for a room that is already on the map (the inspector's
  // "Roll for this room"). The same dice entry and result as the label step, but the state
  // is local: nothing changes on the map until Apply.
  import type { DungeonMap, Room, RoomContents } from '../core/types';
  import { contentsFrom, levelTables, lookupRoom, ownExitDoors, resolveExit, rollRoom, uniqueTaken } from '../systems/dungeon/roomTables';
  import { dungeonSystem } from '../systems/dungeon';
  import { rollD6, type Rng } from '../systems/dungeon/rules';
  import type { DungeonTables } from '../systems/dungeon/tables';
  import RollCard from './RollCard.svelte';
  import type { DiceJob } from './diceDesk';
  import DieFace from './DieFace.svelte';
  import EncounterText from './encounter/EncounterText.svelte';
  import { placingFirst, type EncounterHooks } from './encounter/encounterActions';
  
  interface Props {
    map: DungeonMap;
    room: Room;
    tables: DungeonTables | null;
    rng?: Rng;
    /** Saves the result; true when it was saved. */
    onapply: (contents: RoomContents, unique: boolean) => boolean;
    oncancel: () => void;
    encounter?: EncounterHooks | null;
  }

  let { map, room, tables, rng = Math.random, onapply, oncancel, encounter = null }: Props = $props();

  const lv = $derived(levelTables(tables, map.level));
  const kind = $derived(room.sizeClass === 'small' ? 'small' : room.sizeClass === 'large' ? 'large' : 'rooms');
  const twoD6 = $derived(kind !== 'rooms');
  const noExits = $derived(kind === 'small' || ownExitDoors(map, room).ids.size === 0);
  /**
   * Roll and Fight apply the result first (as Apply does): the fight is saved at once, the result
   * only on Apply. A random exit type is rolled first: the encounter text shows once it is known.
   */
  const resultEncounter = $derived(
    encounter &&
      placingFirst(encounter, () => {
        const r = result;
        return r?.contents ? onapply($state.snapshot(r.contents), r.unique) : false;
      }),
  );
  const doorName = (id: string) => dungeonSystem.doorTypes.find((t) => t.id === id)?.name ?? id;

  interface Result {
    dice: number[];
    type: string;
    description: string;
    encounter: string;
    unique: boolean;
    capped: boolean;
    /** null until a random exit has been rolled. */
    contents: RoomContents | null;
  }
  let result = $state.raw<Result | null>(null);
  let error = $state<string | null>(null);
  let rerolled = $state(0);
  /** Dice of a roll that found nothing unused; accepted once. */
  let cappedDice: number[] | null = null;

  function accept(dice: number[]) {
    if (!lv || !tables) return;
    if (dice.length !== 2 || !dice.every((d) => Number.isInteger(d) && d >= 1 && d <= 6)) {
      error = 'Enter a whole number from 1 to 6';
      return;
    }
    const entry = lookupRoom(lv, kind, dice);
    const capped = cappedDice !== null && cappedDice.join() === dice.join();
    cappedDice = null;
    if (!capped && entry.unique && uniqueTaken(map, entry.type)) {
      error = 'Already on this level — roll again';
      return;
    }
    error = null;
    const spec = 'exit' in entry ? entry.exit : { door: 'archway' as const };
    const base = { dice, type: entry.type, description: entry.description, encounter: 'encounter' in entry ? entry.encounter : '', unique: entry.unique, capped };
    if (spec === 'random' && !noExits) {
      result = { ...base, contents: null };
      return;
    }
    const exit = noExits ? { door: 'archway', locked: false } : resolveExit(lv, tables, spec);
    result = { ...base, contents: contentsFrom(kind, dice, entry, exit) };
  }

  function acceptExit(dice: number[]) {
    if (!lv || !tables || !result) return;
    if (dice.length !== 2 || !dice.every((d) => Number.isInteger(d) && d >= 1 && d <= 6)) {
      error = 'Enter a whole number from 1 to 6';
      return;
    }
    try {
      const exit = resolveExit(lv, tables, 'random', dice);
      error = null;
      result = { ...result, contents: contentsFrom(kind, result.dice, lookupRoom(lv, kind, result.dice), exit) };
    } catch (e) {
      error = e instanceof Error ? e.message : 'That exit type is not on the table';
    }
  }

  const roomJob: DiceJob = $derived({
    id: `inspect-room:${room.id}`,
    kind: 'request',
    label: 'Room table',
    dice: twoD6 ? '2d6' : 'd66',
    modifier: null,
    roll: () => {
      const r = rollRoom(lv!, tables!, kind, map, rng);
      cappedDice = r.capped ? r.dice : null;
      rerolled = r.rerolls;
      return r.dice;
    },
    rolled: (v) => accept(v),
    enter: (v) => {
      rerolled = 0;
      cappedDice = null;
      accept(parse(v));
    },
    error,
  });
  const exitJob: DiceJob = $derived({
    id: `inspect-exit:${room.id}`,
    kind: 'request',
    label: 'Exit type',
    dice: 'd66',
    modifier: null,
    roll: () => [rollD6(rng), rollD6(rng)],
    rolled: (v) => acceptExit(v),
    enter: (v) => {
      acceptExit(parse(v));
    },
    error,
  });

  const parse = (values: string[]) => values.map((v) => (/^\s*[1-6]\s*$/.test(v) ? Number(v) : NaN));
</script>

<div class="roll" data-testid="room-roll">
  {#if !lv}
    <p data-testid="no-level-tables">Your table file has no Level {map.level} room tables.</p>
    <div class="row"><button type="button" onclick={oncancel}>Close</button></div>
  {:else if !result}
    <p>{kind === 'small' ? 'Small room' : kind === 'large' ? 'Large room' : 'Room'} roll — {twoD6 ? 'roll two dice, added together' : 'roll the red and blue dice'} in the dice roller — or type your own there.</p>
    <RollCard job={roomJob} />
    <div class="row"><button type="button" onclick={oncancel}>Cancel</button></div>
  {:else}
    {@const r = result}
    <div class="result" data-testid="room-result">
      <div class="dice">
        {#each r.dice as face, i (i)}<DieFace value={face} colour={i === 0 ? 'red' : 'blue'} size={44} />{/each}
        {#if twoD6}<span class="sum">= {r.dice[0]! + r.dice[1]!}</span>{/if}
      </div>
      <p class="type">{r.type}{#if r.unique}<span class="badge">Unique</span>{/if}</p>
      <p>{r.description}</p>
      {#if r.encounter && r.contents}<p data-testid="encounter-text"><strong>Encounter:</strong> {#if resultEncounter}<EncounterText text={r.encounter} {tables} {...resultEncounter} />{:else}{r.encounter}{/if}</p>{/if}
      {#if r.contents}<p data-testid="exit-result"><strong>Exits:</strong> {doorName(r.contents.door)}{r.contents.locked ? ', locked' : ''}</p>{/if}
      {#if r.capped}<p class="note">No unused rooms left on this table — accepted anyway</p>{/if}
      {#if rerolled > 0 && !r.capped}<p class="note">Re-rolled {rerolled} {rerolled === 1 ? 'time' : 'times'}: unique rooms already on this level.</p>{/if}
    </div>
    {#if !r.contents}
      <p>This room's exit type is random. Roll the Exit Type table.</p>
      <RollCard job={exitJob} />
      <div class="row">
        <button type="button" onclick={() => { result = null; error = null; rerolled = 0; }}>Roll again</button>
        <button type="button" onclick={oncancel}>Cancel</button>
      </div>
    {:else}
      <div class="row">
        <button type="button" onclick={() => { result = null; error = null; rerolled = 0; }}>Roll again</button>
        <button type="button" class="primary" onclick={() => onapply($state.snapshot(r.contents!), r.unique)}>Apply</button>
      </div>
    {/if}
  {/if}
</div>

<style>
  .roll {
    display: flex;
    flex-direction: column;
    gap: 10px;
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
