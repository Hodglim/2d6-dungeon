import { describe, expect, it } from 'vitest';
import { cacheScaleFor, fadedExits, staticChanged } from '../../src/render/renderer';
import { setToken } from '../../src/core/commands';
import { door, emptyMap, room, withContent } from '../core/fixtures';

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

describe('fadedExits', () => {
  // Rooms A (x1..2) and B (x4..5) with one open exit each.
  const base = withContent(
    emptyMap(10, 10),
    [room('A', 1, 1, 2, 2), room('B', 4, 1, 2, 2)],
    [door('dA', 1, 3, 'N'), door('dB', 4, 3, 'N')],
  );
  const map = { ...base, token: { x: 5, y: 1, trail: [] } };

  it('fades exits away from the room the token is in', () => {
    expect([...fadedExits(map)]).toEqual(['dA']);
  });
  it('can be asked about another square (the animated token mid-walk)', () => {
    expect([...fadedExits(map, { x: 1, y: 1 })]).toEqual(['dB']);
  });
});

describe('staticChanged', () => {
  const a = withContent(emptyMap(10, 10), [room('A', 1, 1, 2, 2)], [door('dA', 1, 3, 'N')]);
  const withToken = { ...a, token: { x: 1, y: 1, trail: [] } };

  it('is false when only the token changed (commands share unchanged arrays)', () => {
    const moved = setToken(withToken.token, { x: 2, y: 2, trail: [{ x: 1, y: 1 }] }).apply(withToken);
    expect(moved).not.toBe(withToken);
    expect(staticChanged(withToken, moved)).toBe(false);
    expect(staticChanged(a, { ...a, title: 'Renamed' })).toBe(false);
  });
  it('is true for a first map or any static field change', () => {
    expect(staticChanged(null, a)).toBe(true);
    expect(staticChanged(a, { ...a, rooms: [...a.rooms] })).toBe(true);
    expect(staticChanged(a, { ...a, doors: [] })).toBe(true);
    expect(staticChanged(a, { ...a, features: [] })).toBe(true);
    expect(staticChanged(a, { ...a, seed: a.seed + 1 })).toBe(true);
    expect(staticChanged(a, { ...a, width: 11 })).toBe(true);
    expect(staticChanged(a, { ...a, height: 11 })).toBe(true);
    expect(staticChanged(a, { ...a, themeId: 'other' })).toBe(true);
  });
});
