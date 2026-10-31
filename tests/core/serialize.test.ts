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
});
