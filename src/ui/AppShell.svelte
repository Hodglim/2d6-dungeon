<script lang="ts">
  import { onMount } from 'svelte';
  import { demoMap } from '../app/demo';
  import { createCampaign, createMap } from '../core/campaign';
  import { addFeature, setHero, type Command } from '../core/commands';
  import { rectContains } from '../core/geometry';
  import { type ExecResult, History } from '../core/history';
  import { randomId } from '../core/ids';
  import { findPath } from '../core/pathfinding';
  import { coverage } from '../core/query';
  import { moveToken } from '../core/token';
  import type { Campaign, Cell, DungeonMap } from '../core/types';
  import { PlayFlow, type Step } from '../interaction/playflow';
  import { setBeforeReload } from '../pwa/register';
  import { Autosaver } from '../persistence/autosave';
  import { cardsKind, chooseFile, loadStored, readStored, removeFile, tablesKind } from '../persistence/extras';
  import { exportCampaignFile, readImportText } from '../persistence/files';
  import { campaignFrom, metaFrom, type CampaignMeta, type GameOver as GameOverRecord } from '../persistence/record';
  import { shareOrDownload } from '../persistence/share';
  import { blankTableFile, TEMPLATE_FILE_NAME } from '../systems/dungeon/template';
  import { isIosSafari, isStandalone, readDisplayEnv } from '../persistence/standalone';
  import { decideStartup, loadWithTimeout } from '../persistence/startup';
  import { IdbSaveStore } from '../persistence/store';
  import type { Point } from '../render/camera';
  import type { Pick } from '../render/hit';
  import { DEFAULT_TOGGLES, type DisplayToggles } from '../render/renderer';
  import { dungeonSystem } from '../systems/dungeon';
  import type { CardPack } from '../systems/dungeon/cards';
  import { allDefeated, type Encounter } from '../systems/dungeon/combat';
  import { restOnStairs, type Hero } from '../systems/dungeon/hero';
  import { levelLabel } from './levelLabel';
  import type { DungeonTables } from '../systems/dungeon/tables';
  import { classicTheme } from '../systems/dungeon/classic';
  import { drawOverlay, overlayFor, selectionOverlay } from './overlay';
  import { dragOverlay, dropTarget } from './tokenDrag';
  import { drawToken } from '../render/draw';
  import { historyStore, toolAfterClick, type Tool } from './historyStore';
  import UpdatePrompt from './UpdatePrompt.svelte';
  import MapView from './MapView.svelte';
  import InstallHint from './InstallHint.svelte';
  import LoadErrorDialog from './LoadErrorDialog.svelte';
  import Menu from './Menu.svelte';
  import HeroWizard from './wizard/HeroWizard.svelte';
  import ReplaceGameDialog from './ReplaceGameDialog.svelte';
  import SaveBanner from './SaveBanner.svelte';
  import HeroPanel from './hero/HeroPanel.svelte';
  import EncounterPane, { NO_WIN, type WinState } from './encounter/EncounterPane.svelte';
  import DeathDialog from './DeathDialog.svelte';
  import GameOver from './GameOver.svelte';
  import { shouldAskDeath } from './endings';
  import { queueCreatureRoll, startOrJoin, type EncounterHooks } from './encounter/encounterActions';
  import { findCreature } from '../systems/dungeon/creatures';
  import LevelViewer from './LevelViewer.svelte';
  import StairsDialog from './StairsDialog.svelte';
  import StepPanel from './StepPanel.svelte';
  import { resolveSelection, roomTabShown, routeEditorTap, routePlayTap, type Selection } from './tapRouting';
  import Toolbar from './Toolbar.svelte';
  import TablesPane from './tables/TablesPane.svelte';
  import { initialTablesState, openTable, type TablesState } from './tables/tablesState';
  import { findTable } from '../systems/dungeon/referenceTables';
  import DicePanel from './DicePanel.svelte';
  import { readDicePrefs, writeDicePrefs, type DiceKind } from './diceRoller';
  import { provideDiceRoll } from './diceContext';

  function activeMap(c: Campaign): DungeonMap {
    const m = c.maps.find((x) => x.id === c.activeMapId) ?? c.maps[0];
    if (!m) throw new Error('Campaign has no map');
    return m;
  }

  const firstGame = createCampaign(dungeonSystem, 'My dungeon', { width: 25, height: 25 });
  const history = new History(activeMap(firstGame));
  /** Everything about the game except its map (which is the history's current). Replaced with the game. */
  let meta: CampaignMeta = metaFrom(firstGame);
  /** Mirror of meta.earlierLevels for the UI (meta itself is not reactive). Kept in step wherever meta changes. */
  let earlier = $state.raw<DungeonMap[]>(meta.earlierLevels);
  let stairsOpen = $state(false);
  /** Mirror of meta.gameOver: the Game Over cover shows while it's set. Never on the undo timeline. */
  let gameOver = $state.raw<GameOverRecord | null>(meta.gameOver);
  /** The hero state whose death question was cancelled: asked again only once a change makes a new one. */
  let deathDismissed = $state.raw<Hero | null>(null);
  /** The win question and Victory panel (kept here so a remounted pane keeps them). */
  let win = $state.raw<WinState>(NO_WIN);
  /** The Tables pane: open table, back stack, search, results. Kept here so it survives switching tabs; never saved. */
  let tablesState = $state.raw<TablesState>(initialTablesState);
  let viewing = $state.raw<DungeonMap | null>(null);
  const store = new IdbSaveStore();
  const saver = new Autosaver(history, store, () => meta);
  const view = historyStore(history);
  // Real dice and ids for the app. Its History listener cancels a draft on any Undo/Redo.
  type SideTab = 'room' | 'encounter' | 'hero' | 'tables';
  const flow = new PlayFlow(history, Math.random, randomId);

  let tool = $state<Tool>('play');
  let toggles = $state<DisplayToggles>({ ...DEFAULT_TOGGLES });
  let menuOpen = $state(false);
  let newMapOpen = $state(false);
  let wizardMode = $state<'new-game' | 'add-hero'>('new-game');
  /** A "this replaces your game" confirmation waiting for an answer. */
  let pendingReplace = $state<{ title: string; message?: string; onexport?: () => void; run: () => void } | null>(null);
  let saveFailing = $state(false);
  const DISMISS_KEY = '2d6.installHintDismissed';
  const displayEnv = readDisplayEnv();
  const iosTab = isIosSafari(displayEnv);
  function readDismissed(): boolean {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  }
  /** The home-screen hint shows in a browser tab only, until dismissed. */
  let hintDismissed = $state(readDismissed());
  const showHint = $derived(!isStandalone(displayEnv) && !hintDismissed);
  function dismissHint() {
    hintDismissed = true;
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // not remembered; hidden for this session
    }
  }
  /** False until the saved game has been loaded and checked: nothing may change the game before then. */
  let started = $state(false);
  /** Set when the saved record can't be loaded: it stays untouched until the user picks Import or Start new game. */
  let loadError = $state<{ kind: 'damaged'; error: string; raw: unknown } | { kind: 'unreadable'; error: string } | null>(null);

  /** The floating dice roller: open or not and the chosen die are remembered on this device; rolls are not. */
  const storage = (): Storage | undefined => {
    try {
      return localStorage;
    } catch {
      return undefined;
    }
  };
  const dicePrefs = readDicePrefs(storage());
  let diceOpen = $state(dicePrefs.open);
  let diceKind = $state<DiceKind>(dicePrefs.dice);
  /** A "Roll a D6" button asked the roller to roll; the panel takes it once. */
  let diceRequest = $state<{ dice: DiceKind; modifier: number; seq: number } | null>(null);
  let diceSeq = 0;
  $effect(() => writeDicePrefs(storage(), { open: diceOpen, dice: diceKind, enter: dicePrefs.enter }));
  function onDiceButton() {
    if (!started || loadError || gameOver !== null) return;
    diceOpen = !diceOpen;
  }
  /** A dice phrase in encounter or table text, or a hit manoeuvre's damage: open the roller on that die and roll once. */
  function rollFromText(dice: DiceKind, modifier = 0) {
    if (!started || loadError || gameOver !== null) return;
    diceKind = dice;
    diceOpen = true;
    diceRequest = { dice, modifier, seq: ++diceSeq };
  }
  provideDiceRoll(rollFromText);
  let importError = $state<string | null>(null);
  let fileInput: HTMLInputElement | undefined;
  let tablesInput: HTMLInputElement | undefined;
  let cardsInput: HTMLInputElement | undefined;
  /** The player's table file and creature card pack: stored apart from the game, never exported. */
  let tables = $state.raw<DungeonTables | null>(null);
  // The flow rolls rooms on the loaded tables; keep it in step with loads, removals and restores.
  $effect(() => flow.setTables(tables));
  // Results point at rows of the file they were rolled on: a new or removed table file starts the Tables pane afresh.
  let tablesFor: DungeonTables | null = null;
  $effect(() => {
    if (tables === tablesFor) return;
    tablesFor = tables;
    tablesState = initialTablesState;
  });
  let cards = $state.raw<CardPack | null>(null);
  /** What the Door, Stairs or Note tool, or a Play tap, has picked for the panel to edit. */
  let selection = $state.raw<Selection | null>(null);
  /** The selection against the committed map: gone after an Undo that removed its target. */
  const liveSelection = $derived(resolveSelection($view.map, selection));
  let panelCollapsed = $state(false);
  let step = $state.raw<Step>(flow.step);
  /** The sidebar shows the step panel, or the Encounter and Hero panels (tabs when both are open). */
  let sidebar = $state<'steps' | 'side'>('steps');
  /** The side panels were showing when a play-flow step took the sidebar: restore them when the flow ends. */
  let sideBeforeFlow = false;
  let heroOn = $state(false);
  /** The player opened the encounter pane from the toolbar with no fight on (an open fight always shows it). */
  let encounterPaneOpen = $state(false);
  /** The player opened the Tables pane. */
  let tablesOn = $state(false);
  /** Which tab is selected while both are open. */
  let sideTab = $state<SideTab>('encounter');
  const fighting = $derived($view.encounter !== null);
  const heroShown = $derived(sidebar === 'side' && heroOn && $view.hero !== null);
  const encShown = $derived(sidebar === 'side' && (fighting || encounterPaneOpen));
  const tablesShown = $derived(sidebar === 'side' && tablesOn);
  const sideShown = $derived(heroShown || encShown || tablesShown);
  /**
   * The step panel as a tab: while a play-flow step is open (Place and Cancel stay one tap away), or
   * for the room selected in Play (its text stays one tap from the fight).
   */
  const roomTab = $derived(roomTabShown({ sideShown, stepIdle: step.kind === 'idle', tool, selection: liveSelection }));
  const tabs = $derived<SideTab[]>([...(roomTab ? ['room' as const] : []), ...(encShown ? ['encounter' as const] : []), ...(heroShown ? ['hero' as const] : []), ...(tablesShown ? ['tables' as const] : [])]);
  const activeTab = $derived<SideTab>(tabs.includes(sideTab) ? sideTab : (tabs[0] ?? 'encounter'));
  /** A short self-clearing message beside the toolbar (no card pack loaded). */
  let toast = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const NO_TABLES_TOAST = 'Load your table file first — open the menu and choose Load table file…';
  function showToast(text: string) {
    toast = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = null), 5000);
  }

  // A fight that starts (or comes back with Undo, a reload or an import) brings its pane up;
  // one that ends puts the pane away. The card pack has no say: the fight lives in History.
  let wasFighting = false;
  $effect(() => {
    const now = fighting;
    if (now === wasFighting) return;
    wasFighting = now;
    if (now) {
      sideTab = 'encounter';
      if (step.kind !== 'idle') sideBeforeFlow = true;
      else sidebar = 'side';
    } else {
      encounterPaneOpen = false;
      if (sidebar === 'side' && !(heroOn && $view.hero !== null) && !tablesOn) sidebar = 'steps';
    }
  });
  // No hero, no hero panel.
  $effect(() => {
    if ($view.hero === null) heroOn = false;
  });
  let mapView = $state<ReturnType<typeof MapView>>();
  let wasIdle = true;
  /** One-line panel message: a tap hint, or what happened on the last commit. */
  let notice = $state<string | null>(null);
  /** The next exit tap starts a gap corridor instead of a room. */
  let gapMode = $state(false);
  /** The token is being dragged (Play, idle): the pointer's world point. */
  let tokenDragAt = $state.raw<Point | null>(null);

  flow.subscribe((s) => {
    step = s;
    notice = null;
    const starting = wasIdle && s.kind !== 'idle';
    wasIdle = s.kind === 'idle';
    if (s.kind !== 'idle') {
      gapMode = false;
      panelCollapsed = false; // the steps live in the panel
      if (starting) {
        selection = null; // a room, note or stairs shown in Play gives way to the steps
        // The flow takes the sidebar; the side panels come back (or stay as tabs) afterwards.
        if (sidebar === 'side') sideBeforeFlow = true;
        sidebar = 'steps';
      }
    } else if (sideBeforeFlow) {
      // The flow is over: bring the hero sheet and encounter back if they were open when the flow began.
      sideBeforeFlow = false;
      sidebar = 'side';
    }
  });

  /**
   * The map on screen: the draft (entrance square, draft room) while a play-flow step is open,
   * otherwise the committed map. The draft is never committed until finish()/placeGap().
   */
  const shownMap = $derived.by(() => {
    const committed = $view.map;
    return tool === 'play' && step.kind !== 'idle' ? flow.draftMap : committed;
  });

  /**
   * Death from any cause: watched on the History-derived hero, so any execute, undo, redo, restore
   * or import that leaves HP at 0 or below asks. Not before start-up has settled.
   */
  const askingDeath = $derived(started && !loadError && shouldAskDeath($view.hero as Hero | null, gameOver !== null, deathDismissed));

  // The Victory panel goes once the fight is over or a foe is standing again (Undo).
  $effect(() => {
    const e = $view.encounter as Encounter | null;
    if ((e === null || !allDefeated(e)) && win.victory) win = { ...win, victory: false };
  });

  function confirmDeath() {
    const h = history.hero as Hero | null;
    if (!h) return;
    (document.activeElement as HTMLElement | null)?.blur?.();
    flow.cancel();
    stairsOpen = false;
    menuOpen = false;
    viewing = null;
    meta = { ...meta, gameOver: { heroName: h.name, heroLevel: h.level } };
    gameOver = meta.gameOver;
    void saver.saveNow(); // meta only: no history change, so the autosaver must be told
  }

  /** Game Over's New game: the new-game wizard; finishing it clears gameOver, cancelling returns here. */
  function newGameFromGameOver() {
    wizardMode = 'new-game';
    newMapOpen = true;
  }

  /** A modal (menu, dialogs, start-up, Game Over) is open: map taps and shortcuts are off. */
  const modalOpen = $derived(
    !started || !!loadError || menuOpen || newMapOpen || !!pendingReplace || !!importError || stairsOpen || !!viewing || askingDeath || gameOver !== null,
  );

  // The overlay follows the step (and the map, for idle highlights). draftMap isn't reactive,
  // but it only changes together with the step or the committed map.
  $effect(() => {
    const renderer = mapView?.getRenderer();
    if (!renderer) return;
    void $view.map; // re-run on every committed change (idle exit highlights)
    const idle = step.kind === 'idle';
    const drag = tool === 'play' && idle ? tokenDragAt : null;
    const shapes =
      tool === 'play'
        ? [
            ...overlayFor(step, flow.draftMap),
            ...(idle ? selectionOverlay($view.map, liveSelection) : []),
            ...(drag ? dragOverlay($view.map, { x: Math.floor(drag.x), y: Math.floor(drag.y) }) : []),
          ]
        : selectionOverlay($view.map, liveSelection);
    if (!shapes.length && !drag) {
      renderer.setOverlay(null);
      return;
    }
    renderer.setOverlay((ctx, time) => {
      drawOverlay(ctx, shapes, classicTheme);
      if (drag) {
        // A ghost of the token under the pointer; the token itself stays put until the drop.
        ctx.globalAlpha = 0.75;
        drawToken(ctx, drag.x, drag.y, classicTheme, time);
        ctx.globalAlpha = 1;
      }
    });
  });

  function selectTool(clicked: Tool) {
    const t = toolAfterClick(tool, clicked); // a second click on Door, Stairs or Note goes back to Play
    if (t === tool) return; // Play while in Play: nothing to do
    // Switching tools used to cancel a half-placed room without asking; finish or cancel it first.
    if (t !== 'play' && step.kind !== 'idle') return; // the toolbar disables these while placing
    if (t !== 'play') {
      flow.cancel();
      gapMode = false;
    }
    notice = null;
    selection = null;
    tool = t;
  }

  const cover = $derived(coverage($view.map));
  /** Replacing the map would lose something: content on it, or undo history. */
  const hasWork = $derived(hasContent($view.map) || $view.canUndo || $view.hero !== null || $view.encounter !== null);

  function hasContent(m: DungeonMap): boolean {
    return m.rooms.length > 0 || m.doors.length > 0 || m.features.length > 0 || m.token !== null;
  }

  onMount(() => {
    let alive = true;
    const unsubscribe = saver.subscribe((s) => (saveFailing = s.failing));
    // A typed field only commits on blur, so blur it first or the text is lost when the app is closed.
    const blurActive = () => (document.activeElement as HTMLElement | null)?.blur?.();
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        blurActive();
        void saver.flush();
      }
    };
    const onPageHide = () => {
      blurActive();
      void saver.flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);

    setBeforeReload(() => saver.flush());
    saver.pause(); // nothing is saved until the start-up check has run
    void startUp(() => alive);

    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
      unsubscribe();
      saver.dispose();
      flow.dispose();
    };
  });

  /** Loads the record (with a timeout) and decides. Also used by Try again. */
  async function startUp(isAlive: () => boolean = () => true) {
    started = false;
    loadError = null;
    const out = await loadWithTimeout(() => store.load());
    if (!isAlive()) return;
    if (out.kind === 'unreadable') {
      // Storage didn't answer: not a damaged record. The autosaver stays off; nothing is overwritten.
      loadError = { kind: 'unreadable', error: out.error };
      started = true;
      return;
    }
    let decision: ReturnType<typeof decideStartup>;
    try {
      decision = decideStartup(out.raw, dungeonSystem.heroProblem, dungeonSystem.encounterProblem);
      if (decision.kind === 'restore') history.restore(decision.history);
    } catch (err) {
      decision = { kind: 'error', error: `The saved game is damaged: ${err instanceof Error ? err.message : String(err)}` };
    }
    if (decision.kind === 'error') {
      loadError = { kind: 'damaged', error: decision.error, raw: out.raw };
      started = true;
      void loadExtras(isAlive);
      return; // the autosaver stays paused and never started: the record is not touched
    }
    if (decision.kind === 'restore') {
      meta = decision.meta;
      earlier = meta.earlierLevels;
      gameOver = meta.gameOver;
    }
    saver.start();
    saver.resume();
    started = true;
    void loadExtras(isAlive);
  }

  /** Set once the user has chosen or removed a file, so a slower start-up load can't overwrite it. */
  let tablesTouched = false;
  let cardsTouched = false;
  /** A stored card pack exists but could not be read at start-up (Encounter says so instead of "none loaded"). */
  let cardsUnreadable = $state(false);

  /** Loads the stored table file and card pack. Any failure means carrying on without them. */
  async function loadExtras(isAlive: () => boolean) {
    const t = await loadStored(store, tablesKind);
    if (isAlive() && !tablesTouched && t) tables = t;
    const c = await readStored(store, cardsKind);
    if (isAlive() && !cardsTouched) {
      if (c.value) cards = c.value;
      cardsUnreadable = c.unreadable;
    }
  }

  function pickExtra(input: HTMLInputElement | undefined) {
    importError = null;
    input?.click();
  }

  async function onTablesChosen() {
    const file = tablesInput?.files?.[0];
    if (tablesInput) tablesInput.value = '';
    if (!file) return;
    tablesTouched = true;
    const r = await chooseFile(store, tablesKind, file, tables);
    tables = r.value;
    if (!r.ok) importError = r.error;
  }

  async function onCardsChosen() {
    const file = cardsInput?.files?.[0];
    if (cardsInput) cardsInput.value = '';
    if (!file) return;
    cardsTouched = true;
    cardsUnreadable = false;
    const r = await chooseFile(store, cardsKind, file, cards);
    cards = r.value;
    if (!r.ok) importError = r.error;
  }

  async function removeTables() {
    tablesTouched = true;
    const r = await removeFile(store, tablesKind, tables);
    tables = r.value;
    if (!r.ok) importError = r.error;
  }

  async function removeCards() {
    cardsTouched = true;
    cardsUnreadable = false;
    const r = await removeFile(store, cardsKind, cards);
    cards = r.value;
    if (!r.ok) importError = r.error;
  }

  /** From the load-error dialog: replacing the game overwrites the stored record, so confirm first. */
  function askOverwriteSaved(run: () => void) {
    const damaged = loadError?.kind === 'damaged';
    pendingReplace = { title: 'Replace saved game', message: 'This replaces your saved game.', onexport: damaged ? exportDamaged : undefined, run };
  }

  /** Swap in a whole new game (fresh history) and write it now, replacing whatever was saved. */
  function replaceGame(next: CampaignMeta, map: DungeonMap, hero: unknown | null = null, encounter: unknown | null = null) {
    (document.activeElement as HTMLElement | null)?.blur?.(); // commit a half-typed field into the old game first
    meta = next;
    earlier = next.earlierLevels;
    gameOver = next.gameOver;
    deathDismissed = null;
    win = NO_WIN;
    stairsOpen = false;
    viewing = null;
    heroOn = false;
    encounterPaneOpen = false;
    tablesOn = false;
    sidebar = 'steps';
    sideBeforeFlow = false;
    selection = null;
    gapMode = false;
    notice = null;
    loadError = null;
    importError = null;
    saver.start();
    saver.resume();
    history.reset(map, hero, encounter);
    void saver.flush();
  }

  /** Confirm first if the current game has anything in it, then run. */
  function askReplace(title: string, run: () => void) {
    if (hasWork) pendingReplace = { title, run };
    else run();
  }

  /** The wizard finished: confirm the replacement first, as New game always has. */
  function beginNewGame(v: { width: number; height: number; title: string; hero: Hero | null }) {
    const run = () => {
      newMapOpen = false;
      const c = createCampaign(dungeonSystem, v.title || 'My dungeon', { width: v.width, height: v.height, title: v.title });
      replaceGame(metaFrom(c), activeMap(c), v.hero); // a fresh meta: gameOver is null
    };
    // After Game Over the old game is finished (Export is on the Game Over screen): no replace confirm.
    if (gameOver) return run();
    // The wizard stays open until the replacement is accepted, so cancelling keeps the draft.
    askReplace('New game', run);
  }

  /** Add a hero to the current game (opened from the Hero button when there is none). */
  function beginAddHero(v: { hero: Hero | null }) {
    newMapOpen = false;
    if (v.hero) {
      history.execute(setHero(v.hero, 'Create hero'));
      heroOn = true;
      sideTab = 'hero';
      sidebar = 'side';
    }
  }

  /** The toolbar's Hero button: create one, or show or hide the sheet. */
  function onHeroButton() {
    if (!started || loadError) return;
    if ($view.hero === null && !tables) {
      showToast(NO_TABLES_TOAST);
      return;
    }
    sideBeforeFlow = false;
    if ($view.hero === null) {
      wizardMode = 'add-hero';
      newMapOpen = true;
    } else if (heroShown) {
      heroOn = false;
      if (!encShown && !tablesShown) sidebar = 'steps';
    } else {
      heroOn = true;
      sideTab = 'hero';
      sidebar = 'side';
    }
  }

  /** The toolbar's Encounter button: show the pane, or hide it while no fight is open. No card pack needed. */
  function onEncounterButton() {
    if (!started || loadError) return;
    sideBeforeFlow = false;
    if (encShown && activeTab === 'encounter') {
      if (!fighting) closeEncounterPane();
      // An open fight only steps aside (to the hero sheet or the step panel); the button brings it back.
      else if (heroShown) sideTab = 'hero';
      else if (tablesShown) sideTab = 'tables';
      else sidebar = 'steps';
      return;
    }
    encounterPaneOpen = true;
    sideTab = 'encounter';
    sidebar = 'side';
  }

  /** Bring the encounter pane to the front (a Roll or Fight button); a step in progress stays a Room tab. */
  function showEncounterPane() {
    sideBeforeFlow = false;
    encounterPaneOpen = true;
    sideTab = 'encounter';
    sidebar = 'side';
  }

  /** Creatures for the pane to add once it has asked for their starting HP (no stats in the table file). */
  let fightRequest = $state<{ names: string[]; seq: number } | null>(null);
  let fightSeq = 0;

  /** The Roll and Fight buttons in a room's encounter text. */
  const encounterHooks: EncounterHooks = {
    onroll(code, modifier) {
      if (!started || loadError) return;
      queueCreatureRoll(history, code, modifier);
      showEncounterPane();
    },
    onfight(name) {
      if (!started || loadError) return;
      if (findCreature(tables, name)) startOrJoin(history, tables, [name], randomId, () => null);
      else fightRequest = { names: [name], seq: ++fightSeq };
      showEncounterPane();
    },
    onopentable(code, modifier) {
      showTable(code, modifier);
    },
  };

  function closeEncounterPane() {
    encounterPaneOpen = false;
    if (!heroShown && !tablesShown) sidebar = 'steps';
  }

  /** The toolbar's Tables button: show the pane, bring it to the front, or put it away. Works with no table file. */
  function onTablesButton() {
    if (!started || loadError) return;
    sideBeforeFlow = false;
    if (tablesShown && activeTab === 'tables') {
      closeTablesPane();
      return;
    }
    tablesOn = true;
    sideTab = 'tables';
    sidebar = 'side';
  }

  function closeTablesPane() {
    tablesOn = false;
    if (!heroShown && !encShown) sidebar = 'steps';
  }

  /** Open a reference table in the Tables pane with a modifier (an encounter text or treasure button). An open fight is untouched. */
  function showTable(code: string, modifier = 0) {
    if (!started || loadError) return;
    const t = findTable(tables, code);
    if (t) tablesState = openTable(tablesState, t.code, modifier);
    sideBeforeFlow = false;
    tablesOn = true;
    sideTab = 'tables';
    sidebar = 'side';
  }


  /** Confirmed, one-way: keep this level's map, rest the hero, start the next level's map. */
  function goDown(opts: { eat: boolean; bandage: boolean }) {
    (document.activeElement as HTMLElement | null)?.blur?.(); // commit a half-typed field first
    stairsOpen = false;
    if (history.encounter !== null) return; // finish or end the fight first
    const old = history.map;
    if (old.level >= 10) return;
    const hero = history.hero as Hero | null;
    const rested = hero ? restOnStairs(hero, opts) : null;
    const fresh = createMap(dungeonSystem, { level: old.level + 1, width: old.width, height: old.height, title: old.title, hero: old.hero });
    flow.cancel();
    meta = { ...meta, earlierLevels: [...meta.earlierLevels, old] };
    earlier = meta.earlierLevels;
    selection = null;
    gapMode = false;
    notice = null;
    history.reset(fresh, rested, null);
    void saver.flush();
  }

  function loadDemo() {
    const c = createCampaign(dungeonSystem, 'Demo dungeon');
    replaceGame(metaFrom(c), demoMap());
  }

  function downloadTemplate() {
    // Built synchronously so shareOrDownload runs inside the click's user gesture.
    const text = JSON.stringify(blankTableFile(), null, 2);
    shareOrDownload(new File([text], TEMPLATE_FILE_NAME, { type: 'application/json' }));
  }

  function exportGame() {
    // Build the File synchronously so shareOrDownload runs inside the click's user gesture.
    const { name, text } = exportCampaignFile(campaignFrom(meta, history.map, history.hero, history.encounter));
    shareOrDownload(new File([text], name, { type: 'application/json' }));
  }

  function exportDamaged() {
    if (loadError?.kind !== 'damaged') return;
    try {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // local day, like exportFileName
      shareOrDownload(new File([JSON.stringify(loadError.raw)], `2d6-damaged-save-${day}.json`, { type: 'application/json' }));
    } catch (err) {
      importError = `The damaged save couldn't be exported: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  function pickImport() {
    importError = null;
    fileInput?.click();
  }

  async function onFileChosen() {
    const file = fileInput?.files?.[0];
    if (fileInput) fileInput.value = ''; // so the same file can be picked again
    if (!file) return;
    let text: string;
    try {
      text = await file.text();
    } catch {
      importError = "That file couldn't be read.";
      return;
    }
    const res = readImportText(text, file.size, dungeonSystem.heroProblem, dungeonSystem.encounterProblem);
    if (!res.ok) {
      importError = res.error;
      return;
    }
    const campaign = res.campaign;
    const map = activeMap(campaign);
    const run = () => replaceGame(metaFrom(campaign), map, campaign.hero, campaign.encounter);
    // From the load-error dialog there's no current game to lose, but the stored record is overwritten.
    if (loadError) askOverwriteSaved(run);
    else askReplace('Import game', run);
  }

  /** Pointer over the map (or dragging it, at the position step): the ghost follows. Nothing else reacts. */
  function onHover(world: Point) {
    if (modalOpen || step.kind !== 'position') return;
    flow.slideTo({ x: Math.floor(world.x), y: Math.floor(world.y) });
  }

  function onTap(p: Pick, world: Point) {
    const renderer = mapView?.getRenderer();
    // A tap during the token's walk only stops the animation; the model is already final.
    if (renderer?.walking) {
      renderer.cancelWalk();
      return;
    }
    if (modalOpen) return;
    notice = null;
    if (tool !== 'play') return editorTap(tool, p, world);
    const action = routePlayTap(flow.step, history.map, p, world, { gapMode, allowedExits: flow.allowedExits });
    switch (action.kind) {
      case 'startEntrance':
        return flow.startEntrance(action.cell); // the flow explains an invalid square
      case 'startExit':
        return flow.startFromExit(action.doorId);
      case 'startGap':
        return flow.startGap(action.doorId);
      case 'select':
        selection = action.selection;
        // A room opens in the Room tab beside the side panes; anything else takes the sidebar.
        if (sidebar === 'side' && action.selection.kind === 'room') sideTab = 'room';
        else sidebar = 'steps';
        return;
      case 'slideAndPlace':
        flow.slideTo(action.cell);
        if (flow.step.kind === 'position' && flow.step.placement.ok) flow.place();
        return;
      case 'toggleExit':
        return flow.toggleExit(action.edge);
      case 'hint':
        selection = null;
        notice = action.text;
        sidebar = 'steps';
        return;
      case 'ignore':
        return; // taps that don't belong to the step are ignored
    }
  }

  function editorTap(t: Exclude<Tool, 'play'>, p: Pick, world: Point) {
    const action = routeEditorTap(t, history.map, p, world);
    switch (action.kind) {
      case 'select':
        selection = action.selection;
        if (selection) sidebar = 'steps';
        return;
      case 'addStairs': {
        const f = { id: randomId(), kind: 'stairs' as const, x: action.cell.x, y: action.cell.y, dir: 'down' as const };
        selection = exec(addFeature(f)) ? { kind: 'feature', featureId: f.id } : null;
        sidebar = 'steps';
        return;
      }
      case 'hint':
        selection = null;
        notice = action.text;
        sidebar = 'steps';
        return;
    }
  }

  /** The token can be dragged: Play, no room being placed, not in gap mode, nothing modal, a token on the map. */
  const dragsToken = $derived(tool === 'play' && step.kind === 'idle' && !gapMode && !modalOpen && $view.map.token !== null);

  /** The token was dropped: a square the walk accepts walks there; anywhere else nothing changes. */
  function onTokenDrop(world: Point) {
    tokenDragAt = null;
    if (!dragsToken) return;
    const target = dropTarget(history.map, { x: Math.floor(world.x), y: Math.floor(world.y) });
    if (!target) return;
    const renderer = mapView?.getRenderer();
    if (renderer?.walking) renderer.cancelWalk(); // the model already holds the last walk's result
    notice = null;
    walkTo(target);
  }

  /** Runs an editor tool's command through History; a rejection's reason goes in the panel. */
  function exec(cmd: Command | null): boolean {
    notice = null;
    if (!cmd) {
      notice = "That change can't be made here";
      return false;
    }
    // Dev guard: a Svelte proxy in a command would only fail later, at save time.
    if (import.meta.env?.DEV) structuredClone(cmd.apply(history.map));
    const res = history.execute(cmd);
    if (!res.ok) notice = res.reason;
    return res.ok;
  }

  function walkTo(cell: Cell) {
    const map = history.map;
    if (!map.token) {
      notice = 'There is no token on the map';
      return;
    }
    const path = findPath(map, map.token, cell);
    if (!path) {
      notice = "The token can't get there";
      return;
    }
    const cmd = moveToken(map, path);
    if (!cmd) return; // already there
    const res = history.execute(cmd);
    if (res.ok) animate(path);
    else notice = res.reason;
  }

  /** Animate the token along a path it has already been moved along (the model holds the result). */
  function animate(path: Cell[]) {
    const renderer = mapView?.getRenderer();
    if (!renderer || path.length < 2) return;
    renderer.setMap(history.map); // first, so the map-change effect doesn't cancel the walk
    renderer.walkToken(path, () => {});
  }

  /** Runs a committing PlayFlow call (finish / doneExits / placeGap), then animates the token's walk. */
  function commit(run: () => ExecResult | null) {
    const before = flow.step;
    const roomId = before.kind === 'exits' || before.kind === 'label' ? before.draft.room.id : null;
    const res = run();
    if (!res) return; // moved on to the next step, nothing committed
    if (!res.ok) {
      // The flow shows a shortfall on its step; anything else goes in the notice line.
      const shown = 'error' in flow.step && flow.step.error === res.reason;
      if (!shown) notice = res.reason;
      return;
    }
    // Consumed only here, right after the commit: lastWalk stays set until the next change.
    const walk = flow.lastWalk;
    if (walk) animate(walk);
    else if (roomId) {
      const map = history.map;
      const room = map.rooms.find((r) => r.id === roomId);
      if (room && map.token && !rectContains(room, map.token)) notice = "The token couldn't get to the new room, so it stays where it is";
    }
  }

  function onKey(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable]')) return;
    if (modalOpen) return;
    const key = e.key.toLowerCase();
    if (!(e.ctrlKey || e.metaKey) || (key !== 'z' && key !== 'y')) return;
    e.preventDefault();
    if (key === 'y' || e.shiftKey) history.redo();
    else history.undo();
  }
</script>

<svelte:window onkeydown={onKey} />

<!-- Under Game Over or the death question, nothing behind them can be focused or used (keyboard included).
     The wizard and dialogs are siblings of the shell, so they stay usable. -->
<div class="shell" class:collapsed={panelCollapsed && !sideShown} class:wide={sideShown} inert={gameOver !== null || askingDeath}>
  <div class="top">
    <Toolbar
      view={$view}
      {tool}
      coverage={cover}
      {menuOpen}
      heroOpen={heroShown}
      encounterOpen={encShown}
      tablesOpen={tablesShown && activeTab === 'tables'}
      disabled={!started || !!loadError || gameOver !== null}
      placing={step.kind !== 'idle'}
      ontool={selectTool}
      onundo={() => !modalOpen && history.undo()}
      onredo={() => !modalOpen && history.redo()}
      onmenu={() => started && !loadError && (menuOpen = !menuOpen)}
      onhero={onHeroButton}
      onencounter={onEncounterButton}
      ontables={onTablesButton}
      {diceOpen}
      ondice={onDiceButton}
    />
    {#if toast}<p class="toast" role="status">{toast}</p>{/if}
    <UpdatePrompt />
    {#if saveFailing}<SaveBanner onexport={exportGame} />{/if}
    {#if showHint && started && !loadError}
      <InstallHint ios={iosTab} hasGame={hasContent($view.map) || $view.hero !== null} onexport={exportGame} ondismiss={dismissHint} />
    {/if}
    {#if menuOpen}
      <Menu
        bind:toggles
        onclose={() => (menuOpen = false)}
        onnewmap={() => {
          wizardMode = 'new-game';
          newMapOpen = true;
        }}
        ondemo={() => askReplace('Load demo map', loadDemo)}
        onfit={() => mapView?.fit()}
        onexport={exportGame}
        onimport={pickImport}
        tablesName={tables?.name ?? null}
        cardsName={cards ? `${cards.name} (${cards.cards.length} ${cards.cards.length === 1 ? "card" : "cards"})` : null}
        onloadtables={() => pickExtra(tablesInput)}
        ontemplate={downloadTemplate}
        onloadcards={() => pickExtra(cardsInput)}
        onremovetables={() => void removeTables()}
        onremovecards={() => void removeCards()}
        earlier={earlier.map((m) => ({ level: m.level, label: levelLabel(tables, m.level) }))}
        onearlier={(i) => (viewing = earlier[i] ?? null)}
      />
    {/if}
  </div>
  <MapView bind:this={mapView} map={shownMap} {toggles} ontap={onTap}
    onhover={onHover}
    {dragsToken}
    ontokendrag={(w) => (tokenDragAt = dragsToken ? w : null)}
    ontokendrop={onTokenDrop}
    dragsGhost={step.kind === 'position'}
    ghost={step.kind === 'position' ? step.placement.rect : null}
  />
  {#if diceOpen && started && !loadError && gameOver === null}
    <DicePanel
      dice={diceKind}
      request={diceRequest}
      onchoose={(d) => (diceKind = d)}
      onrequesttaken={() => (diceRequest = null)}
      onclose={() => (diceOpen = false)}
    />
  {/if}
  {#snippet stepPanel(collapsed: boolean)}
    <StepPanel
      {tool}
      map={$view.map}
      {flow}
      {step}
      {notice}
      {gapMode}
      ongapmode={(on) => {
        gapMode = on;
        notice = null;
      }}
      oncommit={commit}
      {tables}
      levelText={levelLabel(tables, $view.map.level)}
      ongodown={() => {
        if (history.encounter === null) stairsOpen = true;
      }}
      {fighting}
      selection={liveSelection}
      onexec={exec}
      onselect={(sel) => (selection = sel)}
      {collapsed}
      ontoggle={() => (panelCollapsed = !panelCollapsed)}
      encounter={encounterHooks}
    />
  {/snippet}
  {#if sideShown}
    <div class="side">
      {#if tabs.length > 1}
        <div class="tabs" role="tablist" aria-label="Sidebar">
          {#if roomTab}
            <button role="tab" id="side-tab-room" aria-selected={activeTab === 'room'} onclick={() => (sideTab = 'room')}>Room</button>
          {/if}
          {#if encShown}
            <button role="tab" id="side-tab-encounter" aria-selected={activeTab === 'encounter'} onclick={() => (sideTab = 'encounter')}>Encounter</button>
          {/if}
          {#if heroShown}
            <button role="tab" id="side-tab-hero" aria-selected={activeTab === 'hero'} onclick={() => (sideTab = 'hero')}>Hero</button>
          {/if}
          {#if tablesShown}
            <button role="tab" id="side-tab-tables" aria-selected={activeTab === 'tables'} onclick={() => (sideTab = 'tables')}>Tables</button>
          {/if}
        </div>
      {/if}
      {#if activeTab === 'room'}
        {@render stepPanel(false)}
      {:else if activeTab === 'hero'}
        <HeroPanel
          hero={$view.hero as Hero}
          {history}
          {tables}
          onclose={() => {
            heroOn = false;
            if (!encShown && !tablesShown) sidebar = 'steps';
          }}
        />
      {:else if activeTab === 'tables'}
        <TablesPane {tables} state={tablesState} onstate={(st) => (tablesState = st)} onclose={closeTablesPane} />
      {:else}
        <EncounterPane
          {history}
          encounter={$view.encounter as Encounter | null}
          hero={$view.hero as Hero | null}
          {tables}
          {cards}
          {cardsUnreadable}
          onclose={closeEncounterPane}
          request={fightRequest}
          onrequesttaken={() => (fightRequest = null)}
          {win}
          onwin={(w) => (win = w)}
          holdWin={askingDeath || gameOver !== null}
          onopentable={showTable}
          dungeonLevel={$view.map.level}
        />
      {/if}
    </div>
  {:else}
    {@render stepPanel(panelCollapsed)}
  {/if}
</div>

<input bind:this={fileInput} type="file" accept=".json,application/json" hidden onchange={onFileChosen} />
<input bind:this={tablesInput} type="file" accept=".json,application/json" hidden data-extra="tables" onchange={onTablesChosen} />
<input bind:this={cardsInput} type="file" accept=".json,application/json" hidden data-extra="cards" onchange={onCardsChosen} />

{#if gameOver && !newMapOpen}
  <GameOver over={gameOver} onexport={exportGame} onnew={newGameFromGameOver} />
{/if}

{#if askingDeath && $view.hero}
  <DeathDialog
    heroName={($view.hero as Hero).name}
    onconfirm={confirmDeath}
    oncancel={() => (deathDismissed = $view.hero as Hero)}
  />
{/if}

{#if newMapOpen}
  <HeroWizard
    {tables}
    mode={wizardMode}
    onbegin={wizardMode === 'new-game' ? beginNewGame : beginAddHero}
    oncancel={() => !pendingReplace && (newMapOpen = false)}
    onloadtables={() => pickExtra(tablesInput)}
  />
{/if}

{#if loadError}
  <LoadErrorDialog
    kind={loadError.kind}
    error={loadError.error}
    {importError}
    onexport={exportDamaged}
    onretry={() => void startUp()}
    onimport={pickImport}
    onnew={() =>
      askOverwriteSaved(() => {
        const c = createCampaign(dungeonSystem, 'My dungeon', { width: 25, height: 25 });
        replaceGame(metaFrom(c), activeMap(c));
      })}
  />
{:else if importError}
  <div class="scrim">
    <div class="confirm" role="alertdialog" aria-modal="true" aria-labelledby="import-error-title">
      <h2 id="import-error-title">Can't import that file</h2>
      <p>{importError}</p>
      <div class="actions">
        <button class="primary" onclick={() => (importError = null)}>OK</button>
      </div>
    </div>
  </div>
{/if}

{#if !started}
  <div class="scrim">
    <p class="loading" role="status">Loading your game…</p>
  </div>
{/if}

{#if stairsOpen}
  <StairsDialog hero={$view.hero as Hero | null} nextLevel={$view.map.level + 1} onconfirm={goDown} oncancel={() => (stairsOpen = false)} />
{/if}

{#if viewing}
  <LevelViewer map={viewing} title={levelLabel(tables, viewing.level)} onclose={() => (viewing = null)} />
{/if}

{#if pendingReplace}
  <ReplaceGameDialog
    title={pendingReplace.title}
    message={pendingReplace.message}
    onexport={pendingReplace.onexport ?? (pendingReplace.message ? undefined : exportGame)}
    onreplace={() => {
      const run = pendingReplace?.run;
      pendingReplace = null;
      run?.();
    }}
    oncancel={() => (pendingReplace = null)}
  />
{/if}

<style>
  :global(:root) {
    --ink: #1f1a14;
    --paper: #f7f2e7;
    --paper-dim: #ece4d2;
    --rule: #c9bda4;
    --muted: #8a7f6d;
    --accent: #2f6fb3;
    --danger: #a3221b;
  }
  :global(html, body) {
    margin: 0;
    height: 100%;
    overflow: hidden;
    overscroll-behavior: none;
    background: var(--paper);
    color: var(--ink);
    font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
    -webkit-tap-highlight-color: transparent;
  }
  .shell {
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) clamp(280px, 30%, 440px);
    grid-template-rows: auto minmax(0, 1fr);
    grid-template-areas:
      'top top'
      'map panel';
  }
  .shell.wide {
    grid-template-columns: minmax(0, 1fr) clamp(420px, 48%, 640px);
  }
  .shell.collapsed {
    grid-template-columns: minmax(0, 1fr) 48px;
  }
  .top {
    grid-area: top;
    position: relative;
    z-index: 5;
  }
  .shell > :global(.map-view) {
    grid-area: map;
  }
  .shell > :global(.panel),
  .shell > .side {
    grid-area: panel;
  }
  .side {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: var(--paper);
  }
  .side > :global(aside) {
    flex: 1;
  }
  .toast {
    position: absolute;
    top: 100%;
    right: 10px;
    margin: 6px 0 0;
    max-width: min(420px, 90vw);
    padding: 10px 14px;
    font-size: 16px;
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 6px;
  }
  .tabs {
    display: flex;
    border-left: 2px solid var(--ink);
    border-bottom: 2px solid var(--ink);
  }
  .tabs button {
    flex: 1;
    min-height: 48px;
    font: inherit;
    font-size: 17px;
    color: var(--ink);
    background: var(--paper-dim);
    border: 0;
    cursor: pointer;
    touch-action: manipulation;
  }
  .tabs button[aria-selected='true'] {
    color: var(--paper);
    background: var(--ink);
    font-weight: 600;
  }
  @media (max-width: 699.98px) {
    .shell,
    .shell.wide,
    .shell.collapsed {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto minmax(0, 1fr) auto;
      grid-template-areas:
        'top'
        'map'
        'panel';
    }
    .shell > :global(.panel) {
      max-height: 40dvh;
    }
    .shell > .side {
      max-height: 60dvh;
    }
  }

  .scrim {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgba(20, 16, 10, 0.45);
  }
  .loading {
    margin: 0;
    padding: 16px 24px;
    font-size: 20px;
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 8px;
  }
  .confirm {
    width: min(460px, 100%);
    padding: 20px 22px;
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 8px;
  }
  .confirm h2 {
    margin: 0 0 10px;
    font-size: 24px;
  }
  .confirm p {
    margin: 0 0 16px;
    font-size: 19px;
    line-height: 1.4;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }
  .actions button {
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
  .actions button.primary {
    color: var(--paper);
    background: var(--ink);
  }
</style>
