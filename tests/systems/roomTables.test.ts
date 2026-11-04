import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/dungeon-tables.fixture.json';
import { createRoomFromExit } from '../../src/core/playflow';
import { sequentialIds } from '../../src/core/ids';
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
  // A (0,1,3,2) is west of B (3,1,3,3); C (4,0,1,1) is above B.
  const build = () => {
    const a = room('A', 0, 1, 3, 2, 'room', 1);
    const b = { ...room('B', 3, 1, 3, 3, 'room', 2), entryDoorId: 'in' };
    const c = room('C', 4, 0, 1, 1, 'room', 3);
    const doors = [
      door('in', 3, 1, 'W'), // entry, shared with A
      door('shareW', 3, 2, 'W'), // shared with A, not the entry
      door('ownW', 3, 3, 'W'), // B's own exit, W-canonical
      door('shareN', 4, 1, 'N'), // shared with C
      door('ownN', 5, 1, 'N'), // B's own exit, N-canonical
      door('ownE', 6, 2, 'W'), // B's own exit, east edge
      door('ownS', 4, 4, 'N'), // B's own exit, south edge
      { ...door('secret', 5, 4, 'N'), secret: true },
      door('far', 0, 1, 'N'), // not on B's perimeter
    ];
    return withContent(emptyMap(), [a, b, c], doors);
  };
  const run = (c: RoomContents, unique = false) => {
    const m = build();
    const out = applyRoomRoll(m.rooms[1]!, c, unique).apply(m);
    return { m, out, d: (id: string) => out.doors.find((x) => x.id === id)!, was: (id: string) => m.doors.find((x) => x.id === id)! };
  };

  it('rewrites the room\'s own exits on all four sides and sets label and contents', () => {
    const c: RoomContents = { ...contents('Fire Pit'), door: 'metal', locked: true };
    const { m, out, d } = run(c, true);
    for (const id of ['ownW', 'ownN', 'ownE', 'ownS']) {
      expect(d(id)).toMatchObject({ type: 'metal', lock: { locked: true, note: '', quality: null } });
    }
    expect(out.rooms[1]!.contents).toEqual(c);
    expect(out.rooms[1]!.label).toEqual({ type: 'Fire Pit', unique: true, narrative: '' }); // player's notes kept, description not copied
    expect(out.rooms[0]).toEqual(m.rooms[0]);
  });
  it('leaves the entry door, doors shared with neighbours and far doors unchanged', () => {
    const { d, was } = run({ ...contents('Z'), door: 'metal', locked: true });
    for (const id of ['in', 'shareW', 'shareN', 'far']) expect(d(id)).toEqual(was(id));
  });
  it('leaves secret doors unchanged', () => {
    const { d, was } = run({ ...contents('Z'), door: 'metal', locked: true });
    expect(d('secret')).toEqual(was('secret'));
  });
  it('clears an old lock when the roll is not locked', () => {
    const m = build();
    m.doors = m.doors.map((x) => (x.id === 'ownE' ? { ...x, lock: { locked: true, note: 'x', quality: 1 } } : x));
    const out = applyRoomRoll(m.rooms[1]!, { ...contents('Z'), door: 'wooden' }, false).apply(m);
    expect(out.doors.find((x) => x.id === 'ownE')).toMatchObject({ type: 'wooden', lock: null });
  });
});

describe('applyRoomRoll on a placed room with exit squares', () => {
  it('retypes the exit doors and their far doors, locks only the room-side door, leaves the entry', () => {
    const base = withContent(emptyMap(12, 12), [room('A', 0, 8, 4, 3, 'room', 1)], [door('open', 1, 8, 'N')]);
    const r = { ...room('B', 1, 4, 3, 3, 'room', 2), entryDoorId: 'in' };
    const m0 = withContent(base, [...base.rooms], [door('in', 1, 7, 'N'), ...base.doors.filter((d) => d.id !== 'open')]);
    const exits = [{ x: 2, y: 4, side: 'N' as const }, { x: 4, y: 5, side: 'W' as const }];
    const m = createRoomFromExit(m0, { room: r, exits, exitType: 'archway' }, sequentialIds('n')).apply(m0);
    const placed = m.rooms.find((x) => x.id === 'B')!;
    const out = applyRoomRoll(placed, { ...contents('Z'), door: 'metal', locked: true }, false).apply(m);
    const exitDoors = m.doors.filter((d) => d.type === 'archway' && !['in'].includes(d.id));
    expect(exitDoors.length).toBe(4); // two room-side doors and two far doors
    const lockedIds = out.doors.filter((d) => d.lock?.locked).map((d) => d.id);
    expect(lockedIds).toHaveLength(2);
    for (const d of out.doors) {
      if (d.id === 'in') expect(d).toEqual(m.doors.find((x) => x.id === 'in'));
      else expect(d.type).toBe('metal');
    }
    // far doors are not locked
    expect(out.doors.filter((d) => d.type === 'metal' && d.lock === null)).toHaveLength(2);
  });
});

describe('applyRoomRoll with a neighbour\'s exit square', () => {
  it('leaves another room\'s exit door and far door alone', () => {
    // R is 3x3 at (3,3). X's exit square at (2,3)... sits west of R; its far door is on R's west wall.
    const r = { ...room('R', 3, 3, 3, 3, 'room', 1), entryDoorId: 'rin' };
    const x = room('X', 0, 3, 2, 2, 'room', 2);
    const sq = { ...room('SQ', 2, 4, 1, 1, 'passage'), entryDoorId: 'xdoor' };
    const m = withContent(emptyMap(10, 10), [r, x, sq], [
      door('rin', 4, 6, 'N'),
      door('xdoor', 2, 4, 'W'), // X's room-side exit door
      door('far', 3, 4, 'W'), // far door of X's exit square, on R's west wall
    ]);
    const out = applyRoomRoll(r, { ...contents('Z'), door: 'metal', locked: true }, false).apply(m);
    for (const id of ['xdoor', 'far', 'rin']) expect(out.doors.find((d) => d.id === id)).toEqual(m.doors.find((d) => d.id === id));
  });
});
