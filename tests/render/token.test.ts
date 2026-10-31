import { footprints, pathPosition, walkTrail } from '../../src/render/token';
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
  it('handles a single-point path', () => {
    expect(pathPosition([{ x: 3, y: 4 }], 0)).toEqual({ x: 3.5, y: 4.5, done: true });
  });
  it('clamps negative distance to the start', () => {
    expect(pathPosition(path, -2)).toEqual({ x: 1.5, y: 1.5, done: false });
  });
  it('treats NaN as the start and Infinity as the end', () => {
    expect(pathPosition(path, NaN)).toEqual({ x: 1.5, y: 1.5, done: false });
    expect(pathPosition(path, Infinity)).toEqual({ x: 2.5, y: 2.5, done: true });
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

describe('walkTrail', () => {
  const c = (x: number, y: number) => ({ x, y });
  // The move is committed before the walk animates, so the trail already ends with the path
  // (minus its destination).
  const path = [c(1, 1), c(2, 1), c(3, 1), c(4, 1)];
  const committed = [c(0, 0), c(0, 1), c(1, 1), c(2, 1), c(3, 1)];

  it('starts from the pre-walk trail and adds only the squares passed so far', () => {
    expect(walkTrail(committed, path, 0)).toEqual([c(0, 0), c(0, 1)]);
    expect(walkTrail(committed, path, 2)).toEqual([c(0, 0), c(0, 1), c(1, 1), c(2, 1)]);
    expect(walkTrail(committed, path, 3)).toEqual(committed);
  });
  it('never slices below an empty trail', () => {
    expect(walkTrail([c(1, 1)], path, 1)).toEqual([c(1, 1)]);
    expect(walkTrail([], path, 0)).toEqual([]);
  });
});
