import {
  cellEdge,
  clipRect,
  edgeCells,
  edgeKey,
  inBounds,
  isBoundaryEdge,
  perimeterEdges,
  rectContains,
  rectsOverlap,
  sameEdge,
  step,
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

describe('perimeterEdges content', () => {
  const edges = perimeterEdges({ x: 1, y: 1, w: 2, h: 1 });
  it('gives each edge its inside square and outward direction', () => {
    expect(edges).toContainEqual({ edge: { x: 1, y: 1, side: 'N' }, inside: { x: 1, y: 1 }, dir: 'N' });
    expect(edges).toContainEqual({ edge: { x: 1, y: 2, side: 'N' }, inside: { x: 1, y: 1 }, dir: 'S' });
    expect(edges).toContainEqual({ edge: { x: 1, y: 1, side: 'W' }, inside: { x: 1, y: 1 }, dir: 'W' });
    expect(edges).toContainEqual({ edge: { x: 3, y: 1, side: 'W' }, inside: { x: 2, y: 1 }, dir: 'E' });
  });
  it('has no duplicate edges', () => {
    expect(new Set(edges.map((e) => edgeKey(e.edge))).size).toBe(edges.length);
  });
});

describe('small helpers', () => {
  it('step moves one square in each direction', () => {
    const c = { x: 5, y: 5 };
    expect([step(c, 'N'), step(c, 'S'), step(c, 'E'), step(c, 'W')]).toEqual([
      { x: 5, y: 4 },
      { x: 5, y: 6 },
      { x: 6, y: 5 },
      { x: 4, y: 5 },
    ]);
  });
  it('cellEdge on one side equals the opposite side of the neighbour', () => {
    const c = { x: 2, y: 2 };
    expect(cellEdge(c, 'S')).toEqual(cellEdge(step(c, 'S'), 'N'));
    expect(cellEdge(c, 'E')).toEqual(cellEdge(step(c, 'E'), 'W'));
  });
  it('inBounds checks both ends', () => {
    expect(inBounds({ x: 0, y: 0 }, 4, 3)).toBe(true);
    expect(inBounds({ x: 3, y: 2 }, 4, 3)).toBe(true);
    expect(inBounds({ x: 4, y: 2 }, 4, 3)).toBe(false);
    expect(inBounds({ x: -1, y: 0 }, 4, 3)).toBe(false);
  });
  it('sameEdge compares side too', () => {
    expect(sameEdge({ x: 1, y: 1, side: 'N' }, { x: 1, y: 1, side: 'N' })).toBe(true);
    expect(sameEdge({ x: 1, y: 1, side: 'N' }, { x: 1, y: 1, side: 'W' })).toBe(false);
  });
  it('clipRect returns null for a rect beyond the far side', () => {
    expect(clipRect({ x: 10, y: 0, w: 2, h: 2 }, 10, 10)).toBeNull();
  });
  it('isBoundaryEdge rejects edges past the ends of the boundary', () => {
    expect(isBoundaryEdge({ x: 10, y: 0, side: 'N' }, 10, 8)).toBe(false);
    expect(isBoundaryEdge({ x: -1, y: 0, side: 'N' }, 10, 8)).toBe(false);
    expect(isBoundaryEdge({ x: 0, y: 8, side: 'W' }, 10, 8)).toBe(false);
    expect(isBoundaryEdge({ x: 5, y: 3, side: 'W' }, 10, 8)).toBe(false);
  });
});
