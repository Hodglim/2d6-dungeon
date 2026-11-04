<script lang="ts">
  import type { Command } from '../core/commands';
  import type { ExecResult } from '../core/history';
  import { coverage, openExits } from '../core/query';
  import type { DungeonMap } from '../core/types';
  import type { PlayFlow, Step } from '../interaction/playflow';
  import type { DungeonTables } from '../systems/dungeon/tables';
  import type { EncounterHooks } from './encounter/encounterActions';
  import type { Tool } from './historyStore';
  import ExitCountStep from './steps/ExitCountStep.svelte';
  import ExitsStep from './steps/ExitsStep.svelte';
  import ExitTypeStep from './steps/ExitTypeStep.svelte';
  import GapStep from './steps/GapStep.svelte';
  import LabelStep from './steps/LabelStep.svelte';
  import PositionStep from './steps/PositionStep.svelte';
  import SizeStep from './steps/SizeStep.svelte';
  import type { Selection } from './tapRouting';
  import DoorEditor from './tools/DoorEditor.svelte';
  import NoteEditor from './tools/NoteEditor.svelte';
  import RoomInspector from './tools/RoomInspector.svelte';
  import StairsEditor from './tools/StairsEditor.svelte';

  interface Props {
    tool: Tool;
    map: DungeonMap;
    flow: PlayFlow;
    step: Step;
    /** One-line message from the shell (a tap hint, or the result of the last commit). */
    notice: string | null;
    /** The next exit tap starts a gap corridor rather than a room. */
    gapMode: boolean;
    ongapmode: (on: boolean) => void;
    oncommit: (run: () => ExecResult | null) => void;
    /** What an editor tool (Door, Stairs, Note) or a Play tap has selected, resolved against `map`. */
    selection: Selection | null;
    /** Runs an editor's command through History; false (reason in the notice) when rejected. */
    onexec: (cmd: Command | null) => boolean;
    onselect: (s: Selection | null) => void;
    /** The loaded table file, for rolling a room later from the inspector. */
    tables?: DungeonTables | null;
    /** "Level N · Name", shown at the top of the panel. */
    levelText?: string;
    /** Opens the stairs dialog; the Go down button shows only while this is given. */
    ongodown?: () => void;
    /** A fight is open: Go down waits until it is finished or ended. */
    fighting?: boolean;
    collapsed: boolean;
    ontoggle: () => void;
    /** Roll and Fight buttons in a room's encounter text. */
    encounter?: EncounterHooks | null;
  }

  let { tool, map, flow, step, notice, gapMode, ongapmode, oncommit, selection, onexec, onselect, tables = null, levelText = '', ongodown, fighting = false, collapsed, ontoggle, encounter = null }: Props = $props();

  /** Remounts an editor (fresh drafts) when a different thing is selected. */
  function selectionKey(s: Selection): string {
    switch (s.kind) {
      case 'door':
        return `door:${s.doorId}`;
      case 'wall':
        return `wall:${s.edge.x},${s.edge.y},${s.edge.side}`;
      case 'feature':
        return `feature:${s.featureId}`;
      case 'newNote':
        return `newNote:${s.cell.x},${s.cell.y}`;
      case 'room':
        return `room:${s.roomId}`;
    }
  }

  const titles: Record<Tool, string> = {
    play: 'Play',
    door: 'Door',
    stairs: 'Stairs',
    note: 'Note',
  };

  function hintFor(t: Tool, m: DungeonMap): string {
    switch (t) {
      case 'play':
        if (m.rooms.length === 0) return 'Tap a square on the bottom edge to place the entrance';
        if (gapMode) return 'Tap the exit the corridor starts from';
        return 'Tap an open exit to start a room, drag the token to move it, or tap a room or note to see it';
      case 'door':
        return 'Tap a door to edit it, or a bare wall facing open space to add an exit';
      case 'stairs':
        return 'Tap a floor square to add stairs, or tap stairs to edit them';
      case 'note':
        return 'Tap a floor square to add a note, or tap a note to edit it';
    }
  }

  const playing = $derived(tool === 'play' && step.kind !== 'idle');
  const hint = $derived(hintFor(tool, map));
  const message = $derived(tool === 'play' && step.kind === 'idle' ? (step.error ?? notice) : notice);
  const hasStairsDown = $derived(map.features.some((f) => f.kind === 'stairs' && f.dir === 'down'));
  const canGoDown = $derived(hasStairsDown && map.level < 10 && !!ongodown);
  const readyHint = $derived(!hasStairsDown && coverage(map) >= 0.75);
  /** In Play, a tapped room, note or stairs takes the panel until it is closed. */
  const playSelection = $derived(tool === 'play' && !playing ? selection : null);
  /** The kind of a selected feature (stairs or note), for picking its editor in Play. */
  const featureKind = $derived(selection?.kind === 'feature' ? map.features.find((f) => f.id === selection.featureId)?.kind : undefined);
  const canGap = $derived(tool === 'play' && map.rooms.length > 0 && openExits(map).length > 0);
</script>

<aside class="panel" class:collapsed aria-label="Step panel">
  <button class="toggle" onclick={ontoggle} aria-expanded={!collapsed} aria-label={collapsed ? 'Show panel' : 'Hide panel'}>
    <span class="chevron" aria-hidden="true">{collapsed ? '‹' : '›'}</span>
  </button>
  {#if !collapsed}
    <div class="body" data-step={playing ? step.kind : 'idle'}>
      {#if levelText}<p class="level" data-testid="level-indicator">{levelText}</p>{/if}
      {#if playing}
        {#if step.kind === 'size'}
          <SizeStep {flow} {step} />
        {:else if step.kind === 'position'}
          <PositionStep {flow} {step} />
        {:else if step.kind === 'exitCount'}
          <ExitCountStep {flow} {step} />
        {:else if step.kind === 'exitType'}
          <ExitTypeStep {flow} {step} />
        {:else if step.kind === 'exits'}
          <ExitsStep {flow} {step} {oncommit} />
        {:else if step.kind === 'label'}
          {#key step.draft.room.id}
            <LabelStep {flow} {step} {oncommit} {tables} {encounter} />
          {/key}
        {:else if step.kind === 'gap'}
          <GapStep {flow} {step} {oncommit} />
        {/if}
        {#if notice}<p class="notice" role="status">{notice}</p>{/if}
        <div class="row cancel">
          <button onclick={() => flow.cancel()}>Cancel</button>
        </div>
      {:else if playSelection}
        {#key selectionKey(playSelection)}
          {#if playSelection.kind === 'room'}
            <RoomInspector {map} roomId={playSelection.roomId} {onexec} {tables} {encounter} />
          {:else if playSelection.kind === 'feature' && featureKind === 'stairs'}
            <StairsEditor {map} featureId={playSelection.featureId} {onexec} {onselect} />
          {:else if playSelection.kind === 'feature' && featureKind === 'note'}
            <NoteEditor {map} selection={playSelection} {onexec} {onselect} />
          {/if}
        {/key}
        {#if notice}<p class="notice" role="status">{notice}</p>{/if}
        <div class="row cancel">
          <button data-testid="close-selection" onclick={() => onselect(null)}>Close</button>
        </div>
      {:else}
        <h2>{titles[tool]}</h2>
        <p class="hint">{hint}</p>
        {#if message}<p class="notice" role="status">{message}</p>{/if}
        {#if selection}
          {#key selectionKey(selection)}
            {#if tool === 'door' && (selection.kind === 'door' || selection.kind === 'wall')}
              <DoorEditor {map} {selection} {onexec} {onselect} />
            {:else if tool === 'stairs' && selection.kind === 'feature'}
              <StairsEditor {map} featureId={selection.featureId} {onexec} {onselect} />
            {:else if tool === 'note' && (selection.kind === 'feature' || selection.kind === 'newNote')}
              <NoteEditor {map} {selection} {onexec} {onselect} />
            {/if}
          {/key}
        {/if}
        {#if canGoDown}
          <div class="row">
            <button class="primary" data-testid="go-down" disabled={fighting} aria-describedby={fighting ? 'go-down-note' : undefined} onclick={ongodown}>Go down to Level {map.level + 1}</button>
          </div>
          {#if fighting}<p class="notice" id="go-down-note" data-testid="go-down-note">Finish or end the encounter first.</p>{/if}
        {:else if readyHint}
          <p class="notice" data-testid="finish-hint">Ready to finish this level? Place the stairs down in the final room.</p>
        {/if}
        {#if canGap}
          <div class="row">
            <button aria-pressed={gapMode} onclick={() => ongapmode(!gapMode)}>
              {gapMode ? 'Cancel corridor' : 'Fill gap with corridor'}
            </button>
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</aside>

<style>
  .panel {
    display: flex;
    min-width: 0;
    min-height: 0;
    background: var(--paper);
    border-left: 2px solid var(--ink);
    overflow: hidden; /* the body scrolls, so the toggle strip stays full height */
  }
  .toggle {
    flex: none;
    width: 48px;
    min-height: 48px;
    align-self: stretch;
    font: inherit;
    font-size: 28px;
    color: var(--ink);
    background: var(--paper-dim);
    border: none;
    border-right: 1px solid var(--rule);
    cursor: pointer;
    touch-action: manipulation;
  }
  .toggle:focus-visible {
    outline: 3px solid var(--accent);
    outline-offset: -3px;
  }
  .body {
    flex: 1;
    min-width: 0;
    padding: 12px 18px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    overflow: auto;
  }
  .body :global(h2) {
    margin: 0;
    font-size: 22px;
  }
  .body :global(p) {
    margin: 0;
    font-size: 18px;
    line-height: 1.4;
  }
  .hint {
    font-size: 19px !important;
  }
  .body :global(.error) {
    color: var(--danger);
    font-size: 17px;
  }
  .body :global(.warn),
  .notice {
    padding: 8px 10px;
    background: var(--paper-dim);
    border-left: 4px solid var(--muted);
    font-size: 17px !important;
  }
  .level {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--muted);
  }
  .body :global(.row) {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
  .body :global(button) {
    min-width: 48px;
    min-height: 48px;
    padding: 0 16px;
    font: inherit;
    font-size: 18px;
    color: var(--ink);
    background: var(--paper);
    border: 2px solid var(--ink);
    border-radius: 6px;
    cursor: pointer;
    touch-action: manipulation;
  }
  .body :global(button.primary),
  .body :global(button[aria-pressed='true']) {
    color: var(--paper);
    background: var(--ink);
  }
  .body :global(button:disabled) {
    opacity: 0.45;
    cursor: default;
  }
  .body :global(button:focus-visible) {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }
  .body :global(.badge) {
    display: inline-block;
    margin-left: 6px;
    padding: 2px 10px;
    font-size: 15px;
    font-weight: 600;
    text-transform: capitalize;
    border: 2px solid var(--ink);
    border-radius: 12px;
  }
  .body :global(.badge.corridor) {
    color: var(--paper);
    background: var(--ink);
  }
  .cancel {
    margin-top: 4px;
    padding-top: 12px;
    border-top: 1px solid var(--rule);
  }

  /* Bottom sheet on narrow screens: the toggle becomes a full-width strip on top. */
  @media (max-width: 699.98px) {
    .panel {
      flex-direction: column;
      border-left: none;
      border-top: 2px solid var(--ink);
    }
    .toggle {
      width: 100%;
      height: 48px;
      flex: none;
      border-right: none;
      border-bottom: 1px solid var(--rule);
    }
    .chevron {
      display: inline-block;
      transform: rotate(90deg);
    }
  }
</style>
