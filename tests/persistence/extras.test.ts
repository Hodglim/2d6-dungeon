import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/dungeon-tables.fixture.json';
import { cardsKind, chooseFile, loadStored, removeFile, tablesKind } from '../../src/persistence/extras';
import { MemorySaveStore, TABLES_KEY, CARDS_KEY } from '../../src/persistence/store';

const file = (text: string) => ({ size: new TextEncoder().encode(text).length, text: async () => text });
const good = JSON.stringify(fixture);
const other = JSON.stringify({ ...fixture, name: 'Second made-up file' });

/** A memory store whose chosen operations throw. */
class Failing extends MemorySaveStore {
  constructor(private readonly fail: { load?: boolean; save?: boolean; remove?: boolean }) {
    super();
  }
  override async loadExtra(k: string) {
    if (this.fail.load) throw new Error('read boom');
    return super.loadExtra(k);
  }
  override async saveExtra(k: string, v: unknown) {
    if (this.fail.save) throw new Error('write boom');
    return super.saveExtra(k, v);
  }
  override async removeExtra(k: string) {
    if (this.fail.remove) throw new Error('remove boom');
    return super.removeExtra(k);
  }
}

describe('loadStored', () => {
  it('returns null for nothing, damage, or a throwing store; never throws', async () => {
    const s = new MemorySaveStore();
    expect(await loadStored(s, tablesKind)).toBeNull();
    await s.saveExtra(TABLES_KEY, { nonsense: true });
    expect(await loadStored(s, tablesKind)).toBeNull();
    expect(await loadStored(new Failing({ load: true }), cardsKind)).toBeNull();
  });
  it('validates the stored object directly', async () => {
    const s = new MemorySaveStore();
    await s.saveExtra(TABLES_KEY, JSON.parse(good));
    expect((await loadStored(s, tablesKind))?.name).toBe(fixture.name);
  });
});

describe('chooseFile', () => {
  it('stores a good file and returns it', async () => {
    const s = new MemorySaveStore();
    const r = await chooseFile(s, tablesKind, file(good), null);
    expect(r.ok && r.value.name).toBe(fixture.name);
    expect(await s.loadExtra(TABLES_KEY)).not.toBeNull();
  });
  it('a bad file keeps the old one, in memory and in storage', async () => {
    const s = new MemorySaveStore();
    const first = await chooseFile(s, tablesKind, file(good), null);
    if (!first.ok) throw new Error('setup');
    const r = await chooseFile(s, tablesKind, file('{ nope'), first.value);
    expect(r.ok).toBe(false);
    expect(r.value).toBe(first.value);
    expect((await loadStored(s, tablesKind))?.name).toBe(fixture.name);
  });
  it('a file that cannot be read keeps the old one', async () => {
    const r = await chooseFile(new MemorySaveStore(), tablesKind, { size: 1, text: async () => { throw new Error('x'); } }, null);
    expect(r.ok).toBe(false);
  });
  it('a failed store write reports what is really stored', async () => {
    const s = new Failing({ save: true });
    await MemorySaveStore.prototype.saveExtra.call(s, TABLES_KEY, JSON.parse(other));
    const r = await chooseFile(s, tablesKind, file(good), null);
    expect(r.ok).toBe(false);
    expect(r.value?.name).toBe('Second made-up file');
  });
  it('if the read-back also fails, the current value is kept', async () => {
    const s = new Failing({ save: true, load: true });
    const cur = await chooseFile(new MemorySaveStore(), tablesKind, file(good), null);
    const r = await chooseFile(s, tablesKind, file(other), cur.value);
    expect(r.ok).toBe(false);
    expect(r.value).toBe(cur.value);
  });
});

describe('removeFile', () => {
  it('removes', async () => {
    const s = new MemorySaveStore();
    await chooseFile(s, tablesKind, file(good), null);
    expect((await removeFile(s, tablesKind, null)).value).toBeNull();
    expect(await s.loadExtra(TABLES_KEY)).toBeNull();
  });
  it('on failure reports what is still stored', async () => {
    const s = new Failing({ remove: true });
    await MemorySaveStore.prototype.saveExtra.call(s, TABLES_KEY, JSON.parse(good));
    const r = await removeFile(s, tablesKind, null);
    expect(r.ok).toBe(false);
    expect((r.value as { name: string }).name).toBe(fixture.name);
    expect(await s.loadExtra(CARDS_KEY)).toBeNull();
  });
});
