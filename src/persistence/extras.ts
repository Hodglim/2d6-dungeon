import { validateCardPack, parseCardPack, type CardPack } from '../systems/dungeon/cards';
import { validateTableFile, parseTableFile, type DungeonTables } from '../systems/dungeon/tables';
import { CARDS_KEY, TABLES_KEY, type SaveStore } from './store';

/** One kind of player file: where it is stored, how to check it, how to read a chosen file. */
export interface ExtraKind<T> {
  key: string;
  validate(raw: unknown): { ok: true; value: T } | { ok: false; error: string };
  parse(text: string, bytes: number): { ok: true; value: T } | { ok: false; error: string };
}

export const tablesKind: ExtraKind<DungeonTables> = {
  key: TABLES_KEY,
  validate: (raw) => {
    const r = validateTableFile(raw);
    return r.ok ? { ok: true, value: r.tables } : r;
  },
  parse: (t, n) => {
    const r = parseTableFile(t, n);
    return r.ok ? { ok: true, value: r.tables } : r;
  },
};

export const cardsKind: ExtraKind<CardPack> = {
  key: CARDS_KEY,
  validate: (raw) => {
    const r = validateCardPack(raw);
    return r.ok ? { ok: true, value: r.pack } : r;
  },
  parse: (t, n) => {
    const r = parseCardPack(t, n);
    return r.ok ? { ok: true, value: r.pack } : r;
  },
};

/** Reads and validates the stored copy; null when absent, damaged or unreadable. Never throws. */
export async function loadStored<T>(store: SaveStore, kind: ExtraKind<T>): Promise<T | null> {
  try {
    const raw = await store.loadExtra(kind.key);
    if (raw === null) return null;
    const r = kind.validate(raw);
    return r.ok ? r.value : null;
  } catch {
    return null;
  }
}

/** What is really stored now; `current` when the store can't be read. */
async function readBack<T>(store: SaveStore, kind: ExtraKind<T>, current: T | null): Promise<T | null> {
  try {
    const raw = await store.loadExtra(kind.key);
    if (raw === null) return null;
    const r = kind.validate(raw);
    return r.ok ? r.value : null;
  } catch {
    return current;
  }
}

export type ChooseResult<T> = { ok: true; value: T } | { ok: false; error: string; value: T | null };

/**
 * A chosen file: validate, store, then report what to show. A bad file leaves the old one.
 * If storing fails the stored state is unknown (a slow write may still land), so re-read the key
 * and report what is really there, so memory matches storage.
 */
export async function chooseFile<T>(
  store: SaveStore,
  kind: ExtraKind<T>,
  file: { size: number; text(): Promise<string> },
  current: T | null,
): Promise<ChooseResult<T>> {
  let text: string;
  try {
    text = await file.text();
  } catch {
    return { ok: false, error: "That file couldn't be read.", value: current };
  }
  const res = kind.parse(text, file.size);
  if (!res.ok) return { ok: false, error: res.error, value: current };
  try {
    await store.saveExtra(kind.key, res.value);
    return { ok: true, value: res.value };
  } catch (err) {
    return {
      ok: false,
      error: `The file couldn't be stored on this device: ${err instanceof Error ? err.message : String(err)}`,
      value: await readBack(store, kind, current),
    };
  }
}

/** Removes the stored copy; on failure re-reads so the caller shows what is really stored. */
export async function removeFile<T>(store: SaveStore, kind: ExtraKind<T>, current: T | null): Promise<ChooseResult<T | null>> {
  try {
    await store.removeExtra(kind.key);
    return { ok: true, value: null };
  } catch (err) {
    return {
      ok: false,
      error: `The file couldn't be removed: ${err instanceof Error ? err.message : String(err)}`,
      value: await readBack(store, kind, current),
    };
  }
}
