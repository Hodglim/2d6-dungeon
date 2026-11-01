import 'fake-indexeddb/auto';
import { vi } from 'vitest';
import { History } from '../../src/core/history';
import { addRoom } from '../../src/core/commands';
import { IdbSaveStore, MemorySaveStore } from '../../src/persistence/store';
import { encodeSave } from '../../src/persistence/record';
import { emptyMap, room } from '../core/fixtures';

const meta = { id: 'c1', name: 'Camp', systemId: 'dungeon', hero: null };
function rec(n: number) {
  const h = new History(emptyMap(30, 30));
  for (let i = 0; i < n; i++) h.execute(addRoom(room(`r${i}`, i * 3, 1, 2, 2, 'room', i + 1)));
  return encodeSave(meta, h.exportState());
}

describe('IdbSaveStore', () => {
  it('loads null from an empty db, then the last saved record', async () => {
    const s = new IdbSaveStore('t-basic');
    expect(await s.load()).toBeNull();
    await s.save(rec(1));
    const b = rec(3);
    await s.save(b);
    expect(await s.load()).toEqual(JSON.parse(JSON.stringify(b)));
  });

  it('two saves in flight leave the last-written record, complete and unmerged', async () => {
    const s = new IdbSaveStore('t-race');
    const a = rec(2);
    const b = rec(5);
    await Promise.all([s.save(a), s.save(b)]);
    expect(await s.load()).toEqual(JSON.parse(JSON.stringify(b)));
  });

  it('shares data across store instances on the same db', async () => {
    await new IdbSaveStore('t-shared').save(rec(2));
    expect(await new IdbSaveStore('t-shared').load()).not.toBeNull();
  });

  it('requestPersist resolves false when unavailable', async () => {
    expect(await new IdbSaveStore('t-p').requestPersist()).toBe(false);
  });
});

describe('MemorySaveStore', () => {
  it('stores, and fails once when told to', async () => {
    const s = new MemorySaveStore();
    expect(await s.load()).toBeNull();
    s.failNext = new Error('full');
    await expect(s.save(rec(1))).rejects.toThrow('full');
    expect(s.failNext).toBeNull();
    const r = rec(1);
    await s.save(r);
    expect(s.saved).toBe(r);
    expect(await s.load()).toBe(r);
  });
});

describe('IdbSaveStore reconnect', () => {
  it('reopens after the browser closes the connection', async () => {
    const s = new IdbSaveStore('t-reopen');
    await s.save(rec(1));
    const db = await (s as unknown as { db: Promise<IDBDatabase> }).db;
    db.close(); // fake-indexeddb does not fire onclose for a manual close, so invoke the handler as the browser would
    db.onclose?.(new Event('close'));
    await s.save(rec(2));
    expect(await s.load()).not.toBeNull();
  });

  it('closes and drops the connection on versionchange', async () => {
    const s = new IdbSaveStore('t-vc');
    await s.save(rec(1));
    const db = await (s as unknown as { db: Promise<IDBDatabase> }).db;
    const close = vi.spyOn(db, 'close');
    db.onversionchange?.(new Event('versionchange') as IDBVersionChangeEvent);
    expect(close).toHaveBeenCalled();
    await s.save(rec(2));
    expect(await s.load()).not.toBeNull();
  });
});

describe('IdbSaveStore stale handlers', () => {
  it('a stale connection closing does not drop a newer cached one', async () => {
    const s = new IdbSaveStore('t-stale');
    await s.save(rec(1));
    const internal = s as unknown as { db: Promise<IDBDatabase> | null };
    const old = await internal.db!;
    old.onclose?.(new Event('close')); // legit reset
    await s.save(rec(1));
    const fresh = internal.db;
    old.onclose?.(new Event('close')); // stale fire
    expect(internal.db).toBe(fresh);
  });
});
