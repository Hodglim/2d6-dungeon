import { createCampaign } from '../../src/core/campaign';
import { sequentialIds } from '../../src/core/ids';
import { History } from '../../src/core/history';
import { addRoom } from '../../src/core/commands';
import { mapProblem, parseCampaign, parseHistoryState, serializeCampaign } from '../../src/core/serialize';
import { dungeonSystem } from '../../src/systems/dungeon';
import { door, room } from './fixtures';

function sample() {
  const c = createCampaign(dungeonSystem, 'Test run', { seed: 7, newId: sequentialIds('c') });
  c.maps[0]!.rooms.push(room('r1', 2, 2, 3, 3, 'room', 1));
  return c;
}

describe('serialize / parse', () => {
  it('round-trips a campaign', () => {
    const c = sample();
    const result = parseCampaign(serializeCampaign(c));
    expect(result).toEqual({ ok: true, campaign: c });
  });

  it('round-trips a corridor and a lock with quality', () => {
    const c = sample();
    const m = c.maps[0]!;
    m.rooms.push(room('c1', 6, 2, 1, 4, 'corridor'));
    m.doors.push({ ...door('d1', 2, 2, 'W'), lock: { locked: true, note: 'rusty', quality: 7 } });
    expect(parseCampaign(serializeCampaign(c))).toEqual({ ok: true, campaign: c });
  });

  it('rejects text that is not JSON', () => {
    const r = parseCampaign('not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/isn't a map file/);
  });

  it('rejects JSON without a schemaVersion', () => {
    const r = parseCampaign('{"hello": 1}');
    expect(r).toEqual({ ok: false, error: "This isn't a map file." });
  });

  it('rejects files from a newer version', () => {
    const c = { ...sample(), schemaVersion: 99 };
    const r = parseCampaign(JSON.stringify(c));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/newer version/);
  });

  it('reports damaged structure', () => {
    const c = sample() as unknown as Record<string, unknown>;
    delete c.maps;
    const r = parseCampaign(JSON.stringify(c));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('The map file is damaged: no maps.');
  });

  it('reports broken game rules', () => {
    const c = sample();
    c.maps[0]!.rooms.push(room('r2', 3, 3, 2, 2, 'room', 2));
    const r = parseCampaign(serializeCampaign(c));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/overlaps/);
  });

  it('runs migrations in order up to the current version', () => {
    const c = sample();
    const v0 = { ...c, schemaVersion: 0, name: undefined, title: 'Old name' };
    const migs = {
      0: (raw: Record<string, unknown>) => {
        const { title, ...rest } = raw;
        return { ...rest, name: title };
      },
    };
    const r = parseCampaign(JSON.stringify(v0), migs, 1);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.campaign.name).toBe('Old name');
      expect(r.campaign.schemaVersion).toBe(1);
    }
  });

  it('fails clearly when a migration is missing', () => {
    const c = { ...sample(), schemaVersion: 0 };
    const r = parseCampaign(JSON.stringify(c), {}, 1);
    expect(r).toEqual({ ok: false, error: 'Cannot upgrade this file from version 0.' });
  });

  const okDoor = { id: 'd1', x: 2, y: 2, side: 'N', type: 'archway', secret: false, lock: null };
  const corruptions: [string, (c: any) => void, string][] = [
    ['width 0', (c) => { c.maps[0].width = 0; }, 'a map has an invalid size'],
    ['width 1e9', (c) => { c.maps[0].width = 1e9; }, 'a map has an invalid size'],
    ['width 2.5', (c) => { c.maps[0].width = 2.5; }, 'a map has an invalid size'],
    ['room x 1.5', (c) => { c.maps[0].rooms[0].x = 1.5; }, 'a room is malformed'],
    ['room kind banana', (c) => { c.maps[0].rooms[0].kind = 'banana'; }, 'a room is malformed'],
    ['room sizeClass huge', (c) => { c.maps[0].rooms[0].sizeClass = 'huge'; }, 'a room is malformed'],
    ['door lock quality x', (c) => { c.maps[0].doors.push({ ...okDoor, lock: { locked: true, note: '', quality: 'x' } }); }, 'a door is malformed'],
    ['room label {}', (c) => { c.maps[0].rooms[0].label = {}; }, 'a room is malformed'],
    ['room entryDoorId 5', (c) => { c.maps[0].rooms[0].entryDoorId = 5; }, 'a room is malformed'],
    ['door secret yes', (c) => { c.maps[0].doors.push({ ...okDoor, secret: 'yes' }); }, 'a door is malformed'],
    ['door lock partial', (c) => { c.maps[0].doors.push({ ...okDoor, lock: { locked: true } }); }, 'a door is malformed'],
    ['stairs dir sideways', (c) => { c.maps[0].features.push({ id: 'f1', x: 1, y: 1, kind: 'stairs', dir: 'sideways' }); }, 'a feature is malformed'],
    ['note without text', (c) => { c.maps[0].features.push({ id: 'f1', x: 1, y: 1, kind: 'note' }); }, 'a feature is malformed'],
    ['token trail bad item', (c) => { c.maps[0].token = { x: 1, y: 1, trail: [{ x: 'a', y: 1 }] }; }, 'the token is malformed'],
    ['duplicate map ids', (c) => { c.maps.push(structuredClone(c.maps[0])); }, 'two maps share an id'],
    ['active map missing', (c) => { c.activeMapId = 'nope'; }, 'active map not found'],
  ];
  it.each(corruptions)('rejects corruption: %s', (_name, corrupt, problem) => {
    const c = structuredClone(sample());
    corrupt(c);
    let r: ReturnType<typeof parseCampaign> | undefined;
    expect(() => { r = parseCampaign(JSON.stringify(c)); }).not.toThrow();
    expect(r).toEqual({ ok: false, error: `The map file is damaged: ${problem}.` });
  });

  it('fails clearly when a migration throws', () => {
    const c = { ...sample(), schemaVersion: 0 };
    const migs = { 0: () => { throw new Error('boom'); } };
    expect(parseCampaign(JSON.stringify(c), migs, 1)).toEqual({ ok: false, error: 'Cannot upgrade this file from version 0.' });
  });

  it('fails clearly when a migration returns null', () => {
    const c = { ...sample(), schemaVersion: 0 };
    const migs = { 0: () => null as unknown as Record<string, unknown> };
    expect(parseCampaign(JSON.stringify(c), migs, 1)).toEqual({ ok: false, error: 'Cannot upgrade this file from version 0.' });
  });
});

describe('mapProblem', () => {
  it('accepts a valid map and describes a broken one', () => {
    expect(mapProblem(sample().maps[0])).toBeNull();
    const { rooms: _rooms, ...noRooms } = sample().maps[0]!;
    expect(typeof mapProblem(noRooms)).toBe('string');
  });
});

describe('parseHistoryState', () => {
  function state() {
    const h = new History(sample().maps[0]!);
    h.execute(addRoom(room('r2', 7, 7, 2, 2, 'room', 2)));
    h.execute(addRoom(room('r3', 1, 7, 2, 2, 'room', 3)));
    h.undo();
    return JSON.parse(JSON.stringify(h.exportState())) as Record<string, any>;
  }

  it('accepts a valid exported state', () => {
    const s = state();
    expect(parseHistoryState(s)).toEqual({ ok: true, state: s });
  });

  it('rejects a broken map deep in past, mentioning the history', () => {
    const s = state();
    s.past[0].map.rooms.push(room('x', 2, 2, 3, 3, 'room', 9), room('y', 3, 3, 3, 3, 'room', 10));
    const r = parseHistoryState(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/history/i);
  });

  it('rejects a non-string label', () => {
    const s = state();
    s.past[0].label = 5;
    expect(parseHistoryState(s).ok).toBe(false);
  });

  it('rejects more than 20 past entries', () => {
    const s = state();
    s.past = Array.from({ length: 21 }, () => s.past[0]);
    expect(parseHistoryState(s).ok).toBe(false);
  });

  it('rejects a non-object', () => {
    expect(parseHistoryState(null).ok).toBe(false);
    expect(parseHistoryState('x').ok).toBe(false);
  });
});
