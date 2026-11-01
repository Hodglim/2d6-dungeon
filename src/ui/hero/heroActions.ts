/** Pure quick-strip helpers: each returns the next Hero. The panel runs them through History. */
import { setHero } from '../../core/commands';
import type { ExecResult, History } from '../../core/history';
import { heroEdit, type Hero } from '../../systems/dungeon/hero';

export type Coin = 'gc' | 'sc' | 'cc';
export type StringList = 'largeItems' | 'smallItems' | 'lootLockup' | 'treasure' | 'prisoners' | 'sideQuests';

/** HP may pass the baseline and may fall to zero or below. */
export const adjustHp = (h: Hero, d: number): Hero => ({ ...h, hp: h.hp + d });

export const addXp = (h: Hero, n: number): Hero => ({ ...h, xp: h.xp + n });

export const adjustCoin = (h: Hero, coin: Coin, d: number): Hero => ({
  ...h,
  coins: { ...h.coins, [coin]: Math.max(0, h.coins[coin] + d) },
});

export function addItem(h: Hero, size: 'large' | 'small', text: string): Hero {
  const t = text.trim();
  if (!t) return h;
  const key = size === 'large' ? 'largeItems' : 'smallItems';
  return { ...h, [key]: [...h[key], t] };
}

export function removeItem(h: Hero, list: StringList, index: number): Hero {
  if (index < 0 || index >= h[list].length) return h;
  return { ...h, [list]: h[list].filter((_, i) => i !== index) };
}

/**
 * Run a hero edit through History. A merging tap is labelled from the hero as it was before the
 * whole run of taps, so five -1 taps read "HP −5". Typed edits pass no mergeKey.
 */
export function commitHero(history: History, next: Hero, opts: { label?: string; mergeKey?: string } = {}): ExecResult {
  const now = history.hero as Hero;
  // Dev guard: a reactive proxy leaking into the hero fails here, not later at save time.
  if (import.meta.env?.DEV) structuredClone(next);
  const merging = opts.mergeKey !== undefined && history.canMerge(opts.mergeKey);
  const base = merging ? ((history.heroBeforeLast as Hero | null) ?? now) : now;
  // A run of taps that nets out to nothing leaves no step behind.
  if (merging && JSON.stringify(next) === JSON.stringify(base)) {
    history.undo();
    return { ok: true };
  }
  return history.execute(setHero(next, opts.label ?? heroEdit(base, next)), { mergeKey: opts.mergeKey });
}
