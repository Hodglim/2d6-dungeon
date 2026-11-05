<script lang="ts">
  // A room tapped in Play: its details. Its label (type, unique, narrative) is
  // editable; size, class and exit count are read-only. Rooms are never moved, resized or
  // deleted, so there are no controls for that (mistakes are fixed with Undo).
  import { type Command, updateRoom } from '../../core/commands';
  import type { DungeonMap, Room, RoomContents } from '../../core/types';
  import { applyRoomRoll } from '../../systems/dungeon/roomTables';
  import type { DungeonTables } from '../../systems/dungeon/tables';
  import RoomRoll from '../RoomRoll.svelte';
  import EncounterText from '../encounter/EncounterText.svelte';
  import type { EncounterHooks } from '../encounter/encounterActions';
  import { roomExitCount } from '../tapRouting';

  interface Props {
    map: DungeonMap;
    roomId: string;
    onexec: (cmd: Command | null) => boolean;
    /** The loaded table file, if any: "Roll for this room" needs it. */
    tables?: DungeonTables | null;
    /** Roll and Fight buttons in the room's encounter text. */
    encounter?: EncounterHooks | null;
  }

  let { map, roomId, onexec, tables = null, encounter = null }: Props = $props();

  const room = $derived(map.rooms.find((r) => r.id === roomId));

  let type = $state('');
  let unique = $state(false);
  let narrative = $state('');
  // Seed from the room, and follow it through Save, Undo and Redo.
  $effect(() => {
    type = room?.label.type ?? '';
    unique = room?.label.unique ?? false;
    narrative = room?.label.narrative ?? '';
  });

  const changed = $derived(
    !!room && (type.trim() !== room.label.type || unique !== room.label.unique || narrative.trim() !== room.label.narrative),
  );

  function save(r: Room) {
    if (!changed) return;
    onexec(updateRoom(r, { ...r, label: { type: type.trim(), unique, narrative: narrative.trim() } }));
  }

  let rolling = $state(false);
  function applyRoll(r: Room, contents: RoomContents, isUnique: boolean): boolean {
    // One undo step: the label, the note, the roll and the room's own exit types.
    const cmd = applyRoomRoll(r, contents, isUnique);
    const ok = onexec({ ...cmd, label: `Roll room ${r.number}` });
    if (ok) rolling = false;
    return ok;
  }

  const otherTitles: Record<Exclude<Room['kind'], 'room'>, string> = {
    corridor: 'Corridor',
    passage: 'Exit square',
    entrance: 'Entrance square',
  };
</script>

{#if room}
  <div class="editor" data-editor="room">
    {#if room.kind === 'room'}
      <h3>Room {room.number}</h3>
      <dl>
        <dt>Size</dt>
        <dd>{room.w}×{room.h}</dd>
        <dt>Class</dt>
        <dd class="cap">{room.sizeClass}</dd>
        <dt>Exits</dt>
        <dd>{roomExitCount(map, room)}</dd>
      </dl>
      {#if room.contents}
        <dl data-testid="room-contents">
          <dt>Roll</dt>
          <dd>{room.contents.roll}</dd>
          <dt>Type</dt>
          <dd>{room.contents.type}</dd>
          <dt>Description</dt>
          <dd>{room.contents.description}</dd>
          {#if room.contents.encounter}
            <dt>Encounter</dt>
            <dd data-testid="encounter-text">{#if encounter}<EncounterText text={room.contents.encounter} {tables} {...encounter} />{:else}{room.contents.encounter}{/if}</dd>
          {/if}
        </dl>
      {:else if rolling}
        <RoomRoll {map} {room} {tables} {encounter} onapply={(c, u) => applyRoll(room, c, u)} oncancel={() => (rolling = false)} />
      {:else if tables}
        <div class="row">
          <button type="button" onclick={() => (rolling = true)}>Roll for this room</button>
        </div>
      {/if}
      <form class="label" onsubmit={(e) => { e.preventDefault(); save(room); }}>
        <label class="field"><span class="name">Room type</span> <input type="text" bind:value={type} placeholder="e.g. Lamp Room" /></label>
        <label class="check"><input type="checkbox" bind:checked={unique} /> Unique</label>
        <label class="field"><span class="name">Narrative</span> <textarea rows="3" bind:value={narrative}></textarea></label>
        <div class="row">
          <button type="submit" class="primary" disabled={!changed}>Save</button>
        </div>
      </form>
    {:else}
      <h3>{otherTitles[room.kind]}</h3>
      <dl>
        <dt>Size</dt>
        <dd>{room.w}×{room.h}</dd>
      </dl>
    {/if}
  </div>
{/if}

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
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 16px;
    margin: 0;
    font-size: 18px;
  }
  dt {
    font-weight: 600;
  }
  dd {
    margin: 0;
  }
  .cap {
    text-transform: capitalize;
  }
  .label {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .name {
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
