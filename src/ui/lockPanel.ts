// Which part of the lock panel a door is at, worked out from the door itself (so Undo just works).
import { isChecked } from '../core/doorLock';
import type { Door } from '../core/types';
import { lockGate } from '../systems/dungeon/locks';
import type { DungeonTables } from '../systems/dungeon/tables';

export type LockStage = 'check' | 'choices' | 'open' | 'gone';

export function lockStage(door: Door, tables: DungeonTables | null): LockStage {
  const gate = lockGate(door, tables);
  if (gate === 'check') return 'check';
  if (gate === 'locked') return 'choices';
  return isChecked(door) ? 'open' : 'gone';
}

/** Changes whenever the panel should drop back to its three choices (Undo, a new check, a failed pick). */
export const lockViewKey = (door: Door, tables: DungeonTables | null): string => `${lockStage(door, tables)}|${door.lock?.damaged === true}`;
