import { createCampaign, createMap, CURRENT_SCHEMA_VERSION, MAX_MAP_SIZE } from '../../src/core/campaign';
import { sequentialIds } from '../../src/core/ids';
import { dungeonSystem } from '../../src/systems/dungeon';

describe('createMap', () => {
  it('uses the system defaults', () => {
    const m = createMap(dungeonSystem, { seed: 3, newId: sequentialIds('m') });
    expect(m).toEqual({
      id: 'm-1',
      title: '',
      hero: '',
      level: '',
      width: 25,
      height: 25,
      themeId: 'classic',
      defaultDoorType: 'archway',
      seed: 3,
      rooms: [],
      doors: [],
      features: [],
      token: null,
    });
  });
  it('accepts overrides', () => {
    const m = createMap(dungeonSystem, { width: 12, height: 8, title: 'Level 1' });
    expect(m).toMatchObject({ width: 12, height: 8, title: 'Level 1' });
  });
});

describe('createCampaign', () => {
  it('wraps one active map and reserves the hero slot', () => {
    const c = createCampaign(dungeonSystem, 'My run', { newId: sequentialIds('c') });
    expect(c.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(c.systemId).toBe('dungeon');
    expect(c.maps).toHaveLength(1);
    expect(c.activeMapId).toBe(c.maps[0]!.id);
    expect(c.hero).toBeNull();
  });
});

describe('createMap size limits', () => {
  it('clamps width and height to 1..MAX_MAP_SIZE', () => {
    const m = createMap(dungeonSystem, { width: 500, height: 0 });
    expect(m.width).toBe(MAX_MAP_SIZE);
    expect(m.height).toBe(1);
  });
});
