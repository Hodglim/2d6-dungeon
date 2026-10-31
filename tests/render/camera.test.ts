import { clampCamera, clampScale, pinchCamera, wheelFactor, fitCamera, MAX_SCALE, MIN_SCALE, panBy, screenToWorld, worldBounds, worldToScreen, zoomAt } from '../../src/render/camera';
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

describe('touch and clamp helpers', () => {
  const bounds = { x: -1, y: -1, w: 12, h: 10 };
  const visible = (c: { x: number; y: number; scale: number }, w: number, h: number, m: number) => {
    const l = (bounds.x - c.x) * c.scale;
    const r = (bounds.x + bounds.w - c.x) * c.scale;
    const t = (bounds.y - c.y) * c.scale;
    const b = (bounds.y + bounds.h - c.y) * c.scale;
    return r >= m - 1e-6 && l <= w - m + 1e-6 && b >= m - 1e-6 && t <= h - m + 1e-6;
  };

  it('clampCamera keeps the margin on screen at any pan', () => {
    for (const [x, y] of [[-500, -500], [500, 500], [-500, 500], [500, -500], [0, 0]]) {
      const c = clampCamera({ x: x!, y: y!, scale: 20 }, bounds, 800, 600, 64);
      expect(visible(c, 800, 600, 64)).toBe(true);
    }
  });
  it('clampCamera leaves a good camera alone', () => {
    const c = { x: 0, y: 0, scale: 20 };
    expect(clampCamera(c, bounds, 800, 600)).toEqual(c);
  });
  it('clampCamera holds after the viewport changes 1180x820 -> 820x1180', () => {
    const c = clampCamera({ x: 400, y: -300, scale: 30 }, bounds, 1180, 820, 64);
    expect(visible(c, 1180, 820, 64)).toBe(true);
    const d = clampCamera(c, bounds, 820, 1180, 64);
    expect(visible(d, 820, 1180, 64)).toBe(true);
  });

  it('pinch doubles scale and keeps the midpoint world point fixed', () => {
    const c = { x: 2, y: 3, scale: 10 };
    const before: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 100, y: 100 }, { x: 200, y: 100 }];
    const after: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 50, y: 100 }, { x: 250, y: 100 }];
    const n = pinchCamera(c, before, after);
    expect(n.scale).toBeCloseTo(20);
    const w0 = screenToWorld(c, { x: 150, y: 100 });
    const w1 = screenToWorld(n, { x: 150, y: 100 });
    expect(w1.x).toBeCloseTo(w0.x);
    expect(w1.y).toBeCloseTo(w0.y);
  });
  it('a two-finger translate pans', () => {
    const c = { x: 2, y: 3, scale: 10 };
    const n = pinchCamera(c, [{ x: 100, y: 100 }, { x: 200, y: 100 }], [{ x: 130, y: 120 }, { x: 230, y: 120 }]);
    expect(n.scale).toBeCloseTo(10);
    expect(n.x).toBeCloseTo(c.x - 3);
    expect(n.y).toBeCloseTo(c.y - 2);
  });

  it('wheelFactor zooms by direction and normalises line mode', () => {
    expect(wheelFactor(100, 0)).toBeLessThan(1);
    expect(wheelFactor(-100, 0)).toBeGreaterThan(1);
    expect(wheelFactor(3, 1)).toBeCloseTo(wheelFactor(48, 0));
  });
});
