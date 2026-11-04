import { createCampaign, CURRENT_SCHEMA_VERSION } from '../../src/core/campaign';
import { sequentialIds } from '../../src/core/ids';
import { History } from '../../src/core/history';
import { addRoom } from '../../src/core/commands';
import { mapProblem, parseCampaign, parseHistoryState, serializeCampaign } from '../../src/core/serialize';
import { dungeonSystem } from '../../src/systems/dungeon';
import { SAVE_FORMAT } from '../../src/persistence/record';
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

  it('refuses a schema 1 file with a plain message', () => {
    const r = parseCampaign(JSON.stringify({ ...sample(), schemaVersion: 1 }));
    expect(r).toEqual({ ok: false, error: "This file is from an older test version of the app and can't be imported." });
  });

  it('version coupling: bump the save format and the schema version together', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(4);
    expect(SAVE_FORMAT).toBe(4);
  });

  it('validates a non-null hero with heroProblem, and requires the hero key', () => {
    const c = { ...sample(), hero: { name: 'Tess' } };
    const seen: unknown[] = [];
    const ok = parseCampaign(JSON.stringify(c), (h) => (seen.push(h), null));
    expect(ok.ok).toBe(true);
    expect(seen).toEqual([{ name: 'Tess' }]);
    const bad = parseCampaign(JSON.stringify(c), () => 'no name');
    expect(bad).toEqual({ ok: false, error: 'The saved hero is damaged: no name.' });
    const none = parseCampaign(JSON.stringify(sample()), () => {
      throw new Error('not called for null');
    });
    expect(none.ok).toBe(true);
    const { hero: _h, ...noHero } = sample();
    expect(parseCampaign(JSON.stringify(noHero)).ok).toBe(false);
  });

  it('refuses an old schema 3 file, and validates the encounter like the hero', () => {
    expect(parseCampaign(JSON.stringify({ ...sample(), schemaVersion: 3 })).ok).toBe(false);
    const c = { ...sample(), encounter: { foes: [] } };
    const seen: unknown[] = [];
    expect(parseCampaign(JSON.stringify(c), undefined, (e) => (seen.push(e), null)).ok).toBe(true);
    expect(seen).toEqual([{ foes: [] }]);
    expect(parseCampaign(JSON.stringify(c), undefined, () => 'bad foe')).toEqual({ ok: false, error: 'The saved encounter is damaged: bad foe.' });
    expect(parseCampaign(JSON.stringify(sample()), undefined, () => { throw new Error('not called for null'); }).ok).toBe(true);
    const { encounter: _e, ...noEnc } = sample();
    expect(parseCampaign(JSON.stringify(noEnc)).ok).toBe(false);
  });

  it('parseHistoryState checks the encounter of the state and of each entry', () => {
    const map = sample().maps[0]!;
    const st = (over: object, entry: object = {}) => ({ current: map, hero: null, encounter: null, past: [{ label: 'a', map, hero: null, encounter: null, ...entry }], future: [], ...over });
    expect(parseHistoryState(st({ encounter: { foes: [] } }), undefined, () => null).ok).toBe(true);
    expect(parseHistoryState(st({ encounter: { foes: [] } }), undefined, () => 'bad foe')).toEqual({ ok: false, error: 'The saved encounter is damaged: bad foe.' });
    expect(parseHistoryState(st({}, { encounter: { foes: [] } }), undefined, () => 'bad foe')).toEqual({ ok: false, error: 'The saved encounter is damaged: past[0]: bad foe.' });
    const { encounter: _e, ...noEnc } = st({});
    expect(parseHistoryState(noEnc).ok).toBe(false);
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

});

describe('mapProblem', () => {
  it('requires a whole-number level from 1 to 10', () => {
    const m = sample().maps[0]!;
    expect(m.level).toBe(1);
    expect(mapProblem({ ...m, level: '1' })).not.toBeNull();
    expect(mapProblem({ ...m, level: 0 })).not.toBeNull();
    expect(mapProblem({ ...m, level: 11 })).not.toBeNull();
    expect(mapProblem({ ...m, level: 1.5 })).not.toBeNull();
    expect(mapProblem({ ...m, level: 10 })).toBeNull();
  });
  it('validates room contents when present', () => {
    const m = sample().maps[0]!;
    const r = room('rc', 2, 2, 3, 3, 'room', 1);
    const good = { table: 'rooms', roll: '3', type: 'Hall', description: 'd', encounter: '', door: 'wooden', locked: false };
    expect(mapProblem({ ...m, rooms: [{ ...r, contents: good }] })).toBeNull();
    expect(mapProblem({ ...m, rooms: [{ ...r, contents: { ...good, table: 'huge' } }] })).not.toBeNull();
    expect(mapProblem({ ...m, rooms: [{ ...r, contents: { ...good, locked: 'no' } }] })).not.toBeNull();
    expect(mapProblem({ ...m, rooms: [{ ...r, contents: { ...good, type: 4 } }] })).not.toBeNull();
  });
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
