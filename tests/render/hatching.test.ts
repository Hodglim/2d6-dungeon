import { floorLookup, hatchStrokes } from '../../src/render/hatching';
import { emptyMap, room, withContent } from '../core/fixtures';

describe('hatching', () => {
  const map = withContent(emptyMap(10, 10), [room('a', 4, 4, 2, 2)]);
  it('is identical on every call', () => {
    expect(hatchStrokes(map, 1.6)).toEqual(hatchStrokes(map, 1.6));
  });
  it('changes with the map seed', () => {
    expect(hatchStrokes({ ...map, seed: 2 }, 1.6)).not.toEqual(hatchStrokes(map, 1.6));
  });
  it('only hatches rock within reach of the floor', () => {
    const strokes = hatchStrokes(map, 1.6);
    expect(strokes.length).toBeGreaterThan(0);
    for (const s of strokes) {
      const mx = (s.x1 + s.x2) / 2;
      const my = (s.y1 + s.y2) / 2;
      // Stroke centres sit in squares at most 2 away from the 2x2 room at (4..5, 4..5).
      expect(mx).toBeGreaterThan(2 - 0.2);
      expect(mx).toBeLessThan(8 + 0.2);
      expect(my).toBeGreaterThan(2 - 0.2);
      expect(my).toBeLessThan(8 + 0.2);
    }
  });
  it('is denser and darker next to the wall', () => {
    const strokes = hatchStrokes(map, 1.6);
    const near = strokes.filter((s) => s.alpha > 0.5).length;
    const far = strokes.filter((s) => s.alpha <= 0.5).length;
    expect(near).toBeGreaterThan(far);
  });
  it('produces nothing on an empty map', () => {
    expect(hatchStrokes(emptyMap(5, 5), 1.6)).toEqual([]);
  });
  it('floorLookup matches room squares', () => {
    const isFloor = floorLookup(map, 2);
    expect(isFloor(4, 4)).toBe(true);
    expect(isFloor(6, 4)).toBe(false);
    expect(isFloor(-50, 0)).toBe(false);
  });
});
