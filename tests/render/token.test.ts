import { footprints, pathPosition } from '../../src/render/token';
import { emptyMap, room, withContent } from '../core/fixtures';

describe('pathPosition', () => {
  const path = [
    { x: 1, y: 1 },
    { x: 2, y: 1 },
    { x: 2, y: 2 },
  ];
  it('interpolates between square centres', () => {
    expect(pathPosition(path, 0)).toEqual({ x: 1.5, y: 1.5, done: false });
    expect(pathPosition(path, 0.5)).toEqual({ x: 2, y: 1.5, done: false });
    expect(pathPosition(path, 1.5)).toEqual({ x: 2.5, y: 2, done: false });
  });
  it('finishes at the last square', () => {
    expect(pathPosition(path, 5)).toEqual({ x: 2.5, y: 2.5, done: true });
  });
});

describe('footprints', () => {
  const map = withContent(emptyMap(), [room('a', 0, 0, 5, 1)]);
  it('alternates feet and fades older prints', () => {
    const prints = footprints(map, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], { x: 3, y: 0 });
    expect(prints.map((p) => p.left)).toEqual([true, false, true]);
    expect(prints[0]!.age).toBeGreaterThan(prints[2]!.age);
    expect(prints[2]!.age).toBe(0);
    // Heading east.
    for (const p of prints) expect(p.angle).toBeCloseTo(0);
  });
  it('skips squares that are no longer floor', () => {
    const prints = footprints(map, [{ x: 9, y: 9 }, { x: 0, y: 0 }], { x: 1, y: 0 });
    expect(prints).toHaveLength(1);
  });
});
