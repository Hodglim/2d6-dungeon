<script lang="ts">
  import { onMount } from 'svelte';
  import { demoMap } from '../app/demo';
  import { createCampaign } from '../core/campaign';
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
  import { cardsKind, chooseFile, loadStored, removeFile, tablesKind } from '../persistence/extras';
  import { exportCampaignFile, readImportText } from '../persistence/files';
  import { campaignFrom, metaFrom, type CampaignMeta } from '../persistence/record';
  import { shareOrDownload } from '../persistence/share';
  import { isIosSafari, isStandalone, readDisplayEnv } from '../persistence/standalone';
  import { decideStartup, loadWithTimeout } from '../persistence/startup';
  import { IdbSaveStore } from '../persistence/store';
  import type { Point } from '../render/camera';
  import type { Pick } from '../render/hit';
  import { DEFAULT_TOGGLES, type DisplayToggles } from '../render/renderer';
  import { dungeonSystem } from '../systems/dungeon';
  import type { CardPack } from '../systems/dungeon/cards';
  import type { Hero } from '../systems/dungeon/hero';
  import type { DungeonTables } from '../systems/dungeon/tables';
  import { classicTheme } from '../systems/dungeon/classic';
  import { drawOverlay, overlayFor, selectionOverlay } from './overlay';
  import { historyStore, type Tool } from './historyStore';
  import UpdatePrompt from './UpdatePrompt.svelte';
  import MapView from './MapView.svelte';
  import InstallHint from './InstallHint.svelte';
  import LoadErrorDialog from './LoadErrorDialog.svelte';
  import Menu from './Menu.svelte';
  import HeroWizard from './wizard/HeroWizard.svelte';
  import ReplaceGameDialog from './ReplaceGameDialog.svelte';
  import SaveBanner from './SaveBanner.svelte';
  import HeroPanel from './hero/HeroPanel.svelte';
  import StepPanel from './StepPanel.svelte';
  import { resolveSelection, routeEditorTap, routePlayTap, type Selection } from './tapRouting';
  import Toolbar from './Toolbar.svelte';

  function activeMap(c: Campaign): DungeonMap {
    const m = c.maps.find((x) => x.id === c.activeMapId) ?? c.maps[0];
    if (!m) throw new Error('Campaign has no map');
    return m;
  }

  const firstGame = createCampaign(dungeonSystem, 'My dungeon', { width: 25, height: 25 });
  const history = new History(activeMap(firstGame));
  /** Everything about the game except its map (which is the history's current). Replaced with the game. */
  let meta: CampaignMeta = metaFrom(firstGame);
  const store = new IdbSaveStore();
  const saver = new Autosaver(history, store, () => meta);
  const view = historyStore(history);
  // Real dice and ids for the app. Its History listener cancels a draft on any Undo/Redo.
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
  let importError = $state<string | null>(null);
  let fileInput: HTMLInputElement | undefined;
  let tablesInput: HTMLInputElement | undefined;
  let cardsInput: HTMLInputElement | undefined;
  /** The player's table file and creature card pack: stored apart from the game, never exported. */
  let tables = $state.raw<DungeonTables | null>(null);
  let cards = $state.raw<CardPack | null>(null);
  let panelCollapsed = $state(false);
  /** Which panel fills the right-hand sidebar (Task 8 adds 'encounter'). */
  let sidebar = $state<'steps' | 'hero'>('steps');
  const heroShown = $derived(sidebar === 'hero' && $view.hero !== null);
  let mapView = $state<ReturnType<typeof MapView>>();
  let step = $state.raw<Step>(flow.step);
  /** One-line panel message: a tap hint, or what happened on the last commit. */
  let notice = $state<string | null>(null);
  /** The next exit tap starts a gap corridor instead of a room. */
  let gapMode = $state(false);
  /** What the Door, Stairs, Note or Select tool has picked for the panel to edit. */
  let selection = $state.raw<Selection | null>(null);
  /** The selection against the committed map: gone after an Undo that removed its target. */
  const liveSelection = $derived(resolveSelection($view.map, selection));

  flow.subscribe((s) => {
    step = s;
    notice = null;
    if (s.kind !== 'idle') {
      gapMode = false;
      panelCollapsed = false; // the steps live in the panel
      sidebar = 'steps';
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

  /** A modal (menu, dialogs, start-up) is open: map taps and shortcuts are off. */
  const modalOpen = $derived(!started || !!loadError || menuOpen || newMapOpen || !!pendingReplace || !!importError);

  // The overlay follows the step (and the map, for idle highlights). draftMap isn't reactive,
  // but it only changes together with the step or the committed map.
  $effect(() => {
    const renderer = mapView?.getRenderer();
    if (!renderer) return;
    void $view.map; // re-run on every committed change (idle exit highlights)
    const shapes = tool === 'play' ? overlayFor(step, flow.draftMap) : selectionOverlay($view.map, liveSelection);
    renderer.setOverlay(shapes.length ? (ctx) => drawOverlay(ctx, shapes, classicTheme) : null);
  });

  function selectTool(t: Tool) {
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
  const hasWork = $derived(hasContent($view.map) || $view.canUndo || $view.hero !== null);

  function hasContent(m: DungeonMap): boolean {
    return m.rooms.length > 0 || m.doors.length > 0 || m.features.length > 0 || m.token !== null;
  }

  onMount(() => {
    let alive = true;
    const unsubscribe = saver.subscribe((s) => (saveFailing = s.failing));
    const onHide = () => {
      if (document.visibilityState === 'hidden') void saver.flush();
    };
    const onPageHide = () => void saver.flush();
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
      decision = decideStartup(out.raw, dungeonSystem.heroProblem);
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
    if (decision.kind === 'restore') meta = decision.meta;
    saver.start();
    saver.resume();
    started = true;
    void loadExtras(isAlive);
  }

  /** Set once the user has chosen or removed a file, so a slower start-up load can't overwrite it. */
  let tablesTouched = false;
  let cardsTouched = false;

  /** Loads the stored table file and card pack. Any failure means carrying on without them. */
  async function loadExtras(isAlive: () => boolean) {
    const t = await loadStored(store, tablesKind);
    if (isAlive() && !tablesTouched && t) tables = t;
    const c = await loadStored(store, cardsKind);
    if (isAlive() && !cardsTouched && c) cards = c;
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
  function replaceGame(next: CampaignMeta, map: DungeonMap, hero: unknown | null = null) {
    meta = next;
    selection = null;
    gapMode = false;
    notice = null;
    loadError = null;
    importError = null;
    saver.start();
    saver.resume();
    history.reset(map, hero);
    void saver.flush();
  }

  /** Confirm first if the current game has anything in it, then run. */
  function askReplace(title: string, run: () => void) {
    if (hasWork) pendingReplace = { title, run };
    else run();
  }

  /** The wizard finished: confirm the replacement first, as New game always has. */
  function beginNewGame(v: { width: number; height: number; title: string; hero: Hero | null }) {
    // The wizard stays open until the replacement is accepted, so cancelling keeps the draft.
    askReplace('New game', () => {
      newMapOpen = false;
      const c = createCampaign(dungeonSystem, v.title || 'My dungeon', { width: v.width, height: v.height, title: v.title });
      replaceGame(metaFrom(c), activeMap(c), v.hero);
    });
  }

  /** Add a hero to the current game (opened from the Hero button when there is none). */
  function beginAddHero(v: { hero: Hero | null }) {
    newMapOpen = false;
    if (v.hero) {
      history.execute(setHero(v.hero, 'Create hero'));
      sidebar = 'hero';
    }
  }

  /** The toolbar's Hero button: create one, or show or hide the sheet. */
  function onHeroButton() {
    if (!started || loadError) return;
    if ($view.hero === null) {
      wizardMode = 'add-hero';
      newMapOpen = true;
    } else {
      sidebar = heroShown ? 'steps' : 'hero';
    }
  }

  function loadDemo() {
    const c = createCampaign(dungeonSystem, 'Demo dungeon');
    replaceGame(metaFrom(c), demoMap());
  }

  function exportGame() {
    // Build the File synchronously so shareOrDownload runs inside the click's user gesture.
    const { name, text } = exportCampaignFile(campaignFrom(meta, history.map, history.hero));
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
    const res = readImportText(text, file.size, dungeonSystem.heroProblem);
    if (!res.ok) {
      importError = res.error;
      return;
    }
    const campaign = res.campaign;
    const map = activeMap(campaign);
    const run = () => replaceGame(metaFrom(campaign), map, campaign.hero);
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
      case 'walk':
        return walkTo(action.cell);
      case 'slideAndPlace':
        flow.slideTo(action.cell);
        if (flow.step.kind === 'position' && flow.step.placement.ok) flow.place();
        return;
      case 'toggleExit':
        return flow.toggleExit(action.edge);
      case 'hint':
        notice = action.text;
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
        return;
      case 'addStairs': {
        const f = { id: randomId(), kind: 'stairs' as const, x: action.cell.x, y: action.cell.y, dir: 'down' as const };
        selection = exec(addFeature(f)) ? { kind: 'feature', featureId: f.id } : null;
        return;
      }
      case 'hint':
        selection = null;
        notice = action.text;
        return;
    }
  }

  /** Runs an editor tool's command through History; a rejection's reason goes in the panel. */
  function exec(cmd: Command | null): boolean {
    notice = null;
    if (!cmd) {
      notice = "That change can't be made here";
      return false;
    }
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

<div class="shell" class:collapsed={panelCollapsed && !heroShown} class:wide={heroShown}>
  <div class="top">
    <Toolbar
      view={$view}
      {tool}
      coverage={cover}
      {menuOpen}
      heroOpen={heroShown}
      disabled={!started || !!loadError}
      ontool={selectTool}
      onundo={() => history.undo()}
      onredo={() => history.redo()}
      onmenu={() => started && !loadError && (menuOpen = !menuOpen)}
      onhero={onHeroButton}
    />
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
        onloadcards={() => pickExtra(cardsInput)}
        onremovetables={() => void removeTables()}
        onremovecards={() => void removeCards()}
      />
    {/if}
  </div>
  <MapView bind:this={mapView} map={shownMap} {toggles} ontap={onTap}
    onhover={onHover}
    dragsGhost={step.kind === 'position'}
    ghost={step.kind === 'position' ? step.placement.rect : null}
  />
  {#if heroShown}
    <HeroPanel hero={$view.hero as Hero} {history} {tables} onclose={() => (sidebar = 'steps')} />
  {:else}
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
    selection={liveSelection}
    onexec={exec}
    onselect={(sel) => (selection = sel)}
    collapsed={panelCollapsed}
    ontoggle={() => (panelCollapsed = !panelCollapsed)}
  />
  {/if}
</div>

<input bind:this={fileInput} type="file" accept=".json,application/json" hidden onchange={onFileChosen} />
<input bind:this={tablesInput} type="file" accept=".json,application/json" hidden data-extra="tables" onchange={onTablesChosen} />
<input bind:this={cardsInput} type="file" accept=".json,application/json" hidden data-extra="cards" onchange={onCardsChosen} />

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
  .shell > :global(.hero-panel) {
    grid-area: panel;
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
    .shell > :global(.hero-panel) {
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
