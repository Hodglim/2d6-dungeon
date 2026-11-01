import { levelTables } from '../systems/dungeon/roomTables';
import type { DungeonTables } from '../systems/dungeon/tables';

/** "Level N · Name"; just "Level N" when the table file gives no name for that level. */
export function levelLabel(t: DungeonTables | null, level: number): string {
  const name = levelTables(t, level)?.name;
  return name ? `Level ${level} · ${name}` : `Level ${level}`;
}
