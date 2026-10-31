export type IdFn = () => string;

/**
 * A random RFC 4122 v4 UUID. crypto.randomUUID exists only in secure contexts (HTTPS or
 * localhost); a tablet opening the dev server over plain HTTP falls back to getRandomValues.
 */
export const randomId: IdFn = () =>
  typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : uuidFromRandomValues();

function uuidFromRandomValues(): string {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6]! & 0x0f) | 0x40; // version 4
  b[8] = (b[8]! & 0x3f) | 0x80; // variant 10xx
  const hex = Array.from(b, (n) => n.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Deterministic ids for tests: prefix-1, prefix-2, ... */
export function sequentialIds(prefix = 'id'): IdFn {
  let n = 0;
  return () => `${prefix}-${++n}`;
}
