import {
  cellEdge,
  clipRect,
  edgeCells,
  isBoundaryEdge,
  perimeterEdges,
  rectContains,
  rectsOverlap,
} from '../../src/core/geometry';

describe('rectsOverlap', () => {
  it('detects overlapping rects', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 3, h: 3 }, { x: 2, y: 2, w: 3, h: 3 })).toBe(true);
  });
  it('treats touching rects as not overlapping', () => {
    expect(rectsOverlap({ x: 0, y: 0, w: 3, h: 3 }, { x: 3, y: 0, w: 2, h: 2 })).toBe(false);
    expect(rectsOverlap({ x: 0, y: 0, w: 3, h: 3 }, { x: 0, y: 3, w: 2, h: 2 })).toBe(false);
  });
});

describe('rectContains', () => {
  it('includes top-left and excludes far edges', () => {
    const r = { x: 2, y: 2, w: 2, h: 2 };
    expect(rectContains(r, { x: 2, y: 2 })).toBe(true);
    expect(rectContains(r, { x: 3, y: 3 })).toBe(true);
    expect(rectContains(r, { x: 4, y: 3 })).toBe(false);
  });
});

describe('clipRect', () => {
  it('returns the rect unchanged when inside', () => {
    expect(clipRect({ x: 1, y: 1, w: 3, h: 2 }, 10, 10)).toEqual({ x: 1, y: 1, w: 3, h: 2 });
  });
  it('clips at the top and left', () => {
    expect(clipRect({ x: -2, y: -1, w: 5, h: 4 }, 10, 10)).toEqual({ x: 0, y: 0, w: 3, h: 3 });
  });
  it('clips at the bottom and right', () => {
    expect(clipRect({ x: 8, y: 7, w: 5, h: 5 }, 10, 10)).toEqual({ x: 8, y: 7, w: 2, h: 3 });
  });
  it('returns null when nothing remains', () => {
    expect(clipRect({ x: -5, y: 0, w: 5, h: 2 }, 10, 10)).toBeNull();
  });
});

describe('edges', () => {
  it('canonicalises S and E onto the neighbour square', () => {
    expect(cellEdge({ x: 3, y: 4 }, 'S')).toEqual({ x: 3, y: 5, side: 'N' });
    expect(cellEdge({ x: 3, y: 4 }, 'E')).toEqual({ x: 4, y: 4, side: 'W' });
  });
  it('edgeCells returns both neighbours', () => {
    expect(edgeCells({ x: 3, y: 5, side: 'N' })).toEqual([
      { x: 3, y: 4 },
      { x: 3, y: 5 },
    ]);
    expect(edgeCells({ x: 4, y: 4, side: 'W' })).toEqual([
      { x: 3, y: 4 },
      { x: 4, y: 4 },
    ]);
  });
  it('identifies Outer Boundary edges', () => {
    expect(isBoundaryEdge({ x: 2, y: 0, side: 'N' }, 10, 8)).toBe(true);
    expect(isBoundaryEdge({ x: 2, y: 8, side: 'N' }, 10, 8)).toBe(true);
    expect(isBoundaryEdge({ x: 0, y: 3, side: 'W' }, 10, 8)).toBe(true);
    expect(isBoundaryEdge({ x: 10, y: 3, side: 'W' }, 10, 8)).toBe(true);
    expect(isBoundaryEdge({ x: 2, y: 4, side: 'N' }, 10, 8)).toBe(false);
  });
  it('perimeterEdges lists 2w+2h edges', () => {
    expect(perimeterEdges({ x: 0, y: 0, w: 3, h: 2 })).toHaveLength(10);
  });
});
