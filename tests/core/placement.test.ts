import { entranceCells, evaluatePlacement, ghostRect, shrinkToFit, slideRange } from '../../src/core/placement';
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

describe('shrinkToFit', () => {
  it('scores by the clipped area, so a clean 2×2 beats a 5×1 clipped to 3×1', () => {
    // East-facing exit at (5,5) on an 8-wide map: 3 columns (5..7) before the boundary.
    // 1×1 blockers at (7,4) and (7,6) stop every 2-high room deeper than 2.
    const m = withContent(
      emptyMap(8, 10),
      [room('a', 2, 4, 3, 3, 'room', 1), room('b', 7, 4, 1, 1, 'room', 2), room('c', 7, 6, 1, 1, 'room', 3)],
      [door('d', 5, 5, 'W')],
    );
    const d = m.doors[0]!;
    expect(evaluatePlacement(m, d, 5, 1, 0)).toMatchObject({ ok: true, clipped: true, rect: { w: 3, h: 1 } });
    const fit = shrinkToFit(m, d, 5, 2, 0)!;
    expect(fit).toMatchObject({ w: 2, h: 2 });
    const placed = evaluatePlacement(m, d, fit.w, fit.h, fit.offset);
    expect(placed).toMatchObject({ ok: true, rect: { w: 2, h: 2 } });
  });
  it('returns the rolled size unchanged when it already fits', () => {
    const m = mapWithTopExit();
    expect(shrinkToFit(m, m.doors[0]!, 5, 4, 2)).toEqual({ w: 5, h: 4, offset: 2 });
  });
  it('finds the largest fitting size when neighbours block', () => {
    const m = withContent(
      emptyMap(10, 10),
      [room('a', 4, 4, 3, 2, 'room', 1), room('b', 6, 0, 4, 4, 'room', 2), room('c', 0, 0, 4, 4, 'room', 3)],
      [door('d', 5, 4, 'N')],
    );
    const d = m.doors[0]!;
    const r = shrinkToFit(m, d, 5, 4, 0)!;
    expect(r).not.toBeNull();
    expect(evaluatePlacement(m, d, r.w, r.h, r.offset).ok).toBe(true);
    expect(r.w * r.h).toBeLessThan(20);
    for (let w = 1; w <= 5; w++)
      for (let h = 1; h <= 4; h++)
        for (let o = 0; o < slideRange(m, d, w, h); o++)
          if (evaluatePlacement(m, d, w, h, o).ok) expect(w * h).toBeLessThanOrEqual(r.w * r.h);
  });
  it('returns null when the square in front of the exit is floor', () => {
    const m = withContent(
      emptyMap(10, 10),
      [room('a', 4, 4, 3, 2, 'room', 1), room('b', 5, 2, 2, 2, 'room', 2)],
      [door('d', 5, 4, 'N')],
    );
    expect(shrinkToFit(m, m.doors[0]!, 3, 3, 0)).toBeNull();
  });
});
