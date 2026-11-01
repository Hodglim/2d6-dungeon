import { addRoom } from '../../src/core/commands';
import { createCampaign } from '../../src/core/campaign';
import { History } from '../../src/core/history';
import { parseCampaign, serializeCampaign } from '../../src/core/serialize';
import { dungeonSystem } from '../../src/systems/dungeon';
import { SAVE_FORMAT, campaignFrom, decodeSave, encodeSave, metaFrom } from '../../src/persistence/record';
import { emptyMap, room } from '../core/fixtures';

const meta = { id: 'c1', name: 'Camp', systemId: 'dungeon', hero: null };

function historyWith(n: number, size = 10): History {
  const h = new History(emptyMap(size, size));
  for (let i = 0; i < n; i++) h.execute(addRoom(room(`r${i}`, (i % 10) * 3, Math.floor(i / 10) * 3, 2, 2, 'room', i + 1)));
  return h;
}

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
    const newer = decodeSave({ ...rec, format: 2 });
    expect(newer.ok).toBe(false);
    if (!newer.ok) expect(newer.error).toContain('newer version');
    const broken = decodeSave({ ...rec, history: { ...rec.history, current: { nope: 1 } } });
    expect(broken.ok).toBe(false);
    expect(decodeSave(null).ok).toBe(false);
    expect(decodeSave({ ...rec, meta: { id: 1 } }).ok).toBe(false);
  });

  it('campaignFrom builds a campaign that parseCampaign accepts', () => {
    const map = historyWith(2).map;
    const c = campaignFrom(meta, map);
    expect(c.maps).toEqual([map]);
    expect(c.activeMapId).toBe(map.id);
    const parsed = parseCampaign(serializeCampaign(c));
    expect(parsed.ok).toBe(true);
    expect(metaFrom(c)).toEqual(meta);
  });

  it('metaFrom of a real campaign round-trips through campaignFrom', () => {
    const c = createCampaign(dungeonSystem, 'X');
    expect(campaignFrom(metaFrom(c), c.maps[0]!)).toEqual(c);
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
