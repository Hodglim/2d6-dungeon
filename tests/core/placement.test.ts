import { entranceCells, evaluatePlacement, ghostRect, slideRange, validExitEdges } from '../../src/core/placement';
import { exitDirection, exitTarget } from '../../src/core/query';
import { door, emptyMap, room, withContent } from './fixtures';

// A 3x2 room at (4,4) with an open exit on its top wall at x=5 (edge (5,4,N)).
function mapWithTopExit() {
  return withContent(emptyMap(10, 10), [room('a', 4, 4, 3, 2, 'room', 1)], [door('d', 5, 4, 'N')]);
}

describe('exit direction and target', () => {
  it('points away from the owning room', () => {
    const m = mapWithTopExit();
    expect(exitDirection(m, m.doors[0]!)).toBe('N');
    expect(exitTarget(m, m.doors[0]!)).toEqual({ x: 5, y: 3 });
  });
  it('works for an east-facing exit', () => {
    const m = withContent(emptyMap(), [room('a', 2, 2, 2, 2)], [door('d', 4, 3, 'W')]);
    expect(exitDirection(m, m.doors[0]!)).toBe('E');
    expect(exitTarget(m, m.doors[0]!)).toEqual({ x: 4, y: 3 });
  });
  it('is null for a door between two rooms', () => {
    const m = withContent(emptyMap(), [room('a', 2, 2, 2, 2), room('b', 4, 2, 2, 2)], [door('d', 4, 3, 'W')]);
    expect(exitDirection(m, m.doors[0]!)).toBeNull();
  });
});

describe('ghostRect', () => {
  it('places a north room so its bottom row touches the exit', () => {
    const m = mapWithTopExit();
    expect(ghostRect(m, m.doors[0]!, 4, 3, 0)).toEqual({ x: 5, y: 1, w: 4, h: 3 });
    expect(ghostRect(m, m.doors[0]!, 4, 3, 3)).toEqual({ x: 2, y: 1, w: 4, h: 3 });
  });
  describe('other directions', () => {
    const base = (d: ReturnType<typeof door>) => withContent(emptyMap(10, 10), [room('a', 4, 4, 2, 2)], [d]);
    it('S', () => {
      const m = base(door('d', 4, 6, 'N'));
      expect(ghostRect(m, m.doors[0]!, 3, 2, 0)).toEqual({ x: 4, y: 6, w: 3, h: 2 });
    });
    it('W', () => {
      const m = base(door('d', 4, 4, 'W'));
      expect(ghostRect(m, m.doors[0]!, 3, 2, 0)).toEqual({ x: 1, y: 4, w: 3, h: 2 });
      expect(ghostRect(m, m.doors[0]!, 3, 2, 1)).toEqual({ x: 1, y: 3, w: 3, h: 2 });
    });
    it('E', () => {
      const m = base(door('d', 6, 5, 'W'));
      expect(ghostRect(m, m.doors[0]!, 3, 2, 0)).toEqual({ x: 6, y: 5, w: 3, h: 2 });
    });
  });
  it('clamps the slide offset', () => {
    const m = mapWithTopExit();
    expect(ghostRect(m, m.doors[0]!, 4, 3, 99)).toEqual({ x: 2, y: 1, w: 4, h: 3 });
  });
});

describe('slideRange', () => {
  it('is 0 when the door is not an open exit', () => {
    const m = withContent(emptyMap(), [], [door('d', 3, 3, 'N')]);
    expect(slideRange(m, m.doors[0]!, 3, 2)).toBe(0);
  });
});

describe('evaluatePlacement', () => {
  it('reports clipped false when the exit target is outside the boundary', () => {
    const m = withContent(emptyMap(10, 10), [room('a', 2, 9, 1, 1)], [door('d', 2, 10, 'N')]);
    const r = evaluatePlacement(m, m.doors[0]!, 3, 2, 0);
    expect(r).toMatchObject({ ok: false, rect: null, clipped: false, reason: 'The room must connect to the exit' });
  });
  it('accepts a room that fits', () => {
    const m = mapWithTopExit();
    const r = evaluatePlacement(m, m.doors[0]!, 2, 2, 0);
    expect(r).toMatchObject({ ok: true, rect: { x: 5, y: 2, w: 2, h: 2 }, clipped: false });
  });
  it('clips at the Outer Boundary and reports it', () => {
    const m = mapWithTopExit();
    // 6 tall from y=3 upward would reach y=-2; clipped to y=0..3 (h=4).
    const r = evaluatePlacement(m, m.doors[0]!, 2, 6, 0);
    expect(r).toMatchObject({ ok: true, rect: { x: 5, y: 0, w: 2, h: 4 }, clipped: true, rolled: { w: 2, h: 6 } });
  });
  it('rejects overlap and names the room', () => {
    const m = withContent(
      emptyMap(),
      [room('a', 4, 4, 3, 2, 'room', 1), room('b', 6, 1, 2, 2, 'room', 2)],
      [door('d', 5, 4, 'N')],
    );
    const r = evaluatePlacement(m, m.doors[0]!, 3, 2, 0);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('Overlaps Room 2');
  });
  it('allows butting up against another room', () => {
    const m = withContent(
      emptyMap(),
      [room('a', 4, 4, 3, 2, 'room', 1), room('b', 7, 1, 2, 2, 'room', 2)],
      [door('d', 5, 4, 'N')],
    );
    expect(evaluatePlacement(m, m.doors[0]!, 2, 2, 0).ok).toBe(true);
  });
});

describe('validExitEdges', () => {
  it('excludes Outer Boundary edges and existing doors', () => {
    // 2x1 room in the top-left corner: top and left edges are boundary.
    const m = withContent(emptyMap(5, 5), [room('a', 0, 0, 2, 1)], [door('d', 0, 1, 'N')]);
    const edges = validExitEdges(m, 'a', false);
    // Perimeter: 2 top (boundary), 2 bottom (one is a door), 1 left (boundary), 1 right.
    expect(edges).toEqual(expect.arrayContaining([{ x: 1, y: 1, side: 'N' }, { x: 2, y: 0, side: 'W' }]));
    expect(edges).toHaveLength(2);
  });
  it('allows an exit into a neighbouring room without passages but not with them', () => {
    const m = withContent(emptyMap(), [room('a', 2, 2, 1, 1), room('b', 3, 2, 1, 1)]);
    const shared = { x: 3, y: 2, side: 'W' };
    expect(validExitEdges(m, 'a', false)).toContainEqual(shared);
    expect(validExitEdges(m, 'a', true)).not.toContainEqual(shared);
  });
});

describe('entranceCells', () => {
  it('lists squares just below the bottom boundary', () => {
    const cells = entranceCells(emptyMap(3, 4), 'S');
    expect(cells).toEqual([
      { x: 0, y: 4 },
      { x: 1, y: 4 },
      { x: 2, y: 4 },
    ]);
  });
});
