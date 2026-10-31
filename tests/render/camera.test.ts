import { clampScale, fitCamera, MAX_SCALE, MIN_SCALE, panBy, screenToWorld, worldBounds, worldToScreen, zoomAt } from '../../src/render/camera';
import { emptyMap } from '../core/fixtures';

describe('camera', () => {
  const cam = { x: 2, y: 3, scale: 10 };
  it('converts world ↔ screen', () => {
    expect(worldToScreen(cam, { x: 4, y: 5 })).toEqual({ x: 20, y: 20 });
    expect(screenToWorld(cam, { x: 20, y: 20 })).toEqual({ x: 4, y: 5 });
  });
  it('world bounds include a one-square ring', () => {
    expect(worldBounds(emptyMap(10, 8))).toEqual({ x: -1, y: -1, w: 12, h: 10 });
  });
  it('fits and centres the bounds in the view', () => {
    const c = fitCamera({ x: 0, y: 0, w: 10, h: 5 }, 220, 220, 10);
    expect(c.scale).toBe(20);
    expect(worldToScreen(c, { x: 5, y: 2.5 })).toEqual({ x: 110, y: 110 });
  });
  it('fits a 100x100 map into a 400px view with everything visible', () => {
    const b = worldBounds(emptyMap(100, 100));
    const c = fitCamera(b, 400, 400, 0);
    expect(c.scale).toBeGreaterThanOrEqual(MIN_SCALE);
    for (const p of [{ x: b.x, y: b.y }, { x: b.x + b.w, y: b.y + b.h }]) {
      const s = worldToScreen(c, p);
      expect(s.x).toBeGreaterThanOrEqual(-1e-6);
      expect(s.y).toBeGreaterThanOrEqual(-1e-6);
      expect(s.x).toBeLessThanOrEqual(400 + 1e-6);
      expect(s.y).toBeLessThanOrEqual(400 + 1e-6);
    }
  });
  it('zooms around the pointer', () => {
    const z = zoomAt(cam, 2, { x: 50, y: 40 });
    expect(z.scale).toBe(20);
    expect(screenToWorld(z, { x: 50, y: 40 })).toEqual(screenToWorld(cam, { x: 50, y: 40 }));
  });
  it('pans with the pointer', () => {
    expect(panBy(cam, 10, -20)).toEqual({ x: 1, y: 5, scale: 10 });
  });
  it('clamps scale', () => {
    expect(clampScale(1)).toBe(MIN_SCALE);
    expect(clampScale(1e6)).toBe(MAX_SCALE);
  });
});
