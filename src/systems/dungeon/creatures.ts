import type { CardPack, CreatureCard } from './cards';
import type { CreatureStats, CreatureTableEntry, DungeonTables } from './tables';

export function findCreature(t: DungeonTables | null, name: string): { name: string; stats: CreatureStats } | null {
  const creatures = t?.tables.creatures;
  if (!creatures) return null;
  const want = name.trim().toLowerCase();
  for (const [key, stats] of Object.entries(creatures)) {
    if (key.toLowerCase() === want) return { name: key, stats };
  }
  return null;
}

export function findCard(pack: CardPack | null, name: string): CreatureCard | null {
  if (!pack) return null;
  const want = name.trim().toLowerCase();
  return pack.cards.find((c) => c.name.toLowerCase() === want) ?? null;
}

export interface CreatureRoll { die: number; modifier: number; total: number; entry: CreatureTableEntry }

export function rollCreatureTable(t: DungeonTables, code: string, die: number, modifier: number): CreatureRoll | null {
  const table = t.tables.creatureTables?.[code];
  if (!table) return null;
  const total = Math.min(6, Math.max(1, die + modifier));
  const entry = table[String(total)];
  if (!entry) return null;
  return { die, modifier, total, entry };
}
