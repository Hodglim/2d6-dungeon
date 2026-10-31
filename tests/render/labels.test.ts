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

  it('puts a label for a room with no entry door inside, near its top-left', () => {
    const m = withContent(emptyMap(20, 20), [named('a', 4, 4, 6, 4, 1, 'Hall', null)]);
    const [box] = placeLabels(m, measure);
    expect(box!.x).toBeGreaterThanOrEqual(4);
    expect(box!.y).toBeGreaterThanOrEqual(4);
    expect(box!.x + box!.w).toBeLessThanOrEqual(10);
    expect(box!.x).toBeLessThan(5);
    expect(box!.y).toBeLessThan(5);
  });

  it('labels rooms in number order, so the lower number keeps its best spot', () => {
    const lowFirst = (arr: ReturnType<typeof named>[]) => withContent(emptyMap(20, 20), arr);
    const a = named('a', 5, 5, 1, 1, 2, 'Very Long Room Name', null);
    const b = named('b', 6, 5, 1, 1, 1, 'Very Long Room Name', null);
    const both = placeLabels(lowFirst([a, b]), measure);
    const alone = placeLabels(lowFirst([b]), measure);
    const boxB = both.find((l) => l.roomId === 'b')!;
    const boxA = both.find((l) => l.roomId === 'a')!;
    expect(boxB).toEqual(alone[0]);
    expect(rectsOverlap(boxA, boxB)).toBe(false);
  });

  it('still places every label inside the world, clear of rooms and each other, when nothing is near', () => {
    const p = (id: string, x: number, y: number, w: number, h: number) => room(id, x, y, w, h, 'passage');
    const rooms = [
      p('p1', 0, 0, 12, 1),
      p('p2', 0, 1, 4, 1),
      p('p3', 7, 1, 5, 1),
      p('p4', 0, 2, 12, 3),
      named('a', 4, 1, 1, 1, 1, 'Very Long Name One', null),
      named('b', 5, 1, 1, 1, 2, 'Very Long Name Two', null),
      named('c', 6, 1, 1, 1, 3, 'Very Long Name Three', null),
    ];
    const m = withContent(emptyMap(12, 6), rooms);
    const boxes = placeLabels(m, measure);
    expect(boxes).toHaveLength(3);
    for (const [i, box] of boxes.entries()) {
      expect(box.x).toBeGreaterThanOrEqual(-1);
      expect(box.y).toBeGreaterThanOrEqual(-1);
      expect(box.x + box.w).toBeLessThanOrEqual(13);
      expect(box.y + box.h).toBeLessThanOrEqual(7);
      for (const r of m.rooms) expect(rectsOverlap(box, r)).toBe(false);
      for (const o of boxes.slice(i + 1)) expect(rectsOverlap(box, o)).toBe(false);
    }
  });

  it('ignores passages and the entrance', () => {
    const m = withContent(emptyMap(), [room('p', 1, 1, 1, 1, 'passage'), room('e', 1, 10, 1, 1, 'entrance')]);
    expect(placeLabels(m, measure)).toEqual([]);
  });
});
