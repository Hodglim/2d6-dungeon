import { createCampaign } from '../../src/core/campaign';
import { sequentialIds } from '../../src/core/ids';
import { parseCampaign, serializeCampaign } from '../../src/core/serialize';
import { dungeonSystem } from '../../src/systems/dungeon';
import { room } from './fixtures';

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
