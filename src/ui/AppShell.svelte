<script lang="ts">
  import { demoMap } from '../app/demo';
  import { createMap } from '../core/campaign';
  import { addFeature, type Command } from '../core/commands';
  import { rectContains } from '../core/geometry';
  import { type ExecResult, History } from '../core/history';
  import { randomId } from '../core/ids';
  import { findPath } from '../core/pathfinding';
  import { coverage } from '../core/query';
  import { moveToken } from '../core/token';
  import type { Cell, DungeonMap } from '../core/types';
  import { PlayFlow, type Step } from '../interaction/playflow';
  import type { Point } from '../render/camera';
  import type { Pick } from '../render/hit';
  import { DEFAULT_TOGGLES, type DisplayToggles } from '../render/renderer';
  import { dungeonSystem } from '../systems/dungeon';
  import { classicTheme } from '../systems/dungeon/classic';
  import { drawOverlay, overlayFor, selectionOverlay } from './overlay';
  import { historyStore, type Tool } from './historyStore';
  import MapView from './MapView.svelte';
  import Menu from './Menu.svelte';
  import NewMapDialog, { type NewMapValues } from './NewMapDialog.svelte';
  import StepPanel from './StepPanel.svelte';
  import { resolveSelection, routeEditorTap, routePlayTap, type Selection } from './tapRouting';
  import Toolbar from './Toolbar.svelte';

  const history = new History(createMap(dungeonSystem, { width: 25, height: 25 }));
  const view = historyStore(history);
  // Real dice and ids for the app. Its History listener cancels a draft on any Undo/Redo.
  const flow = new PlayFlow(history, Math.random, randomId);

  let tool = $state<Tool>('play');
  let toggles = $state<DisplayToggles>({ ...DEFAULT_TOGGLES });
  let menuOpen = $state(false);
  let newMapOpen = $state(false);
  let confirmDemo = $state(false);
  let panelCollapsed = $state(false);
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

  /** A modal (menu, New map dialog, demo confirm) is open: map taps and shortcuts are off. */
  const modalOpen = $derived(menuOpen || newMapOpen || confirmDemo);

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
  const hasWork = $derived(hasContent($view.map) || $view.canUndo);

  function hasContent(m: DungeonMap): boolean {
    return m.rooms.length > 0 || m.doors.length > 0 || m.features.length > 0 || m.token !== null;
  }

  function createNewMap(v: NewMapValues) {
    newMapOpen = false;
    history.reset(createMap(dungeonSystem, { width: v.width, height: v.height, level: v.level, title: v.title }));
  }

  function loadDemo() {
    confirmDemo = false;
    history.reset(demoMap());
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

<div class="shell" class:collapsed={panelCollapsed}>
  <div class="top">
    <Toolbar
      view={$view}
      {tool}
      coverage={cover}
      {menuOpen}
      ontool={selectTool}
      onundo={() => history.undo()}
      onredo={() => history.redo()}
      onmenu={() => (menuOpen = !menuOpen)}
    />
    {#if menuOpen}
      <Menu
        bind:toggles
        onclose={() => (menuOpen = false)}
        onnewmap={() => (newMapOpen = true)}
        ondemo={() => (hasWork ? (confirmDemo = true) : loadDemo())}
        onfit={() => mapView?.fit()}
      />
    {/if}
  </div>
  <MapView bind:this={mapView} map={shownMap} {toggles} ontap={onTap}
    onhover={onHover}
    dragsGhost={step.kind === 'position'}
    ghost={step.kind === 'position' ? step.placement.rect : null}
  />
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
</div>

{#if newMapOpen}
  <NewMapDialog confirmDiscard={hasWork} oncreate={createNewMap} oncancel={() => (newMapOpen = false)} />
{/if}

{#if confirmDemo}
  <div class="scrim">
    <div class="confirm" role="alertdialog" aria-modal="true" aria-labelledby="demo-title">
      <h2 id="demo-title">Load demo map</h2>
      <p>This replaces the current map — there's no saving yet</p>
      <div class="actions">
        <button onclick={() => (confirmDemo = false)}>Cancel</button>
        <button class="primary" onclick={loadDemo}>Replace map</button>
      </div>
    </div>
  </div>
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
  .shell > :global(.panel) {
    grid-area: panel;
  }
  @media (max-width: 699.98px) {
    .shell,
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
