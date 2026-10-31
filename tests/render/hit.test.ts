import { EDGE_TOLERANCE, pick } from '../../src/render/hit';
import { door, emptyMap, room, withContent } from '../core/fixtures';

describe('pick', () => {
  const map = withContent(
    emptyMap(12, 12),
    [room('r1', 3, 3, 4, 3, 'room', 1)],
    [door('d1', 4, 3, 'N', 'wooden'), door('d2', 7, 4, 'W')],
  );

  it('gives the square with no edge at its centre', () => {
    const p = pick(map, { x: 4.5, y: 4.5 });
    expect(p.cell).toEqual({ x: 4, y: 4 });
    expect(p.edge).toBeNull();
    expect(p.door).toBeNull();
    expect(p.room?.id).toBe('r1');
    expect(p.exit).toBeNull();
  });

  it('snaps to a wall edge and reports its door', () => {
    const p = pick(map, { x: 4.5, y: 3 + EDGE_TOLERANCE / 2 });
    expect(p.edge).toEqual({ x: 4, y: 3, side: 'N' });
    expect(p.door?.id).toBe('d1');
    expect(p.exit).toBe(p.door); // d1 has a room on one side only
  });

  it('gives an edge without a door as door null', () => {
    const p = pick(map, { x: 5.5, y: 3.05 });
    expect(p.edge).toEqual({ x: 5, y: 3, side: 'N' });
    expect(p.door).toBeNull();
  });

  it('finds west/east edges from either side', () => {
    expect(pick(map, { x: 6.95, y: 4.5 }).edge).toEqual({ x: 7, y: 4, side: 'W' });
    expect(pick(map, { x: 7.05, y: 4.5 }).edge).toEqual({ x: 7, y: 4, side: 'W' });
  });

  it('does not throw outside the world', () => {
    const p = pick(map, { x: -3.2, y: 40.7 });
    expect(p.cell).toEqual({ x: -4, y: 40 });
    expect(p.room).toBeNull();
  });
});
