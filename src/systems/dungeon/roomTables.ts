/** Room-table lookups, unique-room re-rolls and the command that applies a roll to a room. */

import type { Command } from '../../core/commands';
import { cellEdge, perimeterEdges, step } from '../../core/geometry';
import { doorAt, roomsAcross } from '../../core/query';
import type { DungeonMap, Rect, Room, RoomContents } from '../../core/types';
import { classify, rollD6, type Rng, type RoomSize } from './rules';
import type { DungeonTables, ExitSpec, LevelTables, RoomEntry, SmallRoomEntry } from './tables';

export type RoomTableKind = RoomContents['table'];
type Entry = RoomEntry | SmallRoomEntry;

export const MAX_ROLL_ATTEMPTS = 50;

/** Which table a placed room uses; null for corridors (no Room step). */
export function tableKindFor(rect: Pick<Rect, 'w' | 'h'>, size: RoomSize): RoomTableKind | null {
  const c = classify(rect, size);
  return c === 'corridor' ? null : c === 'small' ? 'small' : c === 'large' ? 'large' : 'rooms';
}

export function levelTables(t: DungeonTables | null, level: number): LevelTables | null {
  return t?.tables.dungeonLevels?.find((l) => l.level === level) ?? null;
}

const tableFor = (lv: LevelTables, kind: RoomTableKind): Record<string, Entry> =>
  kind === 'rooms' ? lv.rooms : kind === 'small' ? lv.smallRooms : lv.largeRooms;

const keyFor = (kind: RoomTableKind, dice: number[]): string =>
  kind === 'rooms' ? `${dice[0]}${dice[1]}` : String((dice[0] ?? 0) + (dice[1] ?? 0));

export function lookupRoom(lv: LevelTables, kind: RoomTableKind, dice: number[]): Entry {
  const entry = tableFor(lv, kind)[keyFor(kind, dice)];
  if (!entry) throw new Error(`No ${kind} entry for dice ${dice.join(',')}`);
  return entry;
}

/** 'random' rolls on the level's Exit Type table with D66 dice. */
export function resolveExit(lv: LevelTables, t: DungeonTables, spec: ExitSpec, exitDice?: number[]): { door: string; locked: boolean } {
  if (spec === 'random') {
    if (!exitDice || exitDice.length < 2) throw new Error('A random exit type needs two dice');
    const row = t.tables.exitTables?.[lv.exitTable]?.[`${exitDice[0]}${exitDice[1]}`];
    if (!row) throw new Error(`No exit type for dice ${exitDice.join(',')}`);
    return { door: row.door, locked: row.locked === true };
  }
  return { door: spec.door, locked: spec.locked === true };
}

const norm = (s: string) => s.trim().toLowerCase();

/** True if a room on this map already has this unique type (ignoring case and surrounding spaces). */
export function uniqueTaken(map: DungeonMap, type: string): boolean {
  const n = norm(type);
  return map.rooms.some((r) => r.contents !== undefined && norm(r.contents.type) === n);
}

/** Rolls, re-rolling taken unique entries. Gives up after 50 attempts or when nothing is left to find. */
export function rollRoom(
  lv: LevelTables, _t: DungeonTables, kind: RoomTableKind, map: DungeonMap, rng: Rng,
): { dice: number[]; entry: Entry; rerolls: number; capped: boolean } {
  const entries = Object.values(tableFor(lv, kind));
  const blocked = (e: Entry) => e.unique && uniqueTaken(map, e.type);
  const exhausted = entries.every(blocked);
  let rerolls = 0;
  for (;;) {
    const dice = [rollD6(rng), rollD6(rng)];
    const entry = lookupRoom(lv, kind, dice);
    if (!blocked(entry)) return { dice, entry, rerolls, capped: false };
    if (exhausted || rerolls + 1 >= MAX_ROLL_ATTEMPTS) return { dice, entry, rerolls, capped: true };
    rerolls++;
  }
}

/** Small rooms always have archway exits. */
export function contentsFrom(
  kind: RoomTableKind, dice: number[], entry: Entry, exit: { door: string; locked: boolean },
): RoomContents {
  const e = 'encounter' in entry ? entry.encounter : '';
  const x = kind === 'small' ? { door: 'archway', locked: false } : exit;
  return {
    table: kind, roll: dice.join(''), type: entry.type, description: entry.description,
    encounter: e, door: x.door, locked: x.locked,
  };
}

/** Names the room, records the roll and sets the room's own exit doors (not the entry door or shared edges). */
export function applyRoomRoll(room: Room, contents: RoomContents, unique: boolean): Command {
  return {
    label: 'Roll room',
    apply: (m) => {
      const ids = new Set<string>();
      const far = new Set<string>();
      for (const { edge, inside, dir } of perimeterEdges(room)) {
        const d = doorAt(m, edge);
        if (!d || d.secret || d.id === room.entryDoorId) continue;
        const other = roomsAcross(m, edge).find((r) => r !== undefined && r.id !== room.id);
        // Another room shares the wall; only the exit square built from this very door is ours.
        if (other && !(other.kind === 'passage' && other.entryDoorId === d.id)) continue;
        ids.add(d.id);
        if (other) {
          const fd = doorAt(m, cellEdge(step(inside, dir), dir));
          if (fd && !fd.secret) far.add(fd.id);
        }
      }
      return {
        ...m,
        rooms: m.rooms.map((r) => r.id === room.id
          ? { ...r, contents, label: { ...r.label, type: contents.type, unique, narrative: contents.description } }
          : r),
        doors: m.doors.map((d) => ids.has(d.id)
          ? { ...d, type: contents.door, lock: contents.locked ? { locked: true, note: '', quality: null } : null }
          : far.has(d.id) ? { ...d, type: contents.door } : d),
      };
    },
  };
}
