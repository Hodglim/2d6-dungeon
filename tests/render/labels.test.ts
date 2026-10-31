import { rectsOverlap } from '../../src/core/geometry';
import { anchorPoint, doorZone, labelText, type MeasureText, placeLabels } from '../../src/render/labels';
import { door, emptyMap, room, withContent } from '../core/fixtures';

// Every character is 0.2 squares wide; boxes are 0.5 tall.
const measure: MeasureText = (t) => ({ w: t.length * 0.2, h: 0.5 });

function named(id: string, x: number, y: number, w: number, h: number, n: number, type: string, entryDoorId: string | null) {
  return { ...room(id, x, y, w, h, 'room', n), label: { type, unique: false, narrative: '' }, entryDoorId };
}

describe('labels', () => {
  it('formats "N - Type", or just N without a type', () => {
    expect(labelText(named('a', 0, 0, 1, 1, 3, 'Shrine', null))).toBe('3 - Shrine');
    expect(labelText(named('a', 0, 0, 1, 1, 3, '  ', null))).toBe('3');
  });

  it('anchors at the entry door', () => {
    const m = withContent(emptyMap(), [named('a', 2, 2, 4, 3, 1, 'X', 'd')], [door('d', 3, 5, 'N')]);
    expect(anchorPoint(m, m.rooms[0]!)).toEqual({ x: 3.5, y: 5 });
  });

  it('places a short label inside the room near its entry door, clear of the door', () => {
    const m = withContent(emptyMap(20, 20), [named('a', 2, 2, 6, 4, 1, 'Hall', 'd')], [door('d', 4, 6, 'N')]);
    const [box] = placeLabels(m, measure);
    expect(box!.text).toBe('1 - Hall');
    // Inside the room…
    expect(box!.x).toBeGreaterThanOrEqual(2);
    expect(box!.x + box!.w).toBeLessThanOrEqual(8);
    expect(box!.y).toBeGreaterThanOrEqual(2);
    expect(box!.y + box!.h).toBeLessThanOrEqual(6);
    // …in the half nearest the door (bottom wall)…
    expect(box!.y).toBeGreaterThan(4);
    // …and not over the door.
    expect(rectsOverlap(box!, doorZone(m.doors[0]!))).toBe(false);
  });

  it('moves a label that does not fit inside onto the rock, overlapping no room', () => {
    const m = withContent(
      emptyMap(20, 20),
      [named('a', 8, 8, 2, 2, 1, 'Collapsed Armoury', 'd'), room('b', 10, 8, 3, 2, 'passage')],
      [door('d', 8, 10, 'N')],
    );
    const box = placeLabels(m, measure).find((l) => l.roomId === 'a')!;
    expect(box.w).toBeCloseTo(4.2);
    for (const r of m.rooms) expect(rectsOverlap(box, r)).toBe(false);
  });

  it('never overlaps two labels', () => {
    const m = withContent(
      emptyMap(20, 20),
      [named('a', 2, 2, 2, 1, 1, 'Long Name Here', null), named('b', 4, 2, 2, 1, 2, 'Another Long One', null)],
    );
    const [a, b] = placeLabels(m, measure);
    expect(rectsOverlap(a!, b!)).toBe(false);
  });

  it('ignores passages and the entrance', () => {
    const m = withContent(emptyMap(), [room('p', 1, 1, 1, 1, 'passage'), room('e', 1, 10, 1, 1, 'entrance')]);
    expect(placeLabels(m, measure)).toEqual([]);
  });
});
