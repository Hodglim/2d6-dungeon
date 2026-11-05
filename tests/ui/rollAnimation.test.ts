import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { animateRoll } from '../../src/ui/rollAnimation';

describe('animateRoll', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('spins, lands each die in turn on its final face, then finishes', () => {
    const shown: number[][] = [];
    const landed: number[] = [];
    const done = vi.fn();
    animateRoll([3, 5], 6, { faces: (f) => shown.push([...f]), land: (i) => landed.push(i), done });
    expect(shown.length).toBe(1);
    vi.advanceTimersByTime(900);
    expect(landed).toEqual([0]);
    expect(shown[shown.length - 1]![0]).toBe(3);
    vi.advanceTimersByTime(120);
    expect(landed).toEqual([0, 1]);
    expect(shown[shown.length - 1]).toEqual([3, 5]);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(done).toHaveBeenCalledTimes(1);
    for (const f of shown) for (const v of f) expect(v >= 1 && v <= 6).toBe(true);
  });
  it('keeps spinning faces within the given number of sides', () => {
    const shown: number[][] = [];
    animateRoll([2], 3, { faces: (f) => shown.push([...f]), land: () => {}, done: () => {} });
    vi.advanceTimersByTime(2000);
    for (const f of shown) expect(f[0]! >= 1 && f[0]! <= 3).toBe(true);
  });
  it('with reduced motion shows the final faces at once', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const shown: number[][] = [];
    const done = vi.fn();
    animateRoll([6, 1], 6, { faces: (f) => shown.push([...f]), land: () => {}, done });
    expect(shown).toEqual([[6, 1]]);
    vi.advanceTimersByTime(300);
    expect(done).toHaveBeenCalledTimes(1);
  });
  it('cancel stops it before it finishes', () => {
    const done = vi.fn();
    const cancel = animateRoll([4], 6, { faces: () => {}, land: () => {}, done });
    vi.advanceTimersByTime(100);
    cancel();
    vi.advanceTimersByTime(5000);
    expect(done).not.toHaveBeenCalled();
  });
});
