import { battleSplats, floorDecals, floorTiles } from '../../src/render/floor';
import { door, emptyMap, room, withContent } from '../core/fixtures';

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

describe('battle splats', () => {
  const won = (battles?: number) => ({ ...room('a', 1, 1, 4, 3), ...(battles === undefined ? {} : { battles }) });
  const mapWith = (battles?: number, doors = [] as ReturnType<typeof door>[]) => withContent(emptyMap(10, 10), [won(battles), room('b', 6, 6, 2, 2)], doors);
  const cell = (s: { x: number; y: number }) => `${Math.floor(s.x)},${Math.floor(s.y)}`;

  it('none in rooms where no fight was won', () => {
    expect(battleSplats(mapWith(), [])).toEqual([]);
  });

  it('two for one won fight, one more per fight after, at most four', () => {
    expect(battleSplats(mapWith(1), [])).toHaveLength(2);
    expect(battleSplats(mapWith(2), [])).toHaveLength(3);
    expect(battleSplats(mapWith(3), [])).toHaveLength(4);
    expect(battleSplats(mapWith(9), [])).toHaveLength(4);
  });

  it('never more than the room has squares', () => {
    const tiny = withContent(emptyMap(10, 10), [{ ...room('c', 2, 2, 1, 2, 'corridor'), battles: 5 }]);
    expect(battleSplats(tiny, [])).toHaveLength(2);
  });

  it('are the same every time, each in its own square inside the room', () => {
    const m = mapWith(3);
    const s = battleSplats(m, []);
    expect(battleSplats(m, [])).toEqual(s);
    expect(new Set(s.map(cell)).size).toBe(s.length);
    for (const p of s) {
      expect(p.x).toBeGreaterThan(1);
      expect(p.x).toBeLessThan(5);
      expect(p.y).toBeGreaterThan(1);
      expect(p.y).toBeLessThan(4);
    }
  });

  it('keep their places when another fight is won there', () => {
    const one = battleSplats(mapWith(1), []);
    expect(battleSplats(mapWith(2), []).slice(0, 2)).toEqual(one);
  });

  it('keep off the label and the squares beside a doorway', () => {
    const label = { x: 2, y: 1, w: 2, h: 1 }; // squares 2,1 and 3,1
    const doors = [door('d1', 1, 2, 'W'), door('d2', 4, 4, 'N')]; // squares 1,2 and 4,3
    for (let battles = 1; battles <= 4; battles++) {
      const cells = battleSplats(mapWith(battles, doors), [label]).map(cell);
      for (const banned of ['2,1', '3,1', '1,2', '4,3']) expect(cells).not.toContain(banned);
    }
  });

  it('still show when every square is near a label or doorway', () => {
    const covered = { x: 1, y: 1, w: 4, h: 3 };
    expect(battleSplats(mapWith(1), [covered])).toHaveLength(2);
  });
});
