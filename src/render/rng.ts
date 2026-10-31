/** Small, fast seeded PRNG (mulberry32). Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable seed for one grid square, so its decoration never changes between redraws. */
export function cellSeed(seed: number, x: number, y: number, salt = 0): number {
  let h = (seed ^ 0x9e3779b9) >>> 0;
  for (const v of [x, y, salt]) {
    h = Math.imul(h ^ (v | 0), 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;
  }
  return h;
}

export function cellRng(seed: number, x: number, y: number, salt = 0): () => number {
  return mulberry32(cellSeed(seed, x, y, salt));
}
