import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SOUND_KEY, isSoundEnabled, playClack, playTick, resetSoundForTests, setSoundEnabled, unlockAudio } from '../../src/ui/sound';

function fakeStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
}

describe('sound', () => {
  beforeEach(() => {
    resetSoundForTests();
    vi.stubGlobal('localStorage', fakeStorage());
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is on by default and remembers the setting', () => {
    expect(isSoundEnabled()).toBe(true);
    setSoundEnabled(false);
    expect(localStorage.getItem(SOUND_KEY)).toBe('0');
    resetSoundForTests();
    expect(isSoundEnabled()).toBe(false);
    setSoundEnabled(true);
    resetSoundForTests();
    expect(isSoundEnabled()).toBe(true);
  });

  it('survives unavailable storage', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('no');
      },
      setItem: () => {
        throw new Error('no');
      },
    });
    expect(isSoundEnabled()).toBe(true);
    expect(() => setSoundEnabled(false)).not.toThrow();
    expect(isSoundEnabled()).toBe(false);
  });

  it('does nothing and does not throw without AudioContext', () => {
    vi.stubGlobal('AudioContext', undefined);
    expect(() => {
      unlockAudio();
      playTick();
      playClack();
    }).not.toThrow();
  });

  it('does not create a context while disabled', () => {
    const ctor = vi.fn();
    vi.stubGlobal('AudioContext', ctor);
    setSoundEnabled(false);
    unlockAudio();
    expect(ctor).not.toHaveBeenCalled();
  });

  it('creates the context lazily on unlock and survives a throwing constructor', () => {
    const ctor = vi.fn(() => {
      throw new Error('blocked');
    });
    vi.stubGlobal('AudioContext', ctor);
    expect(ctor).not.toHaveBeenCalled();
    expect(() => unlockAudio()).not.toThrow();
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(() => playClack()).not.toThrow();
  });
});
