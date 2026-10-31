import { describe, expect, it } from 'vitest';
import { randomId } from '../../src/core/ids';

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('randomId', () => {
  it('uses crypto.randomUUID when available', () => {
    expect(randomId()).toMatch(V4);
  });

  it('falls back to getRandomValues where randomUUID is missing (plain HTTP)', () => {
    const had = Object.prototype.hasOwnProperty.call(crypto, 'randomUUID');
    const own = had ? Object.getOwnPropertyDescriptor(crypto, 'randomUUID') : undefined;
    // Shadow the method (it lives on Crypto.prototype) the way an insecure context lacks it.
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true, writable: true });
    try {
      expect(crypto.randomUUID).toBeUndefined();
      const ids = Array.from({ length: 100 }, () => randomId());
      for (const id of ids) expect(id).toMatch(V4);
      expect(new Set(ids).size).toBe(100);
    } finally {
      if (own) Object.defineProperty(crypto, 'randomUUID', own);
      else delete (crypto as { randomUUID?: unknown }).randomUUID;
    }
    expect(typeof crypto.randomUUID).toBe('function');
  });
});
