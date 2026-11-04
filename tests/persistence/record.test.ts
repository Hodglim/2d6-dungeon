import { addRoom } from '../../src/core/commands';
import { createCampaign } from '../../src/core/campaign';
import { History } from '../../src/core/history';
import { parseCampaign, serializeCampaign } from '../../src/core/serialize';
import { dungeonSystem } from '../../src/systems/dungeon';
import { SAVE_FORMAT, campaignFrom, decodeSave, encodeSave, metaFrom } from '../../src/persistence/record';
import { decideStartup } from '../../src/persistence/startup';
import { emptyMap, room } from '../core/fixtures';

const meta = { id: 'c1', name: 'Camp', systemId: 'dungeon', earlierLevels: [], gameOver: null };

function historyWith(n: number, size = 10): History {
  const h = new History(emptyMap(size, size));
  for (let i = 0; i < n; i++) h.execute(addRoom(room(`r${i}`, (i % 10) * 3, Math.floor(i / 10) * 3, 2, 2, 'room', i + 1)));
  return h;
}

const levelMaps = () => {
  const a = { ...emptyMap(10, 10), id: 'L1', level: 1 };
  const b = { ...emptyMap(10, 10), id: 'L2', level: 2 };
  return [a, b];
};

describe('earlier levels', () => {
  it('round-trip through encodeSave, decodeSave and decideStartup', () => {
    const [a, b] = levelMaps();
    const m = { ...meta, earlierLevels: [a!, b!] };
    const h = historyWith(2);
    const rec = JSON.parse(JSON.stringify(encodeSave(m, h.exportState())));
    const out = decodeSave(rec);
    expect(out.ok && out.meta.earlierLevels).toEqual([a, b]);
    const start = decideStartup(rec);
    expect(start.kind).toBe('restore');
    if (start.kind === 'restore') expect(start.meta.earlierLevels).toEqual([a, b]);
  });
  it('an exported two-map campaign imports with one earlier level', () => {
    const [a, b] = levelMaps();
    const c = { ...createCampaign(dungeonSystem, 'X'), maps: [a!, b!], activeMapId: 'L2' };
    const parsed = parseCampaign(serializeCampaign(c));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const m = metaFrom(parsed.campaign);
    expect(m.earlierLevels).toEqual([a]);
    expect(campaignFrom(m, b!, null, null).maps).toEqual([a, b]);
  });
  it('a format 2 record is refused as an older test version', () => {
    const rec = JSON.parse(JSON.stringify(encodeSave(meta, historyWith(1).exportState())));
    expect(decodeSave({ ...rec, format: 2 })).toEqual({ ok: false, error: "This save is from an older test version of the app and can't be loaded." });
  });
  it('a damaged earlier level is a damaged save', () => {
    const [a] = levelMaps();
    const rec = JSON.parse(JSON.stringify(encodeSave({ ...meta, earlierLevels: [a!] }, historyWith(1).exportState())));
    rec.meta.earlierLevels[0].level = 'one';
    const out = decodeSave(rec);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toMatch(/earlier level 1/);
    const rec2 = JSON.parse(JSON.stringify(encodeSave({ ...meta, earlierLevels: [a!] }, historyWith(1).exportState())));
    rec2.meta.earlierLevels[0].doors = [{ id: 'd', type: 'wooden', x: 50, y: 50, side: 'N', secret: false, lock: null }];
    expect(decodeSave(rec2).ok).toBe(false);
    expect(decideStartup(rec2).kind).toBe('error');
    delete rec2.meta.earlierLevels;
    expect(decodeSave(rec2).ok).toBe(false);
  });
});

describe('save record', () => {
  it('round-trips through JSON', () => {
    const h = historyWith(4, 20);
    h.undo();
    const rec = encodeSave(meta, h.exportState(), new Date('2026-11-01T00:00:00Z'));
    expect(rec.format).toBe(SAVE_FORMAT);
    expect(rec.savedAt).toBe('2026-11-01T00:00:00.000Z');
    const out = decodeSave(JSON.parse(JSON.stringify(rec)));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.meta).toEqual(meta);
    expect(out.history.past.map((e) => e.label)).toEqual(h.exportState().past.map((e) => e.label));
    expect(out.history.future.map((e) => e.label)).toEqual(h.exportState().future.map((e) => e.label));
    expect(out.history.current).toEqual(h.map);
    expect(out.history.past.map((e) => e.map)).toEqual(h.exportState().past.map((e) => e.map));
  });

  it('refuses a newer format, a broken snapshot, and null', () => {
    const rec = JSON.parse(JSON.stringify(encodeSave(meta, historyWith(1).exportState())));
    const newer = decodeSave({ ...rec, format: 5 });
    expect(newer.ok).toBe(false);
    if (!newer.ok) expect(newer.error).toContain('newer version');
    const broken = decodeSave({ ...rec, history: { ...rec.history, current: { nope: 1 } } });
    expect(broken.ok).toBe(false);
    expect(decodeSave(null).ok).toBe(false);
    expect(decodeSave({ ...rec, meta: { id: 1 } }).ok).toBe(false);
  });

  it('refuses a format 1 record with a plain message of its own', () => {
    const rec = JSON.parse(JSON.stringify(encodeSave(meta, historyWith(1).exportState())));
    const old = decodeSave({ ...rec, format: 1 });
    expect(old).toEqual({ ok: false, error: "This save is from an older test version of the app and can't be loaded." });
  });

  it('keeps a hero through undo history and a hero problem is reported', () => {
    const h = new History(emptyMap(10, 10), 20, { name: 'Tess' });
    h.execute(addRoom(room('r1', 2, 2, 2, 2, 'room', 1)));
    const rec = JSON.parse(JSON.stringify(encodeSave(meta, h.exportState())));
    const out = decodeSave(rec, () => null);
    expect(out.ok && out.history.hero).toEqual({ name: 'Tess' });
    const bad = decodeSave(rec, (x) => ((x as { name: string }).name === 'Tess' ? 'nope' : null));
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/^The saved hero is damaged/);
  });

  it('a format 3 record is refused as an older test version', () => {
    const rec = JSON.parse(JSON.stringify(encodeSave(meta, historyWith(1).exportState())));
    expect(decodeSave({ ...rec, format: 3 }).ok).toBe(false);
  });

  it('keeps an encounter through undo history, reports a problem, and refuses a missing field', () => {
    const h = new History(emptyMap(10, 10), 20, null, undefined, { foes: ['x'] });
    const rec = JSON.parse(JSON.stringify(encodeSave(meta, h.exportState())));
    const out = decodeSave(rec, undefined, () => null);
    expect(out.ok && out.history.encounter).toEqual({ foes: ['x'] });
    const bad = decodeSave(rec, undefined, () => 'nope');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/^The saved encounter is damaged/);
    delete rec.history.encounter;
    expect(decodeSave(rec).ok).toBe(false);
  });

  it('a record without hero fields is refused', () => {
    const rec = JSON.parse(JSON.stringify(encodeSave(meta, historyWith(1).exportState())));
    delete rec.history.hero;
    expect(decodeSave(rec).ok).toBe(false);
  });

  it('campaignFrom builds a campaign that parseCampaign accepts', () => {
    const map = historyWith(2).map;
    const c = campaignFrom(meta, map, null, null);
    expect(c.maps).toEqual([map]);
    expect(c.activeMapId).toBe(map.id);
    const parsed = parseCampaign(serializeCampaign(c));
    expect(parsed.ok).toBe(true);
    expect(metaFrom(c)).toEqual(meta);
  });

  it('metaFrom of a real campaign round-trips through campaignFrom', () => {
    const c = createCampaign(dungeonSystem, 'X');
    expect(campaignFrom(metaFrom(c), c.maps[0]!, c.hero, c.encounter)).toEqual(c);
  });

  it('measures a 20-step history of about 40 rooms on a 100x100 map', () => {
    const h = new History(emptyMap(100, 100));
    for (let i = 0; i < 40; i++) {
      const r = h.execute(addRoom(room(`r${i}`, (i % 8) * 12, Math.floor(i / 8) * 12, 6, 6, 'room', i + 1)));
      expect(r.ok).toBe(true);
    }
    const state = h.exportState();
    expect(state.past).toHaveLength(20);
    const bytes = JSON.stringify(encodeSave(meta, state)).length;
    console.log(`save record size: ${bytes} bytes (${(bytes / 1024).toFixed(1)} KiB)`);
    expect(bytes).toBeLessThan(5 * 1024 * 1024);
  });
});

describe('game over', () => {
  it('round-trips through encodeSave, decodeSave and decideStartup', () => {
    const m = { ...meta, gameOver: { heroName: 'Pip', heroLevel: 3 } };
    const rec = JSON.parse(JSON.stringify(encodeSave(m, historyWith(1).exportState())));
    const out = decodeSave(rec);
    expect(out.ok && out.meta.gameOver).toEqual({ heroName: 'Pip', heroLevel: 3 });
    const start = decideStartup(rec);
    expect(start.kind === 'restore' && start.meta.gameOver).toEqual({ heroName: 'Pip', heroLevel: 3 });
  });
  it('is null when not set, and when missing from a stored meta', () => {
    const rec = JSON.parse(JSON.stringify(encodeSave({ ...meta, gameOver: null }, historyWith(1).exportState())));
    const out = decodeSave(rec);
    expect(out.ok && out.meta.gameOver).toBeNull();
    delete rec.meta.gameOver;
    const out2 = decodeSave(rec);
    expect(out2.ok && out2.meta.gameOver).toBeNull();
  });
  it('a malformed gameOver is a damaged save', () => {
    const rec = JSON.parse(JSON.stringify(encodeSave({ ...meta, gameOver: null }, historyWith(1).exportState())));
    rec.meta.gameOver = { heroName: 5, heroLevel: 'x' };
    expect(decodeSave(rec).ok).toBe(false);
  });
  it('a new campaign starts with no game over', () => {
    expect(metaFrom(createCampaign(dungeonSystem, 'X')).gameOver).toBeNull();
  });
});
