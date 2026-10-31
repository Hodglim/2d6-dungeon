import { describe, expect, it } from 'vitest';
import { cacheScaleFor } from '../../src/render/renderer';

describe('cacheScaleFor', () => {
  it('leaves the wanted scale alone for small maps', () => {
    expect(cacheScaleFor(48, 20, 20)).toBe(48);
  });

  it('keeps big maps within iOS-safe canvas limits', () => {
    const s = cacheScaleFor(96, 102, 102); // 100x100 map: world 102, cache 104 squares per side
    expect(s).toBeLessThanOrEqual(4096 / 104);
    expect(104 * s * 104 * s).toBeLessThanOrEqual(16_000_000);
  });
});
