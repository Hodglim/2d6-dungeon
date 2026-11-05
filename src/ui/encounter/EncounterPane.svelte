<script lang="ts" module>
  import type { Encounter as Enc } from '../../systems/dungeon/combat';
  /**
   * `dismissed`: the fight state whose win question was cancelled. `victory`: the Victory panel is
   * up. (The XP already added lives in the encounter, on the undo timeline.)
   */
  export interface WinState {
    dismissed: Enc | null;
    victory: boolean;
  }
  export const NO_WIN: WinState = { dismissed: null, victory: false };
</script>

<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import type { History } from '../../core/history';
  import { randomId } from '../../core/ids';
  import type { CardPack } from '../../systems/dungeon/cards';
  import {
    fatigueDie,
    fatigueShift,
    interruptReminder,
    momentumShift,
    nextTurn,
    setFoeHp,
    turnFoe,
    type Encounter,
    type Foe,
    type RolledRoll,
  } from '../../systems/dungeon/combat';
  import { findCard, findCreature, rollCreatureTable } from '../../systems/dungeon/creatures';
  import type { CreatureTableEntry } from '../../systems/dungeon/tables';
  import type { Hero } from '../../systems/dungeon/hero';
  import type { DungeonTables } from '../../systems/dungeon/tables';
  import { foePool, heroPool, locked, matches, type DiceState } from '../../systems/dungeon/shift';
  import DieFace from '../DieFace.svelte';
  import { adjustHp, commitHero } from '../hero/heroActions';
  import { shouldAskWin } from '../endings';
  import VictoryPanel from './VictoryPanel.svelte';
  import EncounterPicker from './EncounterPicker.svelte';
  import EncounterText from './EncounterText.svelte';
  import HpTracker from './HpTracker.svelte';
  import PendingRollView from './PendingRoll.svelte';
  import TurnDice from './TurnDice.svelte';
  import {
    applyCreatureRoll,
    awardVictoryXp,
    commitEncounter,
    dismissRolled,
    dropPendingRoll,
    queueCreatureRoll,
    rollName,
    startOrJoin,
  } from './encounterActions';

  interface Props {
    history: History;
    encounter: Encounter | null;
    hero: Hero | null;
    tables: DungeonTables | null;
    cards: CardPack | null;
    /** A stored card pack exists but could not be read. */
    cardsUnreadable?: boolean;
    /** Hide the pane (offered only while no fight is open). */
    onclose: () => void;
    /** Creatures to add from outside the pane (a Fight button on the map side); a new seq is a new request. */
    request?: { names: string[]; seq: number } | null;
    /** The pane has taken the request (so a remount doesn't take it twice). */
    onrequesttaken?: () => void;
    /** The win question and Victory panel, kept by the shell so switching tabs doesn't lose them. */
    win?: WinState;
    onwin?: (w: WinState) => void;
    /** Don't ask "win the fight?" now (the death question goes first, or the game is over). */
    holdWin?: boolean;
    /** Show a reference table in the Tables pane. */
    onopentable?: (code: string, modifier: number) => void;
  }
  let {
    history,
    encounter,
    hero,
    tables,
    cards,
    cardsUnreadable = false,
    onclose,
    request = null,
    onrequesttaken,
    win = NO_WIN,
    onwin = () => {},
    holdWin = false,
    onopentable,
  }: Props = $props();

  const askingWin = $derived(!holdWin && !win.victory && shouldAskWin(encounter, win.dismissed));
  const showVictory = $derived(win.victory && encounter !== null);

  let adding = $state(false);
  /** A creature with no stats in the table file, waiting for its starting HP (answered by the inline form). */
  let asking = $state<{ name: string; answer: (hp: number | null) => void } | null>(null);
  const askingFor = $derived(asking?.name ?? null);
  /** Resolved creature-table rolls, newest first, with their index in encounter.rolled. */
  const results = $derived(encounter ? encounter.rolled.map((r, i) => ({ r, i })).reverse() : []);
  let rollError = $state<{ index: number; text: string } | null>(null);
  let hpText = $state('');
  let hpError = $state<string | null>(null);
  let hpInput = $state<HTMLInputElement>();
  let confirmingEnd = $state(false);
  /** The card shown full screen. */
  let big = $state<{ name: string; image: string } | null>(null);
  let closeBig = $state<HTMLButtonElement>();

  const fatigue = $derived(encounter ? fatigueShift(encounter.round) : 0);
  const momentum = $derived(encounter ? momentumShift(encounter) : 0);
  const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`);
  const plain = (n: number) => (n < 0 ? `−${-n}` : String(n));

  const current = () => history.encounter as Encounter | null;

  // ---- whose turn, and the attack dice for it ----
  const foeTurn = $derived(encounter ? turnFoe(encounter) : null);
  const turnKey = $derived(encounter ? `${encounter.round}:${encounter.turn}` : '');
  const turnTitle = $derived(foeTurn ? `${foeTurn.name}'s turn` : 'Your turn');
  const pool = $derived.by(() => {
    if (!encounter) return 0;
    if (foeTurn) return foePool(foeTurn, encounter.round);
    return hero ? heroPool(hero.shift, encounter.round, momentum) : 0;
  });
  /** The attack dice (UI state) and the turn they belong to: another turn starts with none. */
  let dice = $state<DiceState | null>(null);
  let diceFor = $state('');
  const turnDice = $derived(diceFor === turnKey ? dice : null);
  let diceBox = $state<HTMLElement>();
  /**
   * A new turn (Next turn, Undo or Redo of one) always starts with no dice, and brings its dice
   * into view: on a creature's turn they sit beneath its card, so the bottom of the card shows
   * just above them (the turn bar stays pinned at the top).
   */
  let seenKey = '';
  $effect(() => {
    const k = turnKey;
    if (k === seenKey) return;
    const first = seenKey === '';
    seenKey = k;
    dice = null;
    if (!first && k) void tick().then(() => diceBox?.scrollIntoView({ block: foeTurn ? 'end' : 'nearest' }));
  });
  function setDice(s: DiceState | null) {
    dice = s;
    diceFor = turnKey;
    // The rolled dice (arrows, note) stand taller than the entry: keep all of them on screen.
    if (s) void tick().then(() => diceBox?.scrollIntoView({ block: 'nearest' }));
  }
  /** Manoeuvres the hero's attack dice match now (none on a creature's turn, before a roll, or on a natural double 1/6). */
  const matched = $derived(hero && turnDice && !foeTurn && !locked(turnDice) ? new Set(matches(turnDice.faces, hero.manoeuvres)) : new Set<number>());

  /** Bumped when a newer request takes over the HP prompt: the older run of questions stops. */
  let askRun = 0;

  /** Close any open HP prompt and stop the run of questions it belongs to. */
  function abandonAsk() {
    askRun++;
    const a = asking;
    asking = null;
    a?.answer(null);
  }
  onDestroy(abandonAsk);

  /** Ask the inline prompt for one creature's starting HP; null when cancelled. */
  async function askOne(name: string): Promise<number | null> {
    adding = false;
    hpText = '';
    hpError = null;
    const answer = new Promise<number | null>((resolve) => (asking = { name, answer: resolve }));
    await tick();
    hpInput?.focus();
    return answer;
  }

  /**
   * askHp stays synchronous for startOrJoin and applyCreatureRoll: first ask, in order, for each
   * name with no stats (Cancel skips just that one), then replay the answers in the same order.
   * Null when a newer request took over the prompt (or the pane closed): the caller then does nothing.
   */
  async function collectHp(names: string[]): Promise<((name: string) => number | null) | null> {
    const need = names.filter((n) => n.trim() && !findCreature(tables, n)).map((n) => n.trim());
    const answers: (number | null)[] = [];
    if (need.length) {
      abandonAsk(); // one prompt at a time: an older run still waiting is dropped, not orphaned
      const run = askRun;
      for (const n of need) {
        const a = await askOne(n);
        if (run !== askRun) return null;
        answers.push(a);
      }
    }
    let i = 0;
    return () => answers[i++] ?? null;
  }

  async function addByName(names: string[]) {
    const askHp = await collectHp(names);
    if (askHp) startOrJoin(history, tables, names, randomId, askHp);
  }

  function pick(name: string) {
    adding = false;
    void addByName([name]);
  }

  // A Fight button outside the pane for a creature with no stats: ask here, then add.
  let seenRequest = 0;
  $effect(() => {
    if (!request || request.seq === seenRequest) return;
    seenRequest = request.seq;
    const names = request.names;
    onrequesttaken?.();
    void addByName(names);
  });

  function submitHp(e: SubmitEvent) {
    e.preventDefault();
    const t = hpText.trim();
    if (!/^\d+$/.test(t) || Number(t) < 1) {
      hpError = 'Type a whole number, 1 or more.';
      return;
    }
    const a = asking!;
    asking = null;
    a.answer(Number(t));
  }

  function cancelHp() {
    const a = asking;
    asking = null;
    a?.answer(null);
  }

  /** A die for pending[index]: show the sum, ask for any HP needed, then resolve it as one step. */
  async function resolvePending(index: number, die: number) {
    const e = current();
    const p = e?.pending[index];
    if (!e || !p) return;
    if (!tables) {
      rollError = { index, text: 'Load your table file to roll on this table.' };
      return;
    }
    const preview = rollCreatureTable(tables, p.code, die, p.modifier);
    if (!preview) {
      rollError = { index, text: `Your table file has no table ${p.code}.` };
      return;
    }
    rollError = null;
    const askHp = 'creatures' in preview.entry ? await collectHp(preview.entry.creatures) : () => null;
    if (!askHp) return;
    // The pending list may have changed while asking (Undo, say): resolve the same roll or none.
    const now = current();
    const at = now ? now.pending.findIndex((q, i) => i === index && q.code === p.code && q.modifier === p.modifier) : -1;
    if (at < 0) return;
    const r = applyCreatureRoll(history, tables, at, die, randomId, askHp);
    if (!r.ok) rollError = { index, text: r.reason };
  }

  // Each pending roll (and each result) object gets its own key, so its DiceEntry is never handed
  // to another roll (two queued "PRAC1 −1" rolls are distinct; Undo brings back the original
  // object, which mounts fresh).
  const objectKeys = new WeakMap<object, number>();
  let keySeq = 0;
  function keyOf(p: object): number {
    let k = objectKeys.get(p);
    if (k === undefined) objectKeys.set(p, (k = ++keySeq));
    return k;
  }

  /** The table row a resolved roll landed on, or null when the table file (or that table) is gone. */
  function rolledEntry(r: RolledRoll): CreatureTableEntry | null {
    return tables?.tables.creatureTables?.[r.code]?.[String(r.total)] ?? null;
  }

  function removePending(index: number) {
    rollError = null;
    dropPendingRoll(history, index);
  }

  /** "4 − 1 = 3", or "4" with no modifier; a clamped total says what it counts as. */
  function sumText(r: RolledRoll): string {
    if (r.modifier === 0) return String(r.die);
    const raw = r.die + r.modifier;
    const sum = `${r.die} ${r.modifier < 0 ? '−' : '+'} ${Math.abs(r.modifier)} = ${plain(raw)}`;
    return raw === r.total ? sum : `${sum}, counts as ${r.total}`;
  }

  // The fight is over (by any route: End, win, Undo, import): its confirm goes with it.
  $effect(() => {
    if (!encounter) {
      confirmingEnd = false;
      dice = null;
    }
  });
  // Death or Game Over takes the screen: a full-screen card would sit above its cover.
  $effect(() => {
    if (holdWin) big = null;
  });
  // Asking or showing the win replaces the End-encounter confirm.
  $effect(() => {
    if (askingWin || showVictory) confirmingEnd = false;
  });

  function confirmWin() {
    onwin({ ...win, victory: true });
  }

  function cancelWin() {
    onwin({ ...win, dismissed: current() });
  }

  function addVictoryXp() {
    awardVictoryXp(history);
  }

  function winDone() {
    commitEncounter(history, null, 'Win the fight');
  }

  function foeStep(f: Foe, d: number) {
    const e = current();
    const now = e?.foes.find((x) => x.id === f.id);
    if (!e || !now) return;
    commitEncounter(history, setFoeHp(e, f.id, now.hp + d), `${f.name} HP`, { mergeKey: `foe-hp:${f.id}` });
  }

  function foeSet(f: Foe, n: number) {
    const e = current();
    if (e) commitEncounter(history, setFoeHp(e, f.id, n), `${f.name} HP ${n}`);
  }

  function heroStep(d: number) {
    const h = history.hero as Hero | null;
    if (h) commitHero(history, adjustHp(h, d), { mergeKey: 'hero-hp' });
  }

  function heroSet(n: number) {
    const h = history.hero as Hero | null;
    if (h) commitHero(history, { ...h, hp: n });
  }

  function next() {
    const e = current();
    if (e) commitEncounter(history, nextTurn(e), 'Next turn');
  }

  function end() {
    const e = current();
    if (!e) return;
    if (!confirmingEnd && e.foes.some((f) => f.hp > 0)) {
      confirmingEnd = true;
      return;
    }
    confirmingEnd = false;
    commitEncounter(history, null, 'End encounter');
  }

  $effect(() => {
    if (big) closeBig?.focus();
  });

  function onKey(e: KeyboardEvent) {
    if (big && e.key === 'Escape') {
      e.preventDefault();
      big = null;
    }
  }
</script>

{#snippet foeCard(f: Foe)}
  {@const card = findCard(cards, f.name)}
<li class="foe" class:defeated={f.hp <= 0} class:current={foeTurn?.id === f.id} data-testid="foe">
  {#if card}
    <button class="thumb" aria-label="View {f.name} full screen" onclick={() => (big = { name: f.name, image: card.image })}>
      <img src={card.image} alt="" />
    </button>
  {/if}
  <div class="info">
    <div class="name">
      <span>{f.name}</span>
      {#if foeTurn?.id === f.id}<span class="tag turn-tag">Attacking</span>{/if}
      {#if f.hp <= 0}<span class="tag">Defeated</span>{/if}
    </div>
    <HpTracker name={f.name} value={f.hp} onstep={(d) => foeStep(f, d)} onset={(n) => foeSet(f, n)} />
    <div class="stats">
      <span class="shift">SH {f.shift === null ? '?' : plain(f.shift)} ({signed(fatigue)})</span>
      <span class="small">XP {f.xp ?? '?'}</span>
      <span class="small">Treasure: {f.treasure === null ? '?' : f.treasure || 'none'}</span>
    </div>
  </div>
</li>
{/snippet}

<svelte:window onkeydown={onKey} />

<aside class="encounter-pane" aria-label="Encounter">
  <div class="body">
    {#if adding}
      <EncounterPicker pack={cards} {tables} {cardsUnreadable} onpick={pick} onclose={() => (adding = false)} />
    {:else}
      <header>
        <h2>Encounter</h2>
        {#if !encounter}<button class="close" onclick={onclose} aria-label="Close encounter">Close</button>{/if}
      </header>

      {#if askingFor !== null}
        <form class="ask" onsubmit={submitHp}>
          <label for="enc-start-hp">Starting HP for {askingFor}</label>
          <div class="row">
            <input id="enc-start-hp" bind:this={hpInput} bind:value={hpText} type="text" inputmode="numeric" autocomplete="off" />
            <button type="submit" class="primary">Add</button>
            <button type="button" onclick={cancelHp}>Cancel</button>
          </div>
          {#if hpError}<p class="error" role="alert">{hpError}</p>{/if}
        </form>
      {/if}

      {#if askingWin}
        <div class="confirm win" role="alert">
          <p>All creatures defeated: win the fight?</p>
          <div class="row">
            <button class="primary" onclick={confirmWin}>Win the fight</button>
            <button onclick={cancelWin}>Not yet</button>
          </div>
        </div>
      {/if}

      {#if showVictory && encounter}
        <VictoryPanel {encounter} {tables} {onopentable} hasHero={hero !== null} onaddxp={addVictoryXp} ondone={winDone} />
      {/if}

      {#if encounter && askingFor === null}
        {#each encounter.pending as p, i (keyOf(p))}
          <PendingRollView roll={p} error={rollError?.index === i ? rollError.text : null} ondie={(d) => void resolvePending(i, d)} onremove={() => removePending(i)} />
        {/each}
      {/if}

      {#each results as { r, i } (keyOf(r))}
        {@const entry = rolledEntry(r)}
        <div class="result" data-testid="creature-roll-result">
          <div class="line">
            <span class="code">{rollName(r.code, r.modifier)}</span>
            <span class="sum">{sumText(r)}{entry ? ':' : ''}</span>
            {#if entry && 'creatures' in entry}<span>{entry.creatures.join(', ')}</span>{/if}
            <button type="button" class="dismiss" aria-label="Dismiss roll result" onclick={() => dismissRolled(history, i)}>×</button>
          </div>
          {#if entry && 'text' in entry}
            <p class="said"><EncounterText text={entry.text} {tables} onroll={(code, mod) => queueCreatureRoll(history, code, mod)} onfight={(name) => void addByName([name])} {onopentable} /></p>
          {/if}
        </div>
      {/each}

      {#if encounter}
        <div class="turn-bar" data-testid="turn-bar">
          <span class="turn" data-testid="turn">{turnTitle}</span>
          <div class="round">
            <span class="label" data-testid="round">Round {encounter.round}</span>
            <DieFace value={fatigueDie(encounter.round)} colour="red" size={44} />
            <span class="bonus" data-testid="fatigue">{signed(fatigue)} Shift</span>
            <button class="primary" onclick={next}>Next turn</button>
          </div>
        </div>
        {#if interruptReminder(encounter.round)}
          <p class="reminder">From round 7, creatures can't use Interrupts that move them or an item. Armour Interrupts still count.</p>
        {/if}

        {#if foeTurn}
          <ul class="foes attacker" aria-label="Attacking creature">{@render foeCard(foeTurn)}</ul>
        {/if}

        <div class="dice-box" bind:this={diceBox}>
          {#key turnKey}
            <TurnDice
              who={foeTurn ? 'creature' : 'hero'}
              {pool}
              unknownShift={foeTurn !== null && foeTurn.shift === null}
              manoeuvres={!foeTurn && hero ? hero.manoeuvres : []}
              dice={turnDice}
              onchange={setDice}
            />
          {/key}
        </div>

        {#if hero}
          <div class="hero" class:current={!foeTurn} data-testid="hero-hp">
            <div class="name"><span>{hero.name}</span>{#if !foeTurn}<span class="tag turn-tag">Attacking</span>{/if}</div>
            <HpTracker name={hero.name} value={hero.hp} onstep={heroStep} onset={heroSet} />
            <div class="stats">
              <span class="shift">SH {plain(hero.shift + fatigue + momentum)}</span>
              <span class="small">{plain(hero.shift)} base {signed(fatigue)} fatigue{momentum ? ` ${signed(momentum)} momentum` : ''}</span>
            </div>
            {#if hero.manoeuvres.length}
              <ul class="manoeuvres" aria-label="Manoeuvres">
                {#each hero.manoeuvres as m, i (i)}
                  <li class:match={matched.has(i)} data-testid="manoeuvre">
                    <span class="faces">
                      {#if m.dice[0]}<DieFace value={m.dice[0]} colour="red" size={28} />{/if}
                      {#if m.dice[1]}<DieFace value={m.dice[1]} colour="blue" size={28} />{/if}
                    </span>
                    <span class="m-name">{m.name}</span>
                    {#if m.modifier}<span class="m-mod">Damage {m.modifier}</span>{/if}
                    {#if matched.has(i)}<span class="tag">Hit</span>{/if}
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}

        <ul class="foes" aria-label="Creatures">
          {#each encounter.foes as f (f.id)}
            {#if f.id !== foeTurn?.id}{@render foeCard(f)}{/if}
          {:else}
            <li class="none">No creatures yet.</li>
          {/each}
        </ul>
      {:else if askingFor === null}
        <p class="none">No fight yet. Add a creature to start one.</p>
      {/if}

      <div class="row">
        {#if askingFor === null}<button onclick={() => ((adding = true), (confirmingEnd = false))}>Add creature</button>{/if}
        {#if encounter && !showVictory}<button onclick={end}>End encounter</button>{/if}
      </div>
      {#if confirmingEnd}
        <div class="confirm" role="alert">
          <p>Creatures are still standing. End the encounter anyway?</p>
          <div class="row">
            <button class="primary" onclick={end}>End encounter</button>
            <button onclick={() => (confirmingEnd = false)}>Keep fighting</button>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</aside>

{#if big}
  <button class="full" bind:this={closeBig} aria-label="Close full screen card" onclick={() => (big = null)}>
    <img src={big.image} alt={big.name} />
  </button>
{/if}

<style>
  .encounter-pane {
    min-width: 0;
    min-height: 0;
    display: flex;
    background: var(--paper);
    border-left: 2px solid var(--ink);
    overflow: hidden;
  }
  .body {
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    padding: 12px 18px 18px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  header,
  .row,
  .round {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
  }
  h2 {
    flex: 1;
    margin: 0;
    font-size: 22px;
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
  button.primary {
    color: var(--paper);
    background: var(--ink);
  }
  .ask {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 12px;
    background: var(--paper-dim);
    border-left: 4px solid var(--ink);
  }
  .ask label {
    font-size: 18px;
    font-weight: 600;
  }
  .ask input {
    width: 90px;
    padding: 0 10px;
  }
  .error {
    margin: 0;
    color: var(--danger);
  }
  .result {
    padding: 6px 10px;
    border-left: 4px solid var(--ink);
    background: var(--paper-dim);
  }
  .result .line {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 10px;
    font-size: 18px;
  }
  .result .sum {
    font-weight: 700;
  }
  .result .code {
    font-size: 15px;
    color: var(--muted);
  }
  .result .dismiss {
    margin-left: auto;
    font-size: 22px;
  }
  .result .said {
    margin: 4px 0 0;
    font-size: 17px;
  }
  .foes {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .foe,
  .hero {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px 10px;
    border: 2px solid var(--rule);
    border-radius: 8px;
    background: var(--paper);
  }
  .hero {
    gap: 6px;
    border-color: var(--ink);
  }
  .foe.defeated {
    opacity: 0.55;
    background: var(--paper-dim);
  }
  /* The card fills the pane's width, as the old single-card view did; HP and stats sit beneath it. */
  .thumb {
    flex: none;
    width: 100%;
    padding: 0;
    border: 2px solid var(--rule);
    background: none;
    cursor: zoom-in;
  }
  .thumb img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 4px;
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .name {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 19px;
    font-weight: 700;
  }
  .tag {
    font-size: 14px;
    font-weight: 600;
    padding: 2px 8px;
    border: 1px solid var(--ink);
    border-radius: 10px;
  }
  .stats {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 4px 12px;
  }
  .shift {
    font-weight: 600;
  }
  .small {
    font-size: 14px;
    color: var(--muted);
  }
  .turn-bar {
    position: sticky;
    top: -12px; /* the body's top padding: pinned flush with the pane's top edge */
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 12px;
    border: 2px solid var(--ink);
    border-radius: 8px;
    background: var(--paper-dim);
  }
  .dice-box {
    scroll-margin-top: 140px;
    scroll-margin-bottom: 8px;
  }
  .turn {
    font-size: 24px;
    font-weight: 700;
  }
  .foe.current,
  .hero.current {
    border: 3px solid var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent);
  }
  .turn-tag {
    color: var(--paper);
    background: var(--accent);
    border-color: var(--accent);
  }
  .manoeuvres {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .manoeuvres li {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px 10px;
    padding: 4px 8px;
    border: 2px solid transparent;
    border-radius: 6px;
  }
  .manoeuvres li.match {
    border-color: var(--ink);
    background: #f1e3b8;
    font-weight: 700;
  }
  .manoeuvres .faces {
    display: inline-flex;
    gap: 4px;
  }
  .m-name {
    font-size: 17px;
  }
  .m-mod {
    font-size: 15px;
    color: var(--muted);
  }
  .round .label {
    font-size: 20px;
    font-weight: 700;
  }
  .round .bonus {
    flex: 1;
    font-size: 17px;
    font-weight: 600;
  }
  .reminder {
    margin: 0;
    padding: 6px 10px;
    font-size: 16px;
    background: var(--paper-dim);
    border-left: 4px solid var(--accent);
  }
  .none {
    margin: 0;
    color: var(--muted);
  }
  .confirm {
    padding: 8px 12px;
    background: var(--paper-dim);
    border-left: 4px solid var(--danger);
  }
  .confirm.win {
    border-left-color: var(--accent);
  }
  .confirm p {
    margin: 0 0 8px;
    font-size: 18px;
  }
  .full {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: grid;
    place-items: center;
    padding: 12px;
    border: 0;
    border-radius: 0;
    background: rgba(20, 16, 10, 0.9);
    cursor: zoom-out;
  }
  .full img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
  }
  :focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
</style>
