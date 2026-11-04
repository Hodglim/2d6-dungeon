import type { DungeonMap } from '../../src/core/types';
import { dragOverlay, dropTarget, onToken } from '../../src/ui/tokenDrag';
import { door, emptyMap, room, withContent } from '../core/fixtures';

/**
 * Room r1 (2,2) 3×3 joined by an archway on its south wall at (3,5) to passage p1 (3,5) 1×2;
 * room r2 (7,2) 2×2 with no way in. The token stands at (2,2).
 */
function sample(token: { x: number; y: number } | null = { x: 2, y: 2 }): DungeonMap {
  const r1 = room('r1', 2, 2, 3, 3);
  const p1 = { ...room('p1', 3, 5, 1, 2, 'passage'), entryDoorId: 'd1' };
  const r2 = room('r2', 7, 2, 2, 2);
  const m = withContent(emptyMap(10, 10), [r1, p1, r2], [door('d1', 3, 5, 'N')]);
  return { ...m, token: token ? { ...token, trail: [] } : null };
}

describe('dropTarget', () => {
  it('a floor square the token can walk to is a valid drop', () => {
    const m = sample();
    expect(dropTarget(m, { x: 4, y: 4 })).toEqual({ x: 4, y: 4 });
    expect(dropTarget(m, { x: 3, y: 6 })).toEqual({ x: 3, y: 6 }); // through the archway
  });

  it('empty space, an unreachable room, the token’s own square and off-map squares are not', () => {
    const m = sample();
    expect(dropTarget(m, { x: 6, y: 6 })).toBeNull();
    expect(dropTarget(m, { x: 7, y: 2 })).toBeNull();
    expect(dropTarget(m, { x: 2, y: 2 })).toBeNull();
    expect(dropTarget(m, { x: -1, y: 2 })).toBeNull();
    expect(dropTarget(m, { x: 40, y: 40 })).toBeNull();
  });

  it('nothing is a valid drop without a token', () => {
    expect(dropTarget(sample(null), { x: 4, y: 4 })).toBeNull();
  });

  it('a locked door blocks the drop beyond it', () => {
    const m = sample();
    const locked = { ...m, doors: [{ ...m.doors[0]!, lock: { locked: true, note: '', quality: 7 } }] } as DungeonMap;
    expect(dropTarget(locked, { x: 3, y: 6 })).toBeNull();
  });
});

describe('onToken', () => {
  it('a press inside the token’s square grabs it', () => {
    expect(onToken({ x: 2, y: 2 }, { x: 2.05, y: 2.95 }, 60)).toBe(true);
    expect(onToken({ x: 2, y: 2 }, { x: 3.05, y: 2.5 }, 60)).toBe(false);
  });

  it('zoomed out, a 22 px radius around the token centre still grabs it (a 44 px touch target)', () => {
    // 10 px per square: the square is only 10 px wide, but 2 squares (20 px) from the centre counts.
    expect(onToken({ x: 2, y: 2 }, { x: 4.4, y: 2.5 }, 10)).toBe(true);
    expect(onToken({ x: 2, y: 2 }, { x: 4.8, y: 2.5 }, 10)).toBe(false);
  });

  it('no token, nothing to grab', () => {
    expect(onToken(null, { x: 2.5, y: 2.5 }, 60)).toBe(false);
  });
});

describe('dragOverlay', () => {
  it('marks a valid drop square ok and anything else on the map bad', () => {
    const m = sample();
    expect(dragOverlay(m, { x: 4, y: 4 })).toEqual([{ kind: 'cell', at: { x: 4, y: 4 }, tone: 'ok' }]);
    expect(dragOverlay(m, { x: 6, y: 6 })).toEqual([{ kind: 'cell', at: { x: 6, y: 6 }, tone: 'bad' }]);
  });

  it('nothing over the token’s own square or outside the map', () => {
    const m = sample();
    expect(dragOverlay(m, { x: 2, y: 2 })).toEqual([]);
    expect(dragOverlay(m, { x: -1, y: 4 })).toEqual([]);
    expect(dragOverlay(m, { x: 4, y: 10 })).toEqual([]);
  });

  it('the entrance square just outside the map still shows', () => {
    const base = sample();
    const m = { ...base, rooms: [...base.rooms, room('e', 2, 10, 1, 1, 'entrance')] };
    expect(dragOverlay(m, { x: 2, y: 10 })).toEqual([{ kind: 'cell', at: { x: 2, y: 10 }, tone: 'bad' }]);
  });
});
