import type { RefGroup, RefRoll, RefTable } from '../../systems/dungeon/referenceTables';
import type { DungeonTables } from '../../systems/dungeon/tables';
import type { CardKind } from '../../systems/dungeon/cards';

export { isSlug } from '../../systems/dungeon/encounterText';

/**
 * The Tables pane: which table is open, the way back, and each table's modifier and last result.
 * Held by the app shell (so it survives switching tabs); never part of the game or its History.
 */
export interface TablesState {
  open: string | null;
  back: { code: string; modifier: number }[];
  modifier: Record<string, number>;
  results: Record<string, RefRoll>;
  /** Totals of dice amounts rolled in each table's result ("2D6 +10 SC" = 17), by "cell:part"; a new result clears them. */
  totals: Record<string, Record<string, string>>;
  /** Tables whose current result's potion has gone to the hero (so it isn't added twice); a new result clears it. */
  potionAdded: Record<string, true>;
  query: string;
  /** A table group, or a kind of card (gods, herbs) from the card pack, shown as pictures. */
  group: TablesGroup;
}

export type TablesGroup = RefGroup | 'all' | CardKind;

export const initialTablesState: TablesState = { open: null, back: [], modifier: {}, results: {}, totals: {}, potionAdded: {}, query: '', group: 'all' };

export const GROUP_ORDER: RefGroup[] = ['generic', 'random', 'loot', 'level', 'optional'];

/** Open a table with a modifier (default 0); the table open before it goes on the back stack with its modifier. */
export function openTable(s: TablesState, code: string, modifier = 0): TablesState {
  const back = s.open !== null && s.open !== code ? [...s.back, { code: s.open, modifier: s.modifier[s.open] ?? 0 }] : s.back;
  return { ...s, open: code, back, modifier: { ...s.modifier, [code]: modifier } };
}

/** Return to the previous table with the modifier it had; its result is still there. */
export function goBack(s: TablesState): TablesState {
  const prev = s.back[s.back.length - 1];
  if (!prev) return s;
  return { ...s, open: prev.code, back: s.back.slice(0, -1), modifier: { ...s.modifier, [prev.code]: prev.modifier } };
}

/** Back to the list: nothing to go back to from there. Results stay. */
export function showList(s: TablesState): TablesState {
  return { ...s, open: null, back: [] };
}

export function setModifier(s: TablesState, code: string, modifier: number): TablesState {
  return { ...s, modifier: { ...s.modifier, [code]: modifier } };
}

/** A new result for a table; the totals of amounts rolled in its old result, and its potion's added mark, go. */
export function setResult(s: TablesState, code: string, r: RefRoll): TablesState {
  const { [code]: _old, ...totals } = s.totals;
  const { [code]: _added, ...potionAdded } = s.potionAdded;
  return { ...s, results: { ...s.results, [code]: r }, totals, potionAdded };
}

/** The potion in a table's current result went to the hero. */
export function markPotionAdded(s: TablesState, code: string): TablesState {
  return { ...s, potionAdded: { ...s.potionAdded, [code]: true } };
}

/** The total of a dice amount rolled in a table's result, by "cell:part". */
export function setTotal(s: TablesState, code: string, key: string, total: string): TablesState {
  return { ...s, totals: { ...s.totals, [code]: { ...s.totals[code], [key]: total } } };
}

/** Tables whose code or name contains the query (any case), in the group (none for a card kind); sorted by group, then page, then code. */
export function searchTables(t: DungeonTables | null, query: string, group: TablesGroup): { code: string; table: RefTable }[] {
  const all = t?.tables.referenceTables;
  if (!all) return [];
  const q = query.trim().toLowerCase();
  return Object.entries(all)
    .filter(([code, table]) => (group === 'all' || table.group === group) && (q === '' || code.toLowerCase().includes(q) || table.name.toLowerCase().includes(q)))
    .map(([code, table]) => ({ code, table }))
    .sort(
      (a, b) =>
        GROUP_ORDER.indexOf(a.table.group) - GROUP_ORDER.indexOf(b.table.group) ||
        a.table.page - b.table.page ||
        (a.code < b.code ? -1 : a.code > b.code ? 1 : 0),
    );
}
