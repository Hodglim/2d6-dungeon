import { vi } from 'vitest';
import { History } from '../../src/core/history';
import { addRoom } from '../../src/core/commands';
import { encodeSave } from '../../src/persistence/record';
import { Autosaver, type AutosaveStatus } from '../../src/persistence/autosave';
import 'fake-indexeddb/auto';
import { IdbSaveStore, MemorySaveStore } from '../../src/persistence/store';
import { emptyMap, room } from '../core/fixtures';

const meta = { id: 'c1', name: 'Camp', systemId: 'dungeon', hero: null };

function setup() {
  const history = new History(emptyMap(30, 30));
  const store = new MemorySaveStore();
  const save = vi.spyOn(store, 'save');
  const persist = vi.spyOn(store, 'requestPersist');
  const auto = new Autosaver(history, store, () => meta);
  auto.start();
  let n = 0;
  const act = () => history.execute(addRoom(room(`r${n}`, n++ * 3, 1, 2, 2, 'room', n)));
  return { history, store, save, persist, auto, act };
}

describe('Autosaver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces: 3 executes within 500ms give one save holding the latest map', async () => {
    const { store, save, act, history } = setup();
    act();
    await vi.advanceTimersByTimeAsync(200);
    act();
    await vi.advanceTimersByTimeAsync(200);
    act();
    await vi.advanceTimersByTimeAsync(999);
    expect(save).toHaveBeenCalledTimes(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(store.saved!.history.current).toBe(history.exportState().current);
  });

  it('flush writes a pending save immediately; a second flush writes nothing', async () => {
    const { save, act, auto, store, history } = setup();
    act();
    await auto.flush();
    expect(save).toHaveBeenCalledTimes(1);
    expect(store.saved!.history.current).toBe(history.exportState().current);
    await auto.flush();
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('a failed save sets failing; a later successful save clears it', async () => {
    const { store, act, auto } = setup();
    const seen: AutosaveStatus[] = [];
    auto.subscribe((s) => seen.push(s));
    store.failNext = new Error('QuotaExceededError');
    act();
    await vi.advanceTimersByTimeAsync(1000);
    expect(seen.at(-1)).toMatchObject({ failing: true, lastError: 'QuotaExceededError' });
    act();
    await vi.advanceTimersByTimeAsync(1000);
    const last = seen.at(-1)!;
    expect(last.failing).toBe(false);
    expect(last.lastError).toBeNull();
    expect(last.lastSavedAt).not.toBeNull();
  });

  it('pause ignores changes; resume lets the next change save', async () => {
    const { save, act, auto } = setup();
    auto.pause();
    act();
    await vi.advanceTimersByTimeAsync(3000);
    await auto.flush();
    expect(save).toHaveBeenCalledTimes(0);
    auto.resume();
    act();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('requestPersist is called once across several saves', async () => {
    const { persist, act } = setup();
    for (let i = 0; i < 3; i++) {
      act();
      await vi.advanceTimersByTimeAsync(1000);
    }
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('never overlaps saves: a change during an in-flight save runs after it with the latest state', async () => {
    const { store, act, history, auto } = setup();
    let release!: () => void;
    let active = 0;
    let maxActive = 0;
    const writes: unknown[] = [];
    store.save = async (rec) => {
      active++;
      maxActive = Math.max(maxActive, active);
      if (writes.length === 0) await new Promise<void>((r) => (release = r));
      writes.push(rec.history.current);
      active--;
    };
    act();
    await vi.advanceTimersByTimeAsync(1000);
    act();
    await vi.advanceTimersByTimeAsync(1000);
    expect(writes).toHaveLength(0);
    release();
    await auto.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(maxActive).toBe(1);
    expect(writes).toHaveLength(2);
    expect(writes[1]).toBe(history.exportState().current);
  });

  it('dispose stops saving', async () => {
    const { save, act, auto } = setup();
    act();
    auto.dispose();
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).toHaveBeenCalledTimes(0);
  });

  it('flush retries a failed save without a new change', async () => {
    const { store, save, act, auto } = setup();
    const seen: AutosaveStatus[] = [];
    auto.subscribe((s) => seen.push(s));
    store.failNext = new Error('boom');
    act();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(seen.at(-1)!.failing).toBe(true);
    await auto.flush();
    expect(save).toHaveBeenCalledTimes(2);
    expect(seen.at(-1)!.failing).toBe(false);
    expect(store.saved).not.toBeNull();
  });

  it('retries on a timer after a failure with no new change', async () => {
    const { store, save, act, auto } = setup();
    const seen: AutosaveStatus[] = [];
    auto.subscribe((s) => seen.push(s));
    store.failNext = new Error('boom');
    act();
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(seen.at(-1)!.failing).toBe(false);
  });

  it('a store that always fails gets a bounded number of calls', async () => {
    const { store, act, auto } = setup();
    const calls = vi.fn();
    store.save = async () => {
      calls();
      throw new Error('down');
    };
    act();
    await vi.advanceTimersByTimeAsync(1000);
    await auto.flush();
    await auto.flush();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(calls.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(calls.mock.calls.length).toBeLessThan(15);
  });

  it('a DataCloneError rejection shows failing', async () => {
    const { store, act, auto } = setup();
    store.save = async () => {
      throw new DOMException('Proxy object could not be cloned.', 'DataCloneError');
    };
    const seen: boolean[] = [];
    auto.subscribe((s) => seen.push(s.failing));
    act();
    await vi.advanceTimersByTimeAsync(1000);
    expect(seen.at(-1)).toBe(true);
  });

  it('a store that throws synchronously shows failing', async () => {
    const { store, act, auto } = setup();
    store.save = () => {
      throw new DOMException('Proxy object could not be cloned.', 'DataCloneError');
    };
    const seen: boolean[] = [];
    auto.subscribe((s) => seen.push(s.failing));
    act();
    await vi.advanceTimersByTimeAsync(1000);
    expect(seen.at(-1)).toBe(true);
  });

  it('pause cancels a pending retry', async () => {
    const { store, save, act, auto } = setup();
    store.failNext = new Error('boom');
    act();
    await vi.advanceTimersByTimeAsync(1000);
    auto.pause();
    await vi.advanceTimersByTimeAsync(60_000);
    await auto.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe('Autosaver over a dead IndexedDB connection', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }));
  afterEach(() => vi.useRealTimers());

  it('shows failing, then clears on the retry with no reload', async () => {
    const history = new History(emptyMap(30, 30));
    const store = new IdbSaveStore('t-auto-dead');
    await store.save(encodeSave(meta, history.exportState()));
    const dead = await (store as unknown as { db: Promise<IDBDatabase> }).db;
    vi.spyOn(dead, 'transaction').mockImplementation(() => {
      throw new DOMException('dead', 'InvalidStateError');
    });
    const auto = new Autosaver(history, store, () => meta);
    const seen: boolean[] = [];
    auto.subscribe((s) => seen.push(s.failing));
    auto.start();
    history.execute(addRoom(room('r0', 1, 1, 2, 2, 'room', 1)));
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(seen).toEqual([true]));
    await vi.advanceTimersByTimeAsync(1000); // backoff retry
    await vi.waitFor(() => expect(seen).toEqual([true, false])); // fake-indexeddb settles on real timers
    expect(await store.load()).not.toBeNull();
  });
});
