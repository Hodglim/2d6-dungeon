import { History } from '../../src/core/history';
import { sequentialIds } from '../../src/core/ids';
import { createRoomFromExit, newRoom, placeEntrance } from '../../src/core/playflow';
import { openExits } from '../../src/core/query';
import { evaluatePlacement, validExitEdges } from '../../src/core/placement';
import { addRoom } from '../../src/core/commands';
import { dungeonSystem } from '../../src/systems/dungeon';
import { door, emptyMap, room, withContent } from './fixtures';

describe('placeEntrance', () => {
  it('adds the entrance below the map, an inward open exit, and the token', () => {
    const h = new History(emptyMap(10, 10));
    const ids = sequentialIds('e');
    expect(h.execute(placeEntrance(h.map, dungeonSystem, { x: 4, y: 10 }, ids)).ok).toBe(true);
    expect(h.map.rooms).toMatchObject([{ kind: 'entrance', x: 4, y: 10, w: 1, h: 1 }]);
    expect(h.map.doors).toMatchObject([{ x: 4, y: 10, side: 'N', type: 'archway' }]);
    expect(openExits(h.map)).toHaveLength(1);
    expect(h.map.token).toEqual({ x: 4, y: 10, trail: [] });
  });

  it.each([
    ['N', { x: 3, y: -1 }, { x: 3, y: 0, side: 'N' }],
    ['E', { x: 10, y: 3 }, { x: 10, y: 3, side: 'W' }],
    ['W', { x: -1, y: 3 }, { x: 0, y: 3, side: 'W' }],
  ] as const)('works for entrance edge %s', (edge, cell, expected) => {
    const h = new History(emptyMap(10, 10));
    const system = { ...dungeonSystem, entranceEdge: edge };
    expect(h.execute(placeEntrance(h.map, system, cell, sequentialIds('e'))).ok).toBe(true);
    expect(h.map.doors).toMatchObject([expected]);
  });
});

describe('full play-flow round', () => {
  it('entrance → room → exits with passages, as one undo step', () => {
    const h = new History(emptyMap(10, 10));
    const ids = sequentialIds('x');
    h.execute(placeEntrance(h.map, dungeonSystem, { x: 4, y: 10 }, ids));
    const exit = openExits(h.map)[0]!;
    const doorsBefore = structuredClone(h.map.doors);
    const tokenBefore = structuredClone(h.map.token);

    // Rolled red 3 × blue 2, slid so the exit is at the room's middle column.
    const placement = evaluatePlacement(h.map, exit, 3, 2, 1);
    expect(placement).toMatchObject({ ok: true, rect: { x: 3, y: 8, w: 3, h: 2 } });

    const room = newRoom(h.map, placement.rect!, exit, ids);
    expect(room.number).toBe(1);
    expect(room.entryDoorId).toBe(exit.id);

    // Exits are chosen against a draft map that already contains the room.
    const draft = addRoom(room).apply(h.map);
    const valid = validExitEdges(draft, room.id, true);
    const top = { x: 4, y: 8, side: 'N' as const };
    expect(valid).toContainEqual(top);

    const cmd = createRoomFromExit(
      h.map,
      { room: { ...room, label: { type: 'Guard Room', unique: false, narrative: '' } }, exits: [top], exitType: 'wooden', passages: true },
      ids,
    );
    expect(h.execute(cmd).ok).toBe(true);

    expect(h.map.rooms.map((r) => r.kind)).toEqual(['entrance', 'room', 'passage']);
    expect(h.map.rooms[2]).toMatchObject({ x: 4, y: 7, w: 1, h: 1 });
    // Entrance door now joins two rooms; the passage's far end is the only open exit.
    expect(openExits(h.map)).toMatchObject([{ x: 4, y: 7, side: 'N', type: 'wooden' }]);

    h.undo();
    expect(h.map.rooms.map((r) => r.kind)).toEqual(['entrance']);
    expect(h.map.doors).toEqual(doorsBefore);
    expect(h.map.token).toEqual(tokenBefore);
  });

  it('does not put a door at a passage end that meets the Outer Boundary', () => {
    const h = new History(emptyMap(5, 5));
    const ids = sequentialIds('y');
    h.execute(placeEntrance(h.map, dungeonSystem, { x: 2, y: 5 }, ids));
    const exit = openExits(h.map)[0]!;
    // 1 wide × 4 tall fills y=1..4; a passage north of it sits at y=0, against the boundary.
    const placement = evaluatePlacement(h.map, exit, 1, 4, 0);
    const room = newRoom(h.map, placement.rect!, exit, ids);
    const cmd = createRoomFromExit(h.map, { room, exits: [{ x: 2, y: 1, side: 'N' }], exitType: 'archway', passages: true }, ids);
    expect(h.execute(cmd).ok).toBe(true);
    expect(h.map.rooms.find((r) => r.kind === 'passage')).toMatchObject({ x: 2, y: 0 });
    expect(openExits(h.map)).toEqual([]);
  });

  it('adds no far door when the passage end already has a door', () => {
    const map = withContent(emptyMap(10, 10), [room('B', 4, 2, 2, 2)], [door('d', 4, 4, 'N')]);
    const h = new History(map);
    const r = { ...room('R', 3, 5, 3, 2), number: 2 };
    const cmd = createRoomFromExit(h.map, { room: r, exits: [{ x: 4, y: 5, side: 'N' }], exitType: 'archway', passages: true }, sequentialIds('z'));
    expect(h.execute(cmd).ok).toBe(true);
    expect(h.map.doors.filter((d) => d.x === 4 && d.y === 4 && d.side === 'N')).toHaveLength(1);
    expect(h.map.rooms.find((x) => x.kind === 'passage')).toMatchObject({ x: 4, y: 4 });
  });

  it('creates no passage rooms when passages is off', () => {
    const h = new History(emptyMap(10, 10));
    const r = { ...room('R', 3, 5, 3, 2), number: 1 };
    const exits = [{ x: 3, y: 5, side: 'N' as const }, { x: 5, y: 5, side: 'N' as const }];
    const cmd = createRoomFromExit(h.map, { room: r, exits, exitType: 'archway', passages: false }, sequentialIds('p'));
    expect(h.execute(cmd).ok).toBe(true);
    expect(h.map.rooms.map((x) => x.kind)).toEqual(['room']);
    expect(openExits(h.map)).toHaveLength(2);
  });
});

describe('entry doors', () => {
  it('records the exit used for the room and for each passage', () => {
    const h = new History(emptyMap(10, 10));
    const ids = sequentialIds('n');
    h.execute(placeEntrance(h.map, dungeonSystem, { x: 4, y: 10 }, ids));
    const exit = openExits(h.map)[0]!;
    const room = newRoom(h.map, evaluatePlacement(h.map, exit, 3, 2, 1).rect!, exit, ids);
    h.execute(createRoomFromExit(h.map, { room, exits: [{ x: 4, y: 8, side: 'N' }], exitType: 'archway', passages: true }, ids));
    const passage = h.map.rooms.find((r) => r.kind === 'passage')!;
    const roomExit = h.map.doors.find((d) => d.x === 4 && d.y === 8 && d.side === 'N')!;
    expect(h.map.rooms.find((r) => r.kind === 'room')!.entryDoorId).toBe(exit.id);
    expect(passage.entryDoorId).toBe(roomExit.id);
  });

  it('frees the newest room number on undo', () => {
    const h = new History(emptyMap(10, 10));
    const ids = sequentialIds('u');
    h.execute(placeEntrance(h.map, dungeonSystem, { x: 4, y: 10 }, ids));
    const exit = openExits(h.map)[0]!;
    const room = newRoom(h.map, evaluatePlacement(h.map, exit, 2, 2, 0).rect!, exit, ids);
    h.execute(createRoomFromExit(h.map, { room, exits: [], exitType: 'archway', passages: false }, ids));
    h.undo();
    expect(newRoom(h.map, { x: 4, y: 8, w: 2, h: 2 }, exit, ids).number).toBe(1);
  });
});
