import { floorDecals, floorTiles } from '../../src/render/floor';
import { emptyMap, room, withContent } from '../core/fixtures';

describe('floor', () => {
  const map = withContent(emptyMap(10, 10), [room('a', 1, 1, 3, 2), room('b', 6, 6, 2, 2)]);
  it('has one tile per floor square with a valid shade', () => {
    const tiles = floorTiles(map, 3);
    expect(tiles).toHaveLength(10);
    for (const t of tiles) expect([0, 1, 2]).toContain(t.shade);
  });
  it('decals are deterministic and inside their square', () => {
    const big = withContent(emptyMap(20, 20), [room('a', 0, 0, 20, 20)]);
    const decals = floorDecals(big);
    expect(floorDecals(big)).toEqual(decals);
    expect(decals.length).toBeGreaterThan(0);
    expect(decals.length).toBeLessThan(400);
    for (const d of decals) {
      expect(d.x - Math.floor(d.x)).toBeGreaterThanOrEqual(0.2);
      expect(d.x - Math.floor(d.x)).toBeLessThanOrEqual(0.8);
    }
  });
});
