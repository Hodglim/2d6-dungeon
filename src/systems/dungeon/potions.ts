/** The potions a table file knows about, for picking one onto the hero sheet. Pure. */
import type { DungeonTables } from './tables';

export interface KnownPotion {
  name: string;
  effect: string;
}

/**
 * The starting potions and the `potions` list (as one group, by name), then the potion bombs.
 * Each name appears once (capitals don't matter; the first one found is kept); empty groups are
 * left out.
 */
export function knownPotions(t: DungeonTables | null): { label: string; items: KnownPotion[] }[] {
  if (!t) return [];
  const seen = new Set<string>();
  const take = (list: readonly KnownPotion[]) =>
    list
      .filter((p) => {
        const k = p.name.trim().toLowerCase();
        if (!k || seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .map((p) => ({ name: p.name, effect: p.effect }));
  const byName = (a: KnownPotion, b: KnownPotion) => a.name.localeCompare(b.name);
  const potions = take([...(t.tables.starting?.potions ?? []), ...(t.tables.potions ?? [])]).sort(byName);
  const bombs = take(t.tables.potionBombs ?? []).sort(byName);
  return [
    { label: 'Potions', items: potions },
    { label: 'Potion bombs', items: bombs },
  ].filter((g) => g.items.length > 0);
}

/**
 * The known potion a rolled table row names, with the potion list's name and effect: the first
 * cell whose whole text is a known potion's name (capitals and spaces at the ends don't matter).
 */
export function potionInRow(t: DungeonTables | null, cells: readonly string[]): KnownPotion | null {
  const all = knownPotions(t).flatMap((g) => g.items);
  for (const c of cells) {
    const k = c.trim().toLowerCase();
    const p = all.find((x) => x.name.trim().toLowerCase() === k);
    if (p) return p;
  }
  return null;
}
