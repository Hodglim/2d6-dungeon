<script lang="ts">
  // The lock panel: the lock check on a fresh door, then pick, wait for a patrol, or leave it.
  // Everything shown comes from the door as it is now, so Undo puts the panel back by itself.
  import type { ExecResult, History } from '../../core/history';
  import type { Door, DungeonMap } from '../../core/types';
  import type { Hero } from '../../systems/dungeon/hero';
  import { findLockPicks, lockTableLines, patrolTableFor } from '../../systems/dungeon/locks';
  import { parseDie } from '../../systems/dungeon/rules';
  import type { DungeonTables } from '../../systems/dungeon/tables';
  import type { DiceJob } from '../diceDesk';
  import { lockStage } from '../lockPanel';
  import { checkLock, pickLock, rollLockQuality, waitForPatrol } from '../lockActions';
  import RollCard from '../RollCard.svelte';

  interface Props {
    map: DungeonMap;
    doorId: string;
    then: 'exit' | 'gap' | null;
    history: History;
    tables: DungeonTables | null;
    hero: Hero | null;
    fighting: boolean;
    onclose: () => void;
    /** The door is open and an exit flow follows: start it. */
    onopen: (doorId: string, then: 'exit' | 'gap') => void;
  }

  let { map, doorId, then, history, tables, hero, fighting, onclose, onopen }: Props = $props();

  const door = $derived<Door | undefined>(map.doors.find((d) => d.id === doorId));
  const stage = $derived(door ? lockStage(door, tables) : 'gone');
  const typeName = $derived(door ? `${door.type.charAt(0).toUpperCase()}${door.type.slice(1)} door` : '');

  let error = $state<string | null>(null);
  let view = $state<'choices' | 'pick' | 'wait'>('choices');
  let pickIndex = $state<number | null>(null);

  const picks = $derived(hero ? findLockPicks(hero) : []);
  const pick = $derived(picks.find((p) => p.index === pickIndex) ?? picks[0] ?? null);
  const damaged = $derived(door?.lock?.damaged === true);
  const quality = $derived(door?.lock?.quality ?? null);
  const patrol = $derived(patrolTableFor(tables, map.level));
  const hpChange = $derived(hero ? 2 * hero.level : 0);

  function run(res: ExecResult): string | null {
    error = res.ok ? null : res.reason;
    return error;
  }

  // An open door with an exit flow to follow hands over once; one between rooms just says so.
  let handedOver = false;
  $effect(() => {
    if (stage === 'gone') onclose();
    else if (stage === 'open' && then !== null && !handedOver) {
      handedOver = true;
      onopen(doorId, then);
    }
  });
  // A damaged lock can't be picked: back to the choices.
  $effect(() => {
    if (damaged && view === 'pick') view = 'choices';
  });

  const BAD_DIE = 'Enter a whole number from 1 to 6';
  const dice = (values: string[], n: number): number[] | null => {
    const faces = values.slice(0, n).map((v) => parseDie(v ?? ''));
    return faces.length === n && faces.every((f) => f !== null) ? (faces as number[]) : null;
  };
  const sum = (faces: number[]) => faces.reduce((a, b) => a + b, 0);

  const checkJob: DiceJob = $derived({
    id: 'lock-check',
    kind: 'request',
    label: `Lock check: ${door?.type ?? ''} door`,
    dice: 'd6',
    modifier: null,
    rolled: ([v]) => {
      if (tables && v !== undefined) run(checkLock(history, tables, doorId, v));
    },
    enter: (values) => {
      const f = dice(values, 1);
      if (!f) return BAD_DIE;
      return tables ? run(checkLock(history, tables, doorId, f[0]!)) : null;
    },
    error,
  });

  const qualityJob: DiceJob = $derived({
    id: 'lock-quality',
    kind: 'request',
    label: 'Lock quality',
    dice: '2d6',
    modifier: null,
    rolled: (faces) => {
      run(rollLockQuality(history, doorId, sum(faces)));
    },
    enter: (values) => {
      const f = dice(values, 2);
      return f ? run(rollLockQuality(history, doorId, sum(f))) : BAD_DIE;
    },
    error,
  });

  const pickJob: DiceJob = $derived({
    id: 'lock-pick',
    kind: 'request',
    label: 'Pick the lock',
    dice: '2d6',
    modifier: (hero?.precision ?? 0) + (pick?.bonus ?? 0),
    rolled: (faces, modifier) => {
      if (pick) run(pickLock(history, doorId, pick.index, sum(faces) + modifier));
    },
    enter: (values, modifier) => {
      const f = dice(values, 2);
      if (!f) return BAD_DIE;
      return pick ? run(pickLock(history, doorId, pick.index, sum(f) + modifier)) : null;
    },
    error,
  });

  function wait(eat: boolean) {
    if (run(waitForPatrol(history, tables, doorId, eat)) === null) view = 'choices';
  }
</script>

{#if stage === 'check' && tables}
  <h2>Check the door</h2>
  <p>{typeName}. Roll a D6 to see whether it is locked:</p>
  <ul class="locks" data-testid="lock-lines">
    {#each lockTableLines(tables) as line (line)}<li>{line}</li>{/each}
  </ul>
  <RollCard job={checkJob} />
{:else if stage === 'choices'}
  <h2>Locked</h2>
  <p>{typeName}{quality !== null ? ` · Lock quality ${quality}` : ''}</p>
  {#if damaged}<p class="notice" data-testid="lock-damaged">The lock is damaged</p>{/if}
  {#if view === 'pick' && pick}
    {#if picks.length > 1}
      <fieldset class="picks">
        <legend>Which lock pick?</legend>
        {#each picks as p (p.index)}
          <label><input type="radio" name="lock-pick" checked={p.index === pick.index} onchange={() => (pickIndex = p.index)} /> {p.bonus < 0 ? `−${-p.bonus}` : `+${p.bonus}`} · {p.uses} {p.uses === 1 ? 'use' : 'uses'} left</label>
        {/each}
      </fieldset>
    {/if}
    {#if quality === null}
      <RollCard job={qualityJob} />
    {:else}
      <p>Roll 2D6 + Precision + the pick's bonus. {quality} or more opens it; one use comes off the pick either way.</p>
      <RollCard job={pickJob} />
    {/if}
    <div class="row"><button onclick={() => (view = 'choices')}>Back</button></div>
  {:else if view === 'wait'}
    <p>Wait for someone to come through. You need to eat while you wait.</p>
    {#if !patrol}<p class="notice" data-testid="no-patrol">Roll on your level's patrol table</p>{/if}
    <div class="row">
      {#if hero}
        <button class="primary" disabled={hero.rations < 1} onclick={() => wait(true)}>Eat a ration (+{hpChange} HP)</button>
        <button onclick={() => wait(false)}>Go hungry (−{hpChange} HP)</button>
      {:else}
        <button class="primary" onclick={() => wait(false)}>Wait</button>
      {/if}
    </div>
    <div class="row"><button onclick={() => (view = 'choices')}>Back</button></div>
  {:else}
    <div class="row choices">
      <button data-testid="lock-pick" disabled={damaged || picks.length === 0} onclick={() => ((error = null), (view = 'pick'))}>Pick the lock</button>
      <button data-testid="lock-wait" disabled={fighting} onclick={() => ((error = null), (view = 'wait'))}>Wait for a patrol</button>
      <button data-testid="lock-leave" onclick={onclose}>Leave it</button>
    </div>
    {#if !damaged && picks.length === 0}<p class="hint">Add a lock pick to Small Items, e.g. "Lock Pick +1 (3)"</p>{/if}
    {#if fighting}<p class="hint">Finish the fight first</p>{/if}
  {/if}
  {#if error && view !== 'pick'}<p class="error" role="alert">{error}</p>{/if}
{:else if stage === 'open' && then === null}
  <h2>Unlocked</h2>
  <p>{typeName}. The way is open.</p>
  <div class="row"><button onclick={onclose}>Close</button></div>
{/if}

<style>
  .locks {
    margin: 0;
    padding-left: 22px;
    font-size: 18px;
  }
  .picks {
    border: 1px solid var(--rule);
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 18px;
  }
  .choices {
    flex-wrap: wrap;
  }
</style>
