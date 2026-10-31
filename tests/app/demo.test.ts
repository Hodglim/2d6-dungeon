import { demoMap } from '../../src/app/demo';
import { checkInvariants } from '../../src/core/invariants';

describe('demoMap', () => {
  it('is a valid dungeon with at least five rooms', () => {
    const m = demoMap();
    expect(checkInvariants(m)).toBeNull();
    expect(m.rooms.filter((r) => r.kind === 'room').length).toBeGreaterThanOrEqual(5);
    expect(m.doors.some((d) => d.secret)).toBe(true);
    expect(m.doors.some((d) => d.lock?.locked)).toBe(true);
    expect(m.features.map((f) => f.kind).sort()).toEqual(['note', 'stairs']);
  });
});
