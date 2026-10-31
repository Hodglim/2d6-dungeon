import { checkInvariants } from '../../src/core/invariants';
import { door, emptyMap, room, withContent } from './fixtures';

// A 3x2 room at (4,4) with an open exit on its top wall at x=5 (edge (5,4,N)).
function mapWithTopExit() {
  return withContent(emptyMap(10, 10), [room('a', 4, 4, 3, 2, 'room', 1)], [door('d', 5, 4, 'N')]);
}

describe('checkInvariants', () => {
  it('accepts a valid map', () => {
    expect(checkInvariants(mapWithTopExit())).toBeNull();
  });
  it('rejects overlapping rooms', () => {
    const m = withContent(emptyMap(), [room('a', 1, 1, 3, 3), room('b', 2, 2, 3, 3)]);
    expect(checkInvariants(m)).toMatch(/overlaps/);
  });
  it('rejects a room crossing the boundary', () => {
    const m = withContent(emptyMap(5, 5), [room('a', 3, 3, 3, 1)]);
    expect(checkInvariants(m)).toMatch(/Outer Boundary/);
  });
  it('rejects a door on the boundary unless it belongs to the entrance', () => {
    const bad = withContent(emptyMap(5, 5), [room('a', 2, 4, 1, 1)], [door('d', 2, 5, 'N')]);
    expect(checkInvariants(bad)).toMatch(/Outer Boundary/);
    const ok = withContent(
      emptyMap(5, 5),
      [room('a', 2, 4, 1, 1), room('e', 2, 5, 1, 1, 'entrance')],
      [door('d', 2, 5, 'N')],
    );
    expect(checkInvariants(ok)).toBeNull();
  });
  it('rejects an entrance that is not beside the boundary', () => {
    const m = withContent(emptyMap(5, 5), [room('e', 2, 6, 1, 1, 'entrance')]);
    expect(checkInvariants(m)).toMatch(/entrance/);
  });
  it('rejects a door attached to nothing', () => {
    const m = withContent(emptyMap(), [], [door('d', 3, 3, 'N')]);
    expect(checkInvariants(m)).toMatch(/not attached/);
  });
  it('rejects a door whose two sides are the same room', () => {
    const m = withContent(emptyMap(), [room('a', 4, 2, 3, 4)], [door('d', 5, 4, 'N')]);
    expect(checkInvariants(m)).toBe('A door is inside a room');
  });
  it('rejects a door on the entrance that is not on the boundary', () => {
    const m = withContent(emptyMap(10, 10), [room('e', 2, 10, 1, 1, 'entrance')], [door('d', 2, 10, 'W')]);
    expect(checkInvariants(m)).toBe('Doors on the entrance must lead into the map');
  });
  it('accepts the entrance inward door', () => {
    const m = withContent(
      emptyMap(10, 10),
      [room('e', 2, 10, 1, 1, 'entrance'), room('a', 2, 9, 1, 1)],
      [door('d', 2, 10, 'N')],
    );
    expect(checkInvariants(m)).toBeNull();
  });
  it('rejects two doors on one edge', () => {
    const m = withContent(emptyMap(), [room('a', 2, 2, 2, 2)], [door('d1', 2, 2, 'N'), door('d2', 2, 2, 'N')]);
    expect(checkInvariants(m)).toBe('Two doors share one edge');
  });
  it('rejects more than one entrance', () => {
    const m = withContent(emptyMap(10, 10), [
      room('e1', 2, 10, 1, 1, 'entrance'),
      room('e2', 4, 10, 1, 1, 'entrance'),
    ]);
    expect(checkInvariants(m)).toBe('A map can have only one entrance');
  });
});

describe('entry door invariant', () => {
  it('rejects a room whose entry door is missing or not on its wall', () => {
    const missing = withContent(emptyMap(), [{ ...room('a', 2, 2, 2, 2, 'room', 1), entryDoorId: 'gone' }]);
    expect(checkInvariants(missing)).toMatch(/lost the door/);
    const elsewhere = withContent(
      emptyMap(),
      [{ ...room('a', 2, 2, 2, 2, 'room', 1), entryDoorId: 'd' }, room('b', 6, 6, 1, 1)],
      [door('d', 6, 6, 'N')],
    );
    expect(checkInvariants(elsewhere)).toMatch(/lost the door/);
  });
  it('accepts a room whose entry door is on its wall', () => {
    const ok = withContent(emptyMap(), [{ ...room('a', 2, 2, 2, 2, 'room', 1), entryDoorId: 'd' }], [door('d', 2, 4, 'N')]);
    expect(checkInvariants(ok)).toBeNull();
  });
});
