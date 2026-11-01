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

describe('IdbSaveStore with an open that never answers', () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubHungOpen() {
    const reqs: { onsuccess?: () => void; result?: unknown }[] = [];
    const open = vi.fn(() => {
      const req: { onsuccess?: () => void; result?: unknown } = {};
      reqs.push(req);
      return req;
    });
    vi.stubGlobal('indexedDB', { open });
    return { open, reqs };
  }

  it('load and save reject after the timeout, and the next call opens afresh', async () => {
    const { open } = stubHungOpen();
    const s = new IdbSaveStore('t-hung', 20);
    await expect(s.load()).rejects.toThrow('Storage did not respond');
    expect(open).toHaveBeenCalledTimes(1);
    await expect(s.save(rec(1))).rejects.toThrow('Storage did not respond');
    expect(open).toHaveBeenCalledTimes(2); // not the dead cached promise
  });

  it('closes a connection that arrives after the timeout', async () => {
    const { reqs } = stubHungOpen();
    const s = new IdbSaveStore('t-late', 10);
    await expect(s.load()).rejects.toThrow('Storage did not respond');
    const close = vi.fn();
    reqs[0]!.result = { close };
    reqs[0]!.onsuccess?.();
    expect(close).toHaveBeenCalled();
  });
});

describe('IdbSaveStore with a dead connection', () => {
  const internal = (s: IdbSaveStore) => s as unknown as { db: Promise<IDBDatabase> | null };

  it('drops the connection when transaction() throws, and the next save reopens', async () => {
    const s = new IdbSaveStore('t-throw');
    await s.save(rec(1));
    const first = await internal(s).db!;
    const close = vi.spyOn(first, 'close');
    vi.spyOn(first, 'transaction').mockImplementationOnce(() => {
      throw new DOMException('The database connection is closing.', 'InvalidStateError');
    });
    await expect(s.save(rec(2))).rejects.toThrow('closing');
    expect(close).toHaveBeenCalled();
    expect(internal(s).db).toBeNull();
    await s.save(rec(3));
    expect(await internal(s).db!).not.toBe(first);
    expect(await s.load()).not.toBeNull();
  });

  it('drops the connection when load\'s transaction() throws', async () => {
    const s = new IdbSaveStore('t-throw-load');
    await s.save(rec(1));
    const first = await internal(s).db!;
    vi.spyOn(first, 'transaction').mockImplementationOnce(() => {
      throw new DOMException('lost', 'InvalidStateError');
    });
    await expect(s.load()).rejects.toThrow('lost');
    expect(await s.load()).not.toBeNull();
    expect(await internal(s).db!).not.toBe(first);
  });

  it('drops the connection when a transaction aborts', async () => {
    const s = new IdbSaveStore('t-abort');
    await s.save(rec(1));
    const first = await internal(s).db!;
    const real = first.transaction.bind(first);
    vi.spyOn(first, 'transaction').mockImplementationOnce((...a: Parameters<IDBDatabase['transaction']>) => {
      const tx = real(...a);
      const realStore = tx.objectStore.bind(tx);
      vi.spyOn(tx, 'objectStore').mockImplementation((n: string) => {
        const st = realStore(n);
        const put = st.put.bind(st);
        st.put = (...args: Parameters<IDBObjectStore['put']>) => {
          const r = put(...args);
          tx.abort();
          return r;
        };
        return st;
      });
      return tx;
    });
    await expect(s.save(rec(2))).rejects.toBeTruthy();
    expect(internal(s).db).toBeNull();
    await s.save(rec(3));
    expect(await internal(s).db!).not.toBe(first);
  });

  it('rejects a transaction that never fires any event, and the next save reopens', async () => {
    const s = new IdbSaveStore('t-silent', 50);
    await s.save(rec(1));
    const first = await internal(s).db!;
    const silentTx = { objectStore: () => ({ put: () => ({}) }) } as unknown as IDBTransaction;
    vi.spyOn(first, 'transaction').mockImplementationOnce(() => silentTx);
    await expect(s.save(rec(2))).rejects.toThrow('Storage did not respond');
    expect(internal(s).db).toBeNull();
    await s.save(rec(3));
    expect(await internal(s).db!).not.toBe(first);
  });
});
