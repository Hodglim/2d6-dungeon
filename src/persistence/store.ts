import type { SaveRecord } from './record';

export interface SaveStore {
  load(): Promise<unknown | null>;
  save(rec: SaveRecord): Promise<void>;
  requestPersist(): Promise<boolean>;
}

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

  constructor(private readonly dbName = '2d6-map-maker') {}

  private open(): Promise<IDBDatabase> {
    this.db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => {
        const db = req.result;
        // If the browser closes the connection (e.g. storage pressure), reopen on the next call.
        db.onclose = () => {
          this.db = null;
        };
        db.onversionchange = () => {
          db.close();
          this.db = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(req.error ?? new Error('Could not open storage'));
      req.onblocked = () => reject(new Error('Storage is blocked by another tab'));
    });
    // Do not cache a failed open.
    this.db.catch(() => {
      this.db = null;
    });
    return this.db;
  }

  async load(): Promise<unknown | null> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error ?? new Error('Could not read the save'));
    });
  }

  async save(rec: SaveRecord): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(rec, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not write the save'));
      tx.onabort = () => reject(tx.error ?? new Error('The save was aborted'));
    });
  }

  requestPersist(): Promise<boolean> {
    return requestPersist();
  }
}

/** In-memory store for tests and fallback. `failNext` makes the next save reject once. */
export class MemorySaveStore implements SaveStore {
  failNext: Error | null = null;
  saved: SaveRecord | null = null;

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
}
