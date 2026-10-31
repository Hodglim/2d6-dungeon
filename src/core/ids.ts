export type IdFn = () => string;

export const randomId: IdFn = () => crypto.randomUUID();

/** Deterministic ids for tests: prefix-1, prefix-2, ... */
export function sequentialIds(prefix = 'id'): IdFn {
  let n = 0;
  return () => `${prefix}-${++n}`;
}
