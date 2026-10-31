import { History } from '../../src/core/history';
import { sequentialIds } from '../../src/core/ids';
import { openExits } from '../../src/core/query';
import type { Door, DungeonMap, Room } from '../../src/core/types';
import { PlayFlow, type Step } from '../../src/interaction/playflow';
import { mulberry32 } from '../../src/render/rng';
import { door, emptyMap, room, withContent } from '../core/fixtures';

function setup(map: DungeonMap = emptyMap(10, 10)) {
  const history = new History(map);
  const flow = new PlayFlow(history, mulberry32(7), sequentialIds('p'));
  return { history, flow };
}

function expectKind<K extends Step['kind']>(flow: PlayFlow, kind: K): Extract<Step, { kind: K }> {
  expect(flow.step.kind).toBe(kind);
  return flow.step as Extract<Step, { kind: K }>;
}

/** Entrance at (4,10), entrance room 3×2 at x3..5 y8..9 with 3 archway exits. */
function withEntrance() {
  const s = setup();
  s.flow.startEntrance({ x: 4, y: 10 });
  s.flow.enterSize('3', '2');
  s.flow.place();
  expect(s.flow.finish(null)).toEqual({ ok: true });
  return s;
}

/** The open exit at the far end of the entrance room's north exit square. */
function northExit(map: DungeonMap): Door {
  const d = openExits(map).find((x) => x.x === 4 && x.y === 7 && x.side === 'N');
  expect(d).toBeDefined();
  return d!;
}

describe('PlayFlow size step', () => {
  it('rejects typed dice outside 1–6, asks for a second pair on doubles, and sums them', () => {
    const { history, flow } = withEntrance();
    flow.startFromExit(northExit(history.map).id);
    flow.enterSize('7', '2');
    expect(expectKind(flow, 'size').error).toMatch(/1.*6/);
    for (const bad of ['', '0', 'a', '2.5']) {
      flow.enterSize(bad, '3');
      expect(expectKind(flow, 'size').error).not.toBeNull();
    }
    flow.enterSize('4', '4');
    expect(expectKind(flow, 'size')).toMatchObject({ needsSecond: true, first: { primary: 4, secondary: 4 }, error: null });
    flow.enterSize('3', '2');
    expect(expectKind(flow, 'position')).toMatchObject({ w: 7, h: 6 });
  });
});

describe('PlayFlow room path', () => {
  it('exit → size → place → count → type → place-for-me → finish, as Add Room 2', () => {
    const { history, flow } = withEntrance();
    flow.startFromExit(northExit(history.map).id);
    flow.enterSize('3', '4');
    const pos = expectKind(flow, 'position');
    expect(pos.placement.ok).toBe(true);
    flow.place();
    expect(expectKind(flow, 'exitCount').draft).toMatchObject({ kindOf: 'room', sizeClass: 'normal' });
    flow.enterExitCount('4');
    expectKind(flow, 'exitType');
    flow.chooseExitType('wooden');
    flow.placeExitsForMe(1);
    const ex = expectKind(flow, 'exits');
    expect(ex).toMatchObject({ count: 2, exitType: 'wooden', dropped: 0 });
    expect(ex.chosen).toHaveLength(2);
    const roomId = ex.draft.room.id;
    expect(flow.finish(null)).toEqual({ ok: true });
    expect(flow.step.kind).toBe('idle');
    expect(history.undoLabel).toBe('Add Room 2');

    const room2 = history.map.rooms.find((r) => r.id === roomId)!;
    expect(room2).toMatchObject({ number: 2, kind: 'room', sizeClass: 'normal', w: 3, h: 4 });
    const exits = history.map.doors.filter((d) => ex.chosen.some((c) => c.x === d.x && c.y === d.y && c.side === d.side));
    expect(exits).toHaveLength(2);
    expect(exits.every((d) => d.type === 'wooden')).toBe(true);
    for (const d of exits) {
      expect(history.map.rooms.some((r) => r.kind === 'passage' && r.entryDoorId === d.id)).toBe(true);
    }
    expect(flow.lastWalk?.at(-1)).toEqual({ x: room2.x + 1, y: room2.y + 1 });
    expect(history.map.token).toMatchObject({ x: room2.x + 1, y: room2.y + 1 });
  });

  it('a small room skips the exit type and gets archways', () => {
    const { history, flow } = withEntrance();
    flow.startFromExit(northExit(history.map).id);
    flow.enterSize('2', '3');
    flow.place();
    expect(expectKind(flow, 'exitCount').draft.sizeClass).toBe('small');
    flow.enterExitCount('4');
    const ex = expectKind(flow, 'exits');
    expect(ex.exitType).toBe('archway');
    flow.placeExitsForMe(1);
    const chosen = expectKind(flow, 'exits').chosen;
    expect(chosen.length).toBeGreaterThan(0);
    expect(flow.finish(null).ok).toBe(true);
    const doors = history.map.doors.filter((d) => chosen.some((c) => c.x === d.x && c.y === d.y && c.side === d.side));
    expect(doors.every((d) => d.type === 'archway')).toBe(true);
  });

  it('a corridor roll skips the exit type and the label', () => {
    const { history, flow } = withEntrance();
    flow.startFromExit(northExit(history.map).id);
    flow.enterSize('1', '4');
    flow.place();
    expect(expectKind(flow, 'exitCount').draft).toMatchObject({ kindOf: 'corridor', sizeClass: null });
    flow.enterExitCount('2');
    expect(expectKind(flow, 'exits').exitType).toBe('archway');
    flow.placeExitsForMe(1);
    const seen: string[] = [];
    flow.subscribe((s) => seen.push(s.kind));
    expect(flow.doneExits()).toEqual({ ok: true });
    expect(seen).not.toContain('label');
    expect(flow.step.kind).toBe('idle');
    expect(history.undoLabel).toBe('Add corridor');
  });

  it("count '1' gives 0 exits and goes straight to the label", () => {
    const { history, flow } = withEntrance();
    flow.startFromExit(northExit(history.map).id);
    flow.enterSize('3', '4');
    flow.place();
    flow.enterExitCount('1');
    expect(expectKind(flow, 'label')).toMatchObject({ chosen: [] });
    expect(flow.finish({ type: 'Guard Room', unique: false, narrative: '' }).ok).toBe(true);
    const r2 = history.map.rooms.find((r) => r.number === 2)!;
    expect(r2.label.type).toBe('Guard Room');
    expect(history.undoLabel).toBe('Add Room 2');
  });

  it('rejects a bad exit count and invalid toggles', () => {
    const { history, flow } = withEntrance();
    flow.startFromExit(northExit(history.map).id);
    flow.enterSize('3', '4');
    flow.place();
    flow.enterExitCount('9');
    expect(expectKind(flow, 'exitCount').error).not.toBeNull();
    flow.enterExitCount('2'); // 1 exit
    flow.chooseExitType('nonsense');
    expectKind(flow, 'exitType');
    flow.chooseExitType('metal');
    // The entry wall (south) is never allowed.
    const ex = expectKind(flow, 'exits');
    const r = ex.draft.room;
    flow.toggleExit({ x: r.x, y: r.y + r.h, side: 'N' });
    expect(expectKind(flow, 'exits').chosen).toEqual([]);
    const north = { x: r.x + 1, y: r.y, side: 'N' as const };
    const west = { x: r.x, y: r.y + 1, side: 'W' as const };
    flow.toggleExit(north);
    flow.toggleExit(west); // count is 1: ignored
    expect(expectKind(flow, 'exits').chosen).toEqual([north]);
    flow.toggleExit(north); // toggles off
    expect(expectKind(flow, 'exits').chosen).toEqual([]);
  });
});

describe('PlayFlow entrance path', () => {
  it('pre-fills 3 archway exits and commits as one undo step', () => {
    const { history, flow } = setup();
    const before = history.map;
    flow.startEntrance({ x: 4, y: 10 });
    expect(expectKind(flow, 'size')).toMatchObject({ needsSecond: false });
    flow.enterSize('2', '2'); // no doubles rule; area raised to 6
    const pos = expectKind(flow, 'position');
    expect(pos.w * pos.h).toBe(6);
    flow.place();
    const ex = expectKind(flow, 'exits');
    expect(ex).toMatchObject({ count: 3, exitType: 'archway', dropped: 0 });
    expect(ex.chosen).toHaveLength(3);
    expect(ex.draft).toMatchObject({ kindOf: 'room', sizeClass: 'small' });
    // Every pre-filled exit is one the draft map allows.
    expect(flow.draftMap.rooms.map((r) => r.kind).sort()).toEqual(['entrance', 'room']);
    expect(flow.finish(null)).toEqual({ ok: true });
    expect(history.undoLabel).toBe('Add entrance');
    const r1 = history.map.rooms.find((r) => r.kind === 'room')!;
    expect(r1).toMatchObject({ id: ex.draft.room.id, number: 1, sizeClass: 'small', label: { type: 'Entrance Room' } });
    expect(history.map.doors.filter((d) => d.type === 'archway').length).toBeGreaterThanOrEqual(4);
    history.undo();
    expect(history.map).toBe(before);
    expect(history.canUndo).toBe(false);
  });

  it('refuses an entrance when the map already has one, or off the bottom edge', () => {
    const { history, flow } = withEntrance();
    flow.startEntrance({ x: 2, y: 10 });
    expect(expectKind(flow, 'idle').error).not.toBeNull();
    const fresh = setup();
    fresh.flow.startEntrance({ x: 4, y: 3 });
    expect(expectKind(fresh.flow, 'idle').error).not.toBeNull();
    expect(history.undoLabel).toBe('Add entrance');
  });
});

describe('PlayFlow cancel', () => {
  const steps: [string, (f: PlayFlow, m: DungeonMap) => void][] = [
    ['size', (f, m) => f.startFromExit(northExit(m).id)],
    ['position', (f, m) => { f.startFromExit(northExit(m).id); f.enterSize('3', '4'); }],
    ['exitCount', (f, m) => { f.startFromExit(northExit(m).id); f.enterSize('3', '4'); f.place(); }],
    ['exitType', (f, m) => { f.startFromExit(northExit(m).id); f.enterSize('3', '4'); f.place(); f.enterExitCount('4'); }],
    ['exits', (f, m) => { f.startFromExit(northExit(m).id); f.enterSize('3', '4'); f.place(); f.enterExitCount('4'); f.chooseExitType('wooden'); f.placeExitsForMe(3); }],
    ['label', (f, m) => { f.startFromExit(northExit(m).id); f.enterSize('3', '4'); f.place(); f.enterExitCount('1'); }],
    ['gap', (f, m) => { f.startGap(northExit(m).id); f.setGapLength(2); }],
  ];
  it.each(steps)('cancel at %s changes nothing', (kind, go) => {
    const { history, flow } = withEntrance();
    const before = history.map;
    go(flow, history.map);
    expect(flow.step.kind).toBe(kind);
    flow.cancel();
    expect(flow.step.kind).toBe('idle');
    expect(history.map).toBe(before);
    expect(flow.draftMap).toBe(before);
  });

  it('cancel during the entrance flow leaves the map empty', () => {
    const { history, flow } = setup();
    const before = history.map;
    flow.startEntrance({ x: 4, y: 10 });
    flow.enterSize('3', '2');
    flow.place();
    flow.cancel();
    expect(history.map).toBe(before);
    expect(flow.draftMap).toBe(before);
  });
});

describe('PlayFlow and History (Review Focus 2)', () => {
  it('undo mid-flow cancels the draft; room numbers stay contiguous', () => {
    const { history, flow } = withEntrance();
    flow.startFromExit(northExit(history.map).id);
    flow.enterSize('3', '4');
    flow.place();
    flow.enterExitCount('1');
    expect(flow.finish(null).ok).toBe(true); // Room 2
    const west = openExits(history.map).find((d) => d.side === 'W')!;
    flow.startFromExit(west.id);
    flow.enterSize('4', '2');
    flow.place();
    flow.enterExitCount('4');
    expect(['exitType', 'exits']).toContain(flow.step.kind); // mid-flow (clipped at the left edge)
    history.undo(); // removes Room 2
    expect(flow.step.kind).toBe('idle');
    expect(flow.lastWalk).toBeNull();
    history.redo();
    expect(flow.step.kind).toBe('idle');
    flow.startFromExit(openExits(history.map).find((d) => d.side === 'W')!.id);
    flow.enterSize('4', '2');
    flow.place();
    flow.enterExitCount('1');
    expect(flow.finish(null).ok).toBe(true);
    expect(history.undoLabel).toBe('Add Room 3');
    const numbers = history.map.rooms.filter((r) => r.kind === 'room').map((r) => r.number).sort();
    expect(numbers).toEqual([1, 2, 3]);
  });
});

describe('PlayFlow tight spaces (Review Focus 3)', () => {
  // Room A at x2..4 y2..4 with an open exit on its south wall at x3.
  const roomA: Room = { ...room('A', 2, 2, 3, 3, 'room', 1), entryDoorId: null };
  const exitA = door('dA', 3, 5, 'N');

  it('an exit whose front square is 1 deep says there is no space and stays idle', () => {
    const map = withContent(emptyMap(10, 10), [roomA, room('B', 0, 6, 10, 2, 'room', 2)], [exitA]);
    const { flow } = setup(map);
    flow.startFromExit('dA');
    expect(expectKind(flow, 'idle').error).toBe('No space beyond this exit');
  });

  it('a blocked rolled size offers shrink-to-fit, which yields an ok placement', () => {
    const map = withContent(emptyMap(10, 10), [roomA, room('B', 0, 8, 10, 2, 'room', 2)], [exitA]);
    const { flow } = setup(map);
    flow.startFromExit('dA');
    expect(expectKind(flow, 'size').error).toBeNull();
    flow.enterSize('4', '5');
    const pos = expectKind(flow, 'position');
    expect(pos.placement.ok).toBe(false);
    expect(pos.canShrink).toBe(true);
    flow.shrink();
    const shrunk = expectKind(flow, 'position');
    expect(shrunk.placement.ok).toBe(true);
    expect(shrunk).toMatchObject({ w: 4, h: 3, canShrink: false });
    flow.place();
    const draft = expectKind(flow, 'exitCount').draft;
    expect(draft.room).toMatchObject({ w: 4, h: 3 });
    expect(draft.sizeClass).toBe('normal');
  });

  it('a room clipped at the boundary keeps the clipped size and class', () => {
    const map = withContent(emptyMap(10, 10), [roomA], [exitA]);
    const { flow } = setup(map);
    flow.startFromExit('dA');
    flow.enterSize('6', '6');
    flow.enterSize('6', '5'); // 12 × 11 rolled
    const pos = expectKind(flow, 'position');
    expect(pos.placement).toMatchObject({ ok: true, clipped: true });
    flow.place();
    const draft = expectKind(flow, 'exitCount').draft;
    expect(draft.room.w).toBe(pos.placement.rect!.w);
    expect(draft.room.h).toBe(pos.placement.rect!.h);
  });
});

describe('PlayFlow gap corridor', () => {
  it('startGap → length 2 → placeGap is one Add corridor step', () => {
    const { history, flow } = withEntrance();
    flow.startGap(northExit(history.map).id);
    flow.setGapLength(2);
    expect(expectKind(flow, 'gap')).toMatchObject({ length: 2, rect: { x: 4, y: 5, w: 1, h: 2 } });
    expect(flow.placeGap()).toEqual({ ok: true });
    expect(history.undoLabel).toBe('Add corridor');
    expect(flow.step.kind).toBe('idle');
  });
});

describe('PlayFlow dice rolls', () => {
  it('rollSize and rollExitCount advance with the seeded rng', () => {
    const { history, flow } = withEntrance();
    flow.startFromExit(northExit(history.map).id);
    let guard = 0;
    while (flow.step.kind === 'size' && guard++ < 3) flow.rollSize();
    const pos = expectKind(flow, 'position');
    if (!pos.placement.ok && pos.canShrink) flow.shrink();
    flow.place();
    expect(flow.step.kind).toBe('exitCount');
    flow.rollExitCount();
    expect(['exitType', 'exits', 'label']).toContain(flow.step.kind);
  });
});
