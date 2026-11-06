import type { SaveRecord } from './record';

export interface SaveStore {
  load(): Promise<unknown | null>;
  save(rec: SaveRecord): Promise<void>;
  requestPersist(): Promise<boolean>;
  /** Player files (table file, card pack) live beside the game under their own keys and never touch `current`. */
  loadExtra(key: string): Promise<unknown | null>;
  saveExtra(key: string, value: unknown): Promise<void>;
  removeExtra(key: string): Promise<void>;
}

/** Writing a large card pack can take far longer than a game save. */
export const EXTRA_WRITE_TIMEOUT_MS = 60_000;
const GAME_KEY_REFUSED = 'The saved game cannot be changed as an extra file';

export const TABLES_KEY = 'tables:dungeon';
export const CARDS_KEY = 'cards:dungeon';

const STORE = 'saves';
const KEY = 'current';

async function requestPersist(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/** One record under one key; each save is a single put in one transaction, so it is atomic (last writer wins). */
export class IdbSaveStore implements SaveStore {
  private db: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly dbName = '2d6-dungeon-companion',
    private readonly openTimeoutMs = 5000,
    private readonly extraWriteTimeoutMs = EXTRA_WRITE_TIMEOUT_MS,
  ) {}

  private open(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    const p: Promise<IDBDatabase> = new Promise((resolve, reject) => {
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        reject(new Error('Storage did not respond'));
      }, this.openTimeoutMs);
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => {
        const db = req.result;
        clearTimeout(timer);
        if (timedOut) {
          db.close(); // arrived too late: nobody is waiting for it, so don't leak the connection
          return;
        }
        // If the browser closes the connection (e.g. storage pressure), reopen on the next call.
        // Only reset if this connection is still the cached one.
        db.onclose = () => {
          if (this.db === p) this.db = null;
        };
        db.onversionchange = () => {
          db.close();
          if (this.db === p) this.db = null;
        };
        resolve(db);
      };
      req.onerror = () => {
        clearTimeout(timer);
        reject(req.error ?? new Error('Could not open storage'));
      };
      req.onblocked = () => {
        clearTimeout(timer);
        reject(new Error('Storage is blocked by another tab'));
      };
    });
    this.db = p;
    // Do not cache a failed open.
    p.catch(() => {
      if (this.db === p) this.db = null;
    });
    return p;
  }

  /**
   * Runs one operation on the cached connection. On any failure (a throwing transaction(), a failed or
   * aborted transaction) the connection is dropped and closed so the next call opens a fresh one: WebKit
   * can leave a dead connection cached after the app is suspended, without ever firing `close`.
   */
  private async run<T>(
    op: (db: IDBDatabase, resolve: (v: T) => void, reject: (e: unknown) => void) => void,
    timeoutMs: number = this.openTimeoutMs,
  ): Promise<T> {
    const cached = this.open();
    const db = await cached;
    const drop = () => {
      if (this.db === cached) this.db = null;
      try {
        db.close();
      } catch {
        // already closed
      }
    };
    return new Promise<T>((resolve, reject) => {
      // A transaction that never fires any event must not stall the autosaver silently.
      const timer = setTimeout(() => fail(new Error('Storage did not respond')), timeoutMs);
      const done = (v: T) => {
        clearTimeout(timer);
        resolve(v);
      };
      const fail = (e: unknown) => {
        clearTimeout(timer);
        drop();
        reject(e);
      };
      try {
        op(db, done, fail);
      } catch (e) {
        fail(e);
      }
    });
  }

  load(): Promise<unknown | null> {
    return this.run<unknown | null>((db, resolve, fail) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => fail(req.error ?? new Error('Could not read the save'));
      tx.onerror = () => fail(tx.error ?? new Error('Could not read the save'));
      tx.onabort = () => fail(tx.error ?? new Error('The read was aborted'));
    });
  }

  save(rec: SaveRecord): Promise<void> {
    return this.run<void>((db, resolve, fail) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put(rec, KEY);
      req.onerror = () => fail(req.error ?? new Error('Could not write the save'));
      tx.oncomplete = () => resolve();
      tx.onerror = () => fail(tx.error ?? new Error('Could not write the save'));
      tx.onabort = () => fail(tx.error ?? new Error('The save was aborted'));
      (tx as IDBTransaction & { commit?: () => void }).commit?.();
    });
  }

  requestPersist(): Promise<boolean> {
    return requestPersist();
  }

  loadExtra(key: string): Promise<unknown | null> {
    return this.run<unknown | null>((db, resolve, fail) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => fail(req.error ?? new Error('Could not read the stored file'));
      tx.onerror = () => fail(tx.error ?? new Error('Could not read the stored file'));
      tx.onabort = () => fail(tx.error ?? new Error('The read was aborted'));
    }, this.extraWriteTimeoutMs);
  }

  saveExtra(key: string, value: unknown): Promise<void> {
    if (key === KEY) return Promise.reject(new Error(GAME_KEY_REFUSED));
    return this.run<void>((db, resolve, fail) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).put(value, key);
      req.onerror = () => fail(req.error ?? new Error('Could not store the file'));
      tx.oncomplete = () => resolve();
      tx.onerror = () => fail(tx.error ?? new Error('Could not store the file'));
      tx.onabort = () => fail(tx.error ?? new Error('Storing the file was aborted'));
      (tx as IDBTransaction & { commit?: () => void }).commit?.();
    }, this.extraWriteTimeoutMs);
  }

  removeExtra(key: string): Promise<void> {
    if (key === KEY) return Promise.reject(new Error(GAME_KEY_REFUSED));
    return this.run<void>((db, resolve, fail) => {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).delete(key);
      req.onerror = () => fail(req.error ?? new Error('Could not remove the file'));
      tx.oncomplete = () => resolve();
      tx.onerror = () => fail(tx.error ?? new Error('Could not remove the file'));
      tx.onabort = () => fail(tx.error ?? new Error('Removing the file was aborted'));
      (tx as IDBTransaction & { commit?: () => void }).commit?.();
    });
  }
}

/** In-memory store for tests and fallback. `failNext` makes the next save reject once. */
export class MemorySaveStore implements SaveStore {
  failNext: Error | null = null;
  saved: SaveRecord | null = null;
  extras = new Map<string, unknown>();

  async load(): Promise<unknown | null> {
    return this.saved;
  }

  async save(rec: SaveRecord): Promise<void> {
    if (this.failNext) {
      const err = this.failNext;
      this.failNext = null;
      throw err;
    }
    this.saved = rec;
  }

  requestPersist(): Promise<boolean> {
    return requestPersist();
  }

  async loadExtra(key: string): Promise<unknown | null> {
    return this.extras.has(key) ? structuredClone(this.extras.get(key)) : null;
  }

  async saveExtra(key: string, value: unknown): Promise<void> {
    if (key === 'current') throw new Error(GAME_KEY_REFUSED);
    this.extras.set(key, structuredClone(value));
  }

  async removeExtra(key: string): Promise<void> {
    if (key === 'current') throw new Error(GAME_KEY_REFUSED);
    this.extras.delete(key);
  }
}
