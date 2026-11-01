import { createMap } from '../../src/core/campaign';
import { History } from '../../src/core/history';
import { dungeonSystem } from '../../src/systems/dungeon';
import { decideStartup } from '../../src/persistence/startup';
import { encodeSave } from '../../src/persistence/record';

const meta = { id: 'c1', name: 'Test', systemId: dungeonSystem.id, hero: null };

describe('decideStartup', () => {
  it('no record means a fresh game', () => {
    expect(decideStartup(null)).toEqual({ kind: 'fresh' });
  });

  it('a valid record restores its meta and history', () => {
    const h = new History(createMap(dungeonSystem, { width: 25, height: 25 }));
    const res = decideStartup(JSON.parse(JSON.stringify(encodeSave(meta, h.exportState()))));
    expect(res.kind).toBe('restore');
    if (res.kind === 'restore') {
      expect(res.meta).toEqual(meta);
      expect(res.history.current.width).toBe(25);
    }
  });

  it('an unknown format is an error', () => {
    const res = decideStartup({ format: 99 });
    expect(res.kind).toBe('error');
  });

  it('a broken snapshot is an error', () => {
    const h = new History(createMap(dungeonSystem, { width: 25, height: 25 }));
    const rec = JSON.parse(JSON.stringify(encodeSave(meta, h.exportState())));
    rec.history.current = { nonsense: true };
    const res = decideStartup(rec);
    expect(res.kind).toBe('error');
  });
});
