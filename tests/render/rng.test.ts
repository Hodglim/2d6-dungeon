import { cellRng, cellSeed, mulberry32 } from '../../src/render/rng';

describe('rng', () => {
  it('is deterministic for a seed', () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('produces values in [0, 1)', () => {
    const r = mulberry32(123);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('gives different squares different seeds, stable per square', () => {
    expect(cellSeed(1, 2, 3)).toBe(cellSeed(1, 2, 3));
    expect(cellSeed(1, 2, 3)).not.toBe(cellSeed(1, 3, 2));
    expect(cellSeed(1, 2, 3, 0)).not.toBe(cellSeed(1, 2, 3, 1));
    expect(cellRng(9, -1, 4)()).toBe(cellRng(9, -1, 4)());
  });
});
