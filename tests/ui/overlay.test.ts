import { History } from '../../src/core/history';
import { sequentialIds } from '../../src/core/ids';
import { openExits } from '../../src/core/query';
import type { Edge } from '../../src/core/types';
import { PlayFlow, type Step } from '../../src/interaction/playflow';
import { mulberry32 } from '../../src/render/rng';
import { overlayFor, selectionOverlay, type OverlayShape } from '../../src/ui/overlay';
import { door, emptyMap, room, withContent } from '../core/fixtures';

function setup() {
  const history = new History(emptyMap(10, 10));
  const flow = new PlayFlow(history, mulberry32(7), sequentialIds('o'));
  return { history, flow };
}

/** Entrance at (4,10) and its 3×2 room with three archway exits, committed. */
function withEntrance() {
  const s = setup();
  s.flow.startEntrance({ x: 4, y: 10 });
  s.flow.enterSize('3', '2');
  s.flow.place();
  expect(s.flow.finish(null)).toEqual({ ok: true });
  return s;
}

const edges = (shapes: OverlayShape[], tone: OverlayShape['tone']) =>
  shapes.filter((s) => s.kind === 'edge' && s.tone === tone).map((s) => s.at as Edge);
const key = (e: Edge) => `${e.x},${e.y},${e.side}`;

describe('overlayFor', () => {
  it('idle on an empty map highlights one cell per entrance square (the map width)', () => {
    const { history, flow } = setup();
    const shapes = overlayFor(flow.step, history.map);
    expect(shapes).toHaveLength(10);
    expect(shapes.every((s) => s.kind === 'cell' && s.tone === 'highlight')).toBe(true);
    expect(shapes.map((s) => s.at)).toContainEqual({ x: 4, y: 10 });
  });

  it('idle with exits highlights one edge per open exit', () => {
    const { history, flow } = withEntrance();
    const open = openExits(history.map);
    expect(open.length).toBeGreaterThan(0);
    const shapes = overlayFor(flow.step, history.map);
    expect(shapes).toHaveLength(open.length);
    expect(edges(shapes, 'highlight').map(key).sort()).toEqual(open.map(key).sort());
  });

  it('position shows the ghost rect, ok when valid and bad when not', () => {
    const { history, flow } = withEntrance();
    const north = openExits(history.map).find((d) => d.x === 4 && d.y === 7 && d.side === 'N')!;
    flow.startFromExit(north.id);
    flow.enterSize('3', '4');
    const ok = flow.step as Extract<Step, { kind: 'position' }>;
    expect(ok.placement.ok).toBe(true);
    expect(overlayFor(ok, flow.draftMap)).toEqual([{ kind: 'rect', at: ok.placement.rect, tone: 'ok' }]);

    const bad: Step = { ...ok, placement: { ...ok.placement, ok: false, reason: 'Overlaps Room 3' } };
    expect(overlayFor(bad, flow.draftMap)).toEqual([{ kind: 'rect', at: ok.placement.rect, tone: 'bad' }]);
  });

  it('exits: allowed edges are highlights and chosen edges are ok', () => {
    const { history, flow } = withEntrance();
    const north = openExits(history.map).find((d) => d.x === 4 && d.y === 7 && d.side === 'N')!;
    flow.startFromExit(north.id);
    flow.enterSize('3', '4');
    flow.place();
    flow.enterExitCount('5'); // two exits
    flow.chooseExitType('wooden');
    const first = flow.allowedExits[0]!;
    flow.toggleExit(first);
    const step = flow.step as Extract<Step, { kind: 'exits' }>;
    const shapes = overlayFor(step, flow.draftMap);
    expect(edges(shapes, 'ok').map(key)).toEqual([key(first)]);
    expect(edges(shapes, 'highlight').map(key).sort()).toEqual(flow.allowedExits.map(key).sort());
    // The chosen exit's 1×1 exit square is previewed too (draftMap doesn't contain it).
    expect(shapes.filter((s) => s.kind === 'cell' && s.tone === 'ok')).toHaveLength(1);
  });

  it('gap shows the corridor rect', () => {
    const { history, flow } = withEntrance();
    const north = openExits(history.map).find((d) => d.x === 4 && d.y === 7 && d.side === 'N')!;
    flow.startGap(north.id);
    flow.setGapLength(3);
    const step = flow.step as Extract<Step, { kind: 'gap' }>;
    expect(step.rect).not.toBeNull();
    expect(overlayFor(step, flow.draftMap)).toEqual([{ kind: 'rect', at: step.rect, tone: 'ok' }]);
  });

  it('gap that collides shows the attempted corridor in red', () => {
    const { history, flow } = withEntrance();
    history.execute({ label: 'Add room', apply: (m) => ({ ...m, rooms: [...m.rooms, room('B', 3, 2, 3, 2, 'room', 9)] }) });
    const north = openExits(history.map).find((d) => d.x === 4 && d.y === 7 && d.side === 'N')!;
    flow.startGap(north.id);
    flow.setGapLength(4);
    const step = flow.step as Extract<Step, { kind: 'gap' }>;
    expect(step.rect).toBeNull();
    expect(overlayFor(step, flow.draftMap)).toEqual([{ kind: 'rect', at: { x: 4, y: 3, w: 1, h: 4 }, tone: 'bad' }]);
  });
});

describe('selectionOverlay', () => {
  const base = () => {
    const r1 = room('r1', 2, 2, 3, 3, 'room', 1);
    const m = withContent(emptyMap(10, 10), [r1], [door('d1', 3, 2, 'N')]);
    return { ...m, features: [{ id: 'n1', kind: 'note' as const, x: 3, y: 3, text: 'x' }] };
  };

  it('is empty with nothing selected', () => {
    expect(selectionOverlay(base(), null)).toEqual([]);
  });

  it('highlights a selected door edge, room rect, feature or new-note square', () => {
    const m = base();
    expect(selectionOverlay(m, { kind: 'door', doorId: 'd1' })).toEqual([{ kind: 'edge', at: { x: 3, y: 2, side: 'N' }, tone: 'highlight' }]);
    expect(selectionOverlay(m, { kind: 'room', roomId: 'r1' })).toEqual([{ kind: 'rect', at: { x: 2, y: 2, w: 3, h: 3 }, tone: 'highlight' }]);
    expect(selectionOverlay(m, { kind: 'feature', featureId: 'n1' })).toEqual([{ kind: 'cell', at: { x: 3, y: 3 }, tone: 'highlight' }]);
    expect(selectionOverlay(m, { kind: 'newNote', cell: { x: 4, y: 4 } })).toEqual([{ kind: 'cell', at: { x: 4, y: 4 }, tone: 'highlight' }]);
  });

  it('marks a wall green when the Door tool can add a door there, red when it refuses', () => {
    const m = base();
    expect(selectionOverlay(m, { kind: 'wall', edge: { x: 2, y: 3, side: 'W' } })).toEqual([{ kind: 'edge', at: { x: 2, y: 3, side: 'W' }, tone: 'ok' }]);
    expect(selectionOverlay(m, { kind: 'wall', edge: { x: 3, y: 3, side: 'N' } })).toEqual([{ kind: 'edge', at: { x: 3, y: 3, side: 'N' }, tone: 'bad' }]);
  });

  it('is empty when the selected thing is gone', () => {
    expect(selectionOverlay(base(), { kind: 'door', doorId: 'gone' })).toEqual([]);
  });
});
