import { describe, expect, it } from 'vitest';
import { type DisplayEnv, isIosSafari, isStandalone } from '../../src/persistence/standalone';

const base: DisplayEnv = {
  matchStandalone: false,
  userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36',
  maxTouchPoints: 0,
  platform: 'Linux x86_64',
};

describe('isStandalone', () => {
  it('is true for the standalone display mode', () => {
    expect(isStandalone({ ...base, matchStandalone: true })).toBe(true);
  });
  it('is true for navigator.standalone', () => {
    expect(isStandalone({ ...base, navigatorStandalone: true })).toBe(true);
  });
  it('is false otherwise', () => {
    expect(isStandalone(base)).toBe(false);
    expect(isStandalone({ ...base, navigatorStandalone: false })).toBe(false);
  });
});

describe('isIosSafari', () => {
  it('is true for an iPad user agent', () => {
    expect(isIosSafari({ ...base, userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1', platform: 'iPad' })).toBe(true);
  });
  it('is true for an iPhone user agent', () => {
    expect(isIosSafari({ ...base, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' })).toBe(true);
  });
  it('is true for iPadOS posing as a Mac', () => {
    expect(isIosSafari({ ...base, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15', platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true);
  });
  it('is false for a real Mac and for desktop Chrome on Linux', () => {
    expect(isIosSafari({ ...base, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false);
    expect(isIosSafari(base)).toBe(false);
  });
});
