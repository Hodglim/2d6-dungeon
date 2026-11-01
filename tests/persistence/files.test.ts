import { createCampaign } from '../../src/core/campaign';
import { parseCampaign, serializeCampaign } from '../../src/core/serialize';
import { dungeonSystem } from '../../src/systems/dungeon';
import { MAX_IMPORT_BYTES, exportCampaignFile, exportFileName, readImportText } from '../../src/persistence/files';
import { room } from '../core/fixtures';

const d = new Date('2026-11-01T10:00:00Z');

describe('exportFileName', () => {
  it('slugs the title and appends the date', () => {
    expect(exportFileName('The Front Hall!', d)).toBe('2d6-the-front-hall-2026-11-01.2d6map.json');
  });
  it('falls back to dungeon for an empty slug', () => {
    expect(exportFileName('', d)).toBe('2d6-dungeon-2026-11-01.2d6map.json');
    expect(exportFileName('!!!', d)).toBe('2d6-dungeon-2026-11-01.2d6map.json');
  });
});

describe('exportCampaignFile', () => {
  it('round-trips through parseCampaign with no history', () => {
    const c = createCampaign(dungeonSystem, 'Camp');
    const f = exportCampaignFile(c);
    expect(f.name).toMatch(/^2d6-.*\.2d6map\.json$/);
    expect(f.text).not.toContain('"past"');
    expect(parseCampaign(f.text).ok).toBe(true);
  });
});

describe('readImportText', () => {
  const c = createCampaign(dungeonSystem, 'Camp');
  const valid = serializeCampaign(c);

  it('accepts a valid file', () => {
    expect(readImportText(valid, valid.length).ok).toBe(true);
  });
  it('refuses non-JSON', () => {
    expect(readImportText('not json', 8).ok).toBe(false);
  });
  it('refuses a huge file', () => {
    const r = readImportText(valid, MAX_IMPORT_BYTES + 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/too large/i);
  });
  it('refuses a valid campaign with overlapping rooms', () => {
    const bad = structuredClone(c);
    bad.maps[0]!.rooms = [room('a', 1, 1, 3, 3, 'room', 1), room('b', 2, 2, 3, 3, 'room', 2)];
    const r = readImportText(serializeCampaign(bad), 100);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/damaged/);
  });
});
