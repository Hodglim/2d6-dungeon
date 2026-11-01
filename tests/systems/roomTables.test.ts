import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/dungeon-tables.fixture.json';
import { door, emptyMap, room, withContent } from '../core/fixtures';
import type { RoomContents } from '../../src/core/types';
import type { RoomSize } from '../../src/systems/dungeon/rules';
import type { DungeonTables } from '../../src/systems/dungeon/tables';
import {
  applyRoomRoll, contentsFrom, levelTables, lookupRoom, resolveExit, rollRoom, tableKindFor, uniqueTaken,
} from '../../src/systems/dungeon/roomTables';

const t = fixture as unknown as DungeonTables;
const lv = levelTables(t, 1)!;
const size = (o: Partial<RoomSize> = {}): RoomSize => ({ w: 0, h: 0, corridor: false, doubled: false, fromDouble: false, ...o });
const scripted = (faces: number[]) => { let i = 0; return () => (faces[i++ % faces.length]! - 1) / 6 + 0.01; };
const contents = (type: string): RoomContents => ({ table: 'rooms', roll: '11', type, description: 'd', encounter: '', door: 'wooden', locked: false });

describe('tableKindFor', () => {
  it('picks the table by final area', () => {
    expect(tableKindFor({ w: 3, h: 2 }, size())).toBe('small');
    expect(tableKindFor({ w: 6, h: 6 }, size({ fromDouble: true }))).toBe('large');
    expect(tableKindFor({ w: 8, h: 4 }, size())).toBe('rooms');
    expect(tableKindFor({ w: 1, h: 5 }, size())).toBeNull();
  });
});

describe('levelTables and lookup', () => {
  it('finds levels', () => {
    expect(lv.name).toBe('Test Halls');
    expect(levelTables(t, 9)).toBeNull();
    expect(levelTables(null, 1)).toBeNull();
  });
  it('looks up by dice', () => {
    expect(lookupRoom(lv, 'rooms', [3, 4]).type).toBe('Practice Room 34');
    expect(lookupRoom(lv, 'small', [5, 6]).type).toBe('Practice Closet 11');
    expect(lookupRoom(lv, 'large', [1, 3]).type).toContain('4');
  });
});

describe('resolveExit', () => {
  it('rolls random on the exit table', () => {
    expect(resolveExit(lv, t, 'random', [2, 5])).toEqual({ door: 'metal', locked: false });
  });
  it('returns fixed specs', () => {
    expect(resolveExit(lv, t, { door: 'wooden', locked: true })).toEqual({ door: 'wooden', locked: true });
    expect(resolveExit(lv, t, { door: 'metal' })).toEqual({ door: 'metal', locked: false });
  });
  it('small rooms always give archways', () => {
    const c = contentsFrom('small', [1, 1], lookupRoom(lv, 'small', [1, 1]), { door: 'metal', locked: true });
    expect(c).toMatchObject({ door: 'archway', locked: false, encounter: '' });
  });
  it('keeps the dice as the roll', () => {
    expect(contentsFrom('rooms', [3, 4], lookupRoom(lv, 'rooms', [3, 4]), { door: 'wooden', locked: true }))
      .toMatchObject({ roll: '34', door: 'wooden', locked: true, table: 'rooms' });
  });
});

describe('unique rooms', () => {
  const uniqueType = lookupRoom(lv, 'rooms', [1, 4]).type;
  it('uniqueTaken ignores case and spaces', () => {
    const m = { ...emptyMap(), rooms: [{ ...room('a', 0, 0, 3, 3), contents: contents(`  ${uniqueType.toUpperCase()} `) }] };
    expect(uniqueTaken(m, uniqueType)).toBe(true);
    expect(uniqueTaken(emptyMap(), uniqueType)).toBe(false);
  });
  it('re-rolls a taken unique entry', () => {
    const m = { ...emptyMap(), rooms: [{ ...room('a', 0, 0, 3, 3), contents: contents(uniqueType) }] };
    const r = rollRoom(lv, t, 'rooms', m, scripted([1, 4, 3, 4]));
    expect(r.rerolls).toBe(1);
    expect(r.capped).toBe(false);
    expect(r.dice).toEqual([3, 4]);
  });
  it('accepts an untaken unique entry', () => {
    const r = rollRoom(lv, t, 'rooms', emptyMap(), scripted([1, 4]));
    expect(r).toMatchObject({ rerolls: 0, capped: false });
  });
  it('caps at 50 attempts', () => {
    const m = { ...emptyMap(), rooms: [{ ...room('a', 0, 0, 3, 3), contents: contents(uniqueType) }] };
    const r = rollRoom(lv, t, 'rooms', m, scripted([1, 4]));
    expect(r.capped).toBe(true);
    expect(r.rerolls).toBe(49);
  });
  it('stops early when every entry is a taken unique', () => {
    const all = JSON.parse(JSON.stringify(lv));
    for (const e of Object.values(all.smallRooms) as { unique: boolean; type: string }[]) e.unique = true;
    const rooms = Object.values(all.smallRooms as Record<string, { type: string }>).map((e, i) => ({ ...room(`r${i}`, 0, 0, 1, 1), contents: contents(e.type) }));
    const r = rollRoom(all, t, 'small', { ...emptyMap(), rooms }, scripted([1, 1]));
    expect(r).toMatchObject({ rerolls: 0, capped: true });
  });
});

describe('applyRoomRoll', () => {
  const build = () => {
    const a = room('A', 0, 0, 3, 3, 'room', 1);
    const b = { ...room('B', 4, 0, 3, 3, 'room', 2), entryDoorId: 'in' };
    const doors = [
      door('in', 4, 1, 'W'),
      door('a2', 1, 3, 'N'), // A's other exit (south of A)
      door('b1', 7, 1, 'W'), // B's own exit, east
      door('b2', 5, 3, 'N'), // B's own exit, south
    ];
    return withContent(emptyMap(), [a, b], doors);
  };
  it('rewrites only the room\'s own exits and sets label and contents', () => {
    const m = build();
    const c: RoomContents = { ...contents('Fire Pit'), door: 'metal', locked: true };
    const out = applyRoomRoll(m.rooms[1]!, c, true).apply(m);
    const d = (id: string) => out.doors.find((x) => x.id === id)!;
    expect(d('b1')).toMatchObject({ type: 'metal', lock: { locked: true, note: '', quality: null } });
    expect(d('b2')).toMatchObject({ type: 'metal' });
    expect(d('in')).toEqual(m.doors[0]);
    expect(d('a2')).toEqual(m.doors[1]);
    const rb = out.rooms[1]!;
    expect(rb.contents).toEqual(c);
    expect(rb.label).toEqual({ type: 'Fire Pit', unique: true, narrative: 'd' });
    expect(out.rooms[0]).toEqual(m.rooms[0]);
  });
  it('clears the lock when not locked and leaves a neighbour\'s door alone', () => {
    const m = build();
    m.doors[2] = { ...m.doors[2]!, lock: { locked: true, note: 'x', quality: 1 } };
    const out = applyRoomRoll(m.rooms[1]!, { ...contents('Z'), door: 'wooden' }, false).apply(m);
    expect(out.doors.find((x) => x.id === 'b1')).toMatchObject({ type: 'wooden', lock: null });
  });
  it('leaves doors shared with another room untouched', () => {
    const m = build();
    const c = { ...m, rooms: [...m.rooms, room('C', 4, 3, 3, 2)], doors: [...m.doors] };
    const out = applyRoomRoll(c.rooms[1]!, { ...contents('Z'), door: 'metal' }, false).apply(c);
    expect(out.doors.find((x) => x.id === 'b2')!.type).toBe('archway');
    expect(out.doors.find((x) => x.id === 'b1')!.type).toBe('metal');
  });
});
