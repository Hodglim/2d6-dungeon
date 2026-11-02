import { vi } from 'vitest';
import { createMap } from '../../src/core/campaign';
import { History, HISTORY_CAP } from '../../src/core/history';
import { Autosaver } from '../../src/persistence/autosave';
import { encodeSave } from '../../src/persistence/record';
import { decideStartup, loadWithTimeout } from '../../src/persistence/startup';
import { MemorySaveStore } from '../../src/persistence/store';
import { dungeonSystem } from '../../src/systems/dungeon';
import { addRoom } from '../../src/core/commands';
import { room } from '../core/fixtures';

const meta = { id: 'c1', name: 'Test', systemId: dungeonSystem.id, earlierLevels: [] };
const newHistory = () => new History(createMap(dungeonSystem, { width: 25, height: 25 }));
const record = (h = newHistory()) => JSON.parse(JSON.stringify(encodeSave(meta, h.exportState())));

describe('decideStartup', () => {
  it('no record means a fresh game', () => {
    expect(decideStartup(null)).toEqual({ kind: 'fresh' });
    expect(decideStartup(undefined)).toEqual({ kind: 'fresh' });
  });

  it('a valid record restores its meta and history', () => {
    const res = decideStartup(record());
    expect(res.kind).toBe('restore');
    if (res.kind === 'restore') {
      expect(res.meta).toEqual(meta);
      expect(res.history.current.width).toBe(25);
    }
  });

  it('a format 3 record with a null hero restores with labels intact', () => {
    const h = newHistory();
    h.execute(addRoom(room('r1', 2, 2, 3, 3, 'room', 1)));
    const res = decideStartup(record(h), dungeonSystem.heroProblem);
    expect(res.kind).toBe('restore');
    if (res.kind !== 'restore') return;
    const back = new History(res.history.current);
    back.restore(res.history);
    expect(back.hero).toBeNull();
    expect(back.undoLabel).toBe(h.undoLabel);
  });

  it('a format 1 record is an error and is not modified', () => {
    const r = record();
    r.format = 1;
    const before = JSON.stringify(r);
    const res = decideStartup(r);
    expect(res).toEqual({ kind: 'error', error: "This save is from an older test version of the app and can't be loaded." });
    expect(JSON.stringify(r)).toBe(before);
  });

  it('a format 4 record is the newer-version error', () => {
    const res = decideStartup({ ...record(), format: 4 });
    expect(res.kind === 'error' && res.error).toContain('newer version');
  });

  it('a past hero that fails heroProblem is an error', () => {
    const h = newHistory();
    h.execute(addRoom(room('r1', 2, 2, 3, 3, 'room', 1)));
    const r = record(h);
    r.history.past[0].hero = { bad: true };
    const res = decideStartup(r, (x) => ((x as { bad?: boolean }).bad ? 'wrong shape' : null));
    expect(res.kind).toBe('error');
    if (res.kind === 'error') expect(res.error).toMatch(/^The saved hero is damaged/);
  });

  it('the restored current state is run through parseCampaign', () => {
    const r = record();
    r.history.current.rooms = [{ id: 'x' }];
    expect(decideStartup(r).kind).toBe('error');
  });

  it.each([
    ['an unknown format', { format: 99 }],
    ['a string', 'hello'],
    ['a number', 42],
  ])('%s is an error', (_n, raw) => {
    expect(decideStartup(raw).kind).toBe('error');
  });

  it('a broken snapshot, past entry, future entry or over-cap history is an error', () => {
    const broken = (edit: (r: any) => void) => {
      const r = record();
      r.history.past = [{ label: 'a', map: r.history.current, hero: null }];
      edit(r);
      return decideStartup(r).kind;
    };
    expect(broken((r) => (r.history.current = { nonsense: true }))).toBe('error');
    expect(broken((r) => (r.history.past[0].map = { nonsense: true }))).toBe('error');
    expect(broken((r) => (r.history.future = [{ label: 'x', map: { nonsense: true }, hero: null }]))).toBe('error');
    expect(broken((r) => (r.history.past = Array.from({ length: HISTORY_CAP + 1 }, () => ({ label: 'a', map: r.history.current, hero: null }))))).toBe('error');
  });
});

describe('loadWithTimeout', () => {
  afterEach(() => vi.useRealTimers());

  it('passes the record through', async () => {
    await expect(loadWithTimeout(async () => ({ a: 1 }))).resolves.toEqual({ kind: 'loaded', raw: { a: 1 } });
  });

  it('a rejection is unreadable, not damaged', async () => {
    const res = await loadWithTimeout(() => Promise.reject(new Error('boom')));
    expect(res).toEqual({ kind: 'unreadable', error: 'boom' });
  });

  it('a hung load times out, and its late result is ignored', async () => {
    vi.useFakeTimers();
    let late!: (v: unknown) => void;
    const p = loadWithTimeout(() => new Promise((r) => (late = r)), 5000);
    await vi.advanceTimersByTimeAsync(5000);
    const res = await p;
    expect(res.kind).toBe('unreadable');
    late({ some: 'record' });
    await Promise.resolve();
    expect(await p).toBe(res); // settled once; nothing new is delivered
  });
});

describe('Autosaver that was never started', () => {
  it('writes nothing even after a history change and a flush', async () => {
    const store = new MemorySaveStore();
    const h = newHistory();
    const saver = new Autosaver(h, store, () => meta);
    saver.pause();
    expect(h.execute(addRoom(room('r1', 2, 2, 3, 3, 'room', 1))).ok).toBe(true);
    await saver.flush();
    expect(store.saved).toBeNull();
  });
});
