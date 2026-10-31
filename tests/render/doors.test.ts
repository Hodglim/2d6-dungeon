import { doorGlyphs, exitStubs } from '../../src/render/doors';
import { door, emptyMap, room, withContent } from '../core/fixtures';

describe('door glyphs', () => {
  it('centres on the edge and points into the room', () => {
    // Open exit on the top wall of a room: room is south of the edge → rotation 0.
    const top = withContent(emptyMap(), [room('a', 2, 2, 2, 2)], [door('d', 2, 2, 'N')]);
    expect(doorGlyphs(top)[0]).toMatchObject({ cx: 2.5, cy: 2, rotation: 0, open: true });
    // Open exit on the bottom wall: room is north → rotation π.
    const bottom = withContent(emptyMap(), [room('a', 2, 2, 2, 2)], [door('d', 2, 4, 'N')]);
    expect(doorGlyphs(bottom)[0]!.rotation).toBeCloseTo(Math.PI);
    // Left wall: room is east → -π/2. Right wall: room is west → π/2.
    const left = withContent(emptyMap(), [room('a', 2, 2, 2, 2)], [door('d', 2, 2, 'W')]);
    expect(doorGlyphs(left)[0]).toMatchObject({ cx: 2, cy: 2.5 });
    expect(doorGlyphs(left)[0]!.rotation).toBeCloseTo(-Math.PI / 2);
    const right = withContent(emptyMap(), [room('a', 2, 2, 2, 2)], [door('d', 4, 2, 'W')]);
    expect(doorGlyphs(right)[0]!.rotation).toBeCloseTo(Math.PI / 2);
  });
  it('reports secret, lock and open state', () => {
    const d = { ...door('d', 4, 2, 'W'), secret: true, lock: { locked: true, note: '' } };
    const m = withContent(emptyMap(), [room('a', 2, 2, 2, 2), room('b', 4, 2, 2, 2)], [d]);
    expect(doorGlyphs(m)[0]).toMatchObject({ secret: true, locked: true, open: false });
  });
});

describe('exit stubs', () => {
  it('point outward from open exits only', () => {
    const m = withContent(
      emptyMap(),
      [room('a', 2, 2, 2, 2), room('b', 4, 2, 2, 2)],
      [door('open', 2, 2, 'N'), door('shut', 4, 2, 'W')],
    );
    expect(exitStubs(m)).toEqual([{ doorId: 'open', cx: 2.5, cy: 2, dx: 0, dy: -1 }]);
  });
});
