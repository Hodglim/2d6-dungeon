import { edgeSegment, wallSegments, wallShadows } from '../../src/render/walls';
import { door, emptyMap, room, withContent } from '../core/fixtures';

describe('walls', () => {
  it('edgeSegment spans one square', () => {
    expect(edgeSegment({ x: 2, y: 3, side: 'N' })).toEqual({ x1: 2, y1: 3, x2: 3, y2: 3 });
    expect(edgeSegment({ x: 2, y: 3, side: 'W' })).toEqual({ x1: 2, y1: 3, x2: 2, y2: 4 });
  });
  it('merges a lone room into four sides', () => {
    const m = withContent(emptyMap(), [room('a', 1, 1, 3, 2)]);
    expect(wallSegments(m)).toEqual(
      expect.arrayContaining([
        { x1: 1, y1: 1, x2: 4, y2: 1 },
        { x1: 1, y1: 3, x2: 4, y2: 3 },
        { x1: 1, y1: 1, x2: 1, y2: 3 },
        { x1: 4, y1: 1, x2: 4, y2: 3 },
      ]),
    );
    expect(wallSegments(m)).toHaveLength(4);
  });
  it('splits a wall around a door', () => {
    const m = withContent(emptyMap(), [room('a', 1, 1, 3, 1)], [door('d', 2, 1, 'N')]);
    const top = wallSegments(m).filter((s) => s.y1 === 1 && s.y2 === 1);
    expect(top).toEqual(
      expect.arrayContaining([
        { x1: 1, y1: 1, x2: 2, y2: 1 },
        { x1: 3, y1: 1, x2: 4, y2: 1 },
      ]),
    );
  });
  it('shadows fall on the floor side, both sides of a shared wall', () => {
    const lone = withContent(emptyMap(), [room('a', 1, 1, 1, 1)]);
    expect(wallShadows(lone).map((s) => s.inward).sort()).toEqual(['E', 'N', 'S', 'W']);
    const pair = withContent(emptyMap(), [room('a', 1, 1, 1, 1), room('b', 2, 1, 1, 1)]);
    const shared = wallShadows(pair).filter((s) => s.seg.x1 === 2 && s.seg.x2 === 2);
    expect(shared.map((s) => s.inward).sort()).toEqual(['E', 'W']);
  });
});
