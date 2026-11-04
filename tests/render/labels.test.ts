import { rectsOverlap } from '../../src/core/geometry';
import type { Rect } from '../../src/core/types';
import { doorZone, featureZone, type LabelBox, labelText, type MeasureText, placeLabels, wrapLabel } from '../../src/render/labels';
import { door, emptyMap, room, withContent } from '../core/fixtures';

// Every character is 0.2 squares wide; one line is 0.5 tall.
const measure: MeasureText = (t) => ({ w: t.length * 0.2, h: 0.5 });

function named(id: string, x: number, y: number, w: number, h: number, n: number, type: string, entryDoorId: string | null = null) {
  return { ...room(id, x, y, w, h, 'room', n), label: { type, unique: false, narrative: '' }, entryDoorId };
}

const EPS = 1e-9;
function inside(box: Rect, r: Rect): boolean {
  return box.x >= r.x - EPS && box.y >= r.y - EPS && box.x + box.w <= r.x + r.w + EPS && box.y + box.h <= r.y + r.h + EPS;
}
const centre = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

describe('labelText', () => {
  it('formats "N - Type", or just N without a type', () => {
    expect(labelText(named('a', 0, 0, 1, 1, 3, 'Shrine'))).toBe('3 - Shrine');
    expect(labelText(named('a', 0, 0, 1, 1, 3, '  '))).toBe('3');
  });
});

describe('wrapLabel', () => {
  it('keeps the number and dash together and balances the widest line', () => {
    expect(wrapLabel(3, 'Collapsed Armoury', 2, measure)).toEqual(['3 - Collapsed', 'Armoury']);
    expect(wrapLabel(12, 'Hall of the Hollow King', 3, measure)).toEqual(['12 - Hall', 'of the', 'Hollow King']);
  });

  it('returns null when there are fewer words than lines', () => {
    expect(wrapLabel(3, 'Shrine', 3, measure)).toBeNull();
    expect(wrapLabel(3, 'Shrine', 2, measure)).toEqual(['3 -', 'Shrine']);
  });
});

describe('placeLabels', () => {
  it('centres a label that fits on one line inside its room, clear of the door', () => {
    const m = withContent(emptyMap(20, 20), [named('a', 2, 2, 6, 4, 1, 'Hall', 'd')], [door('d', 4, 6, 'N')]);
    const [box] = placeLabels(m, measure);
    expect(box!.text).toBe('1 - Hall');
    expect(box!.lines).toEqual(['1 - Hall']);
    expect(box!.badge).toBe(false);
    expect(inside(box!, m.rooms[0]!)).toBe(true);
    expect(centre(box!).x).toBeCloseTo(5);
    expect(centre(box!).y).toBeCloseTo(4);
    expect(rectsOverlap(box!, doorZone(m.doors[0]!))).toBe(false);
  });

  it('moves off the centre only to keep clear of a door', () => {
    // A 3×1 room with a door on its top wall over the middle square: the label slides down off it.
    const m = withContent(emptyMap(20, 20), [named('a', 2, 2, 3, 1, 1, 'Den', 'd')], [door('d', 3, 2, 'N')]);
    const [box] = placeLabels(m, measure);
    expect(box!.lines).toEqual(['1 - Den']);
    expect(box!.y).toBeGreaterThanOrEqual(2.36 - EPS);
    expect(centre(box!).x).toBeCloseTo(3.5);
    expect(inside(box!, m.rooms[0]!)).toBe(true);
    expect(rectsOverlap(box!, doorZone(m.doors[0]!))).toBe(false);
  });

  it('wraps a long name onto two lines when one line is too wide', () => {
    // 4.2 wide on one line, 2.6 on two; the room is 3 wide, 2 tall.
    const m = withContent(emptyMap(20, 20), [named('a', 4, 4, 3, 2, 7, 'Collapsed Armoury')]);
    const [box] = placeLabels(m, measure);
    expect(box!.text).toBe('7 - Collapsed Armoury');
    expect(box!.lines).toEqual(['7 - Collapsed', 'Armoury']);
    expect(box!.h).toBeCloseTo(1);
    expect(inside(box!, m.rooms[0]!)).toBe(true);
  });

  it('wraps onto three lines when two are still too wide', () => {
    // Two lines need 3.0 squares; three need 2.2 × 1.5; the room is 3 × 2.
    const m = withContent(emptyMap(20, 20), [named('a', 4, 4, 3, 2, 7, 'Hall of the Hollow King')]);
    const [box] = placeLabels(m, measure);
    expect(box!.lines).toEqual(['7 - Hall', 'of the', 'Hollow King']);
    expect(box!.h).toBeCloseTo(1.5);
    expect(inside(box!, m.rooms[0]!)).toBe(true);
  });

  it('falls back to the number alone, as a badge, in a 1-wide corridor room', () => {
    const m = withContent(emptyMap(20, 20), [named('a', 4, 2, 1, 6, 5, 'Narrow Gallery')], [door('d', 4, 2, 'N'), door('e', 4, 8, 'N')]);
    const [box] = placeLabels(m, measure);
    expect(box!.text).toBe('5 - Narrow Gallery');
    expect(box!.lines).toEqual(['5']);
    expect(box!.badge).toBe(true);
    expect(inside(box!, m.rooms[0]!)).toBe(true);
    for (const d of m.doors) expect(rectsOverlap(box!, doorZone(d))).toBe(false);
  });

  it('fits the number alone in a 2×2 room', () => {
    const m = withContent(emptyMap(20, 20), [named('a', 4, 4, 2, 2, 12, 'Ossuary of Forgotten Saints')]);
    const [box] = placeLabels(m, measure);
    expect(box!.lines).toEqual(['12']);
    expect(inside(box!, m.rooms[0]!)).toBe(true);
    expect(centre(box!).x).toBeCloseTo(5);
    expect(centre(box!).y).toBeCloseTo(5);
  });

  it('a badge is at least as wide as it is tall', () => {
    const m = withContent(emptyMap(20, 20), [named('a', 4, 4, 1, 1, 3, 'Shrine')]);
    const [box] = placeLabels(m, measure);
    expect(box!.badge).toBe(true);
    expect(box!.w).toBeGreaterThanOrEqual(box!.h - EPS);
  });

  it('shows just the number for a room with no type, without a badge if it fits as text', () => {
    const m = withContent(emptyMap(20, 20), [named('a', 4, 4, 3, 3, 9, '')]);
    const [box] = placeLabels(m, measure);
    expect(box!.text).toBe('9');
    expect(box!.lines).toEqual(['9']);
    expect(inside(box!, m.rooms[0]!)).toBe(true);
  });

  it('centres the number inside the room even when nothing is clear', () => {
    // 1×1 room with doors on its top and bottom walls: no clear spot at all.
    const m = withContent(emptyMap(20, 20), [named('a', 4, 4, 1, 1, 4, 'Cell')], [door('d', 4, 4, 'N'), door('e', 4, 5, 'N')]);
    const [box] = placeLabels(m, measure);
    expect(box!.lines).toEqual(['4']);
    expect(inside(box!, m.rooms[0]!)).toBe(true);
    expect(centre(box!).x).toBeCloseTo(4.5);
    expect(centre(box!).y).toBeCloseTo(4.5);
  });

  it('never puts a label outside its own room or over another label, on a crowded map', () => {
    const rooms = [
      named('a', 0, 0, 2, 2, 1, 'Collapsed Armoury'),
      named('b', 2, 0, 1, 4, 2, 'Very Long Gallery Name'),
      named('c', 3, 0, 2, 2, 3, 'Shrine'),
      named('d', 0, 2, 2, 2, 4, 'Burrow of the Grey Hounds'),
      named('e', 3, 2, 3, 1, 5, 'Crypt'),
      named('f', 5, 0, 1, 2, 6, ''),
      room('p', 0, 4, 6, 1, 'passage'),
    ];
    const doors = [door('d1', 0, 2, 'N'), door('d2', 2, 1, 'W'), door('d3', 3, 1, 'W'), door('d4', 3, 2, 'N'), door('d5', 5, 1, 'W')];
    const m = withContent(emptyMap(8, 8), rooms, doors);
    const boxes = placeLabels(m, measure);
    expect(boxes.map((b) => b.roomId)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    for (const [i, box] of boxes.entries()) {
      const own = m.rooms.find((r) => r.id === box.roomId)!;
      expect(inside(box, own)).toBe(true);
      for (const r of m.rooms) if (r !== own) expect(rectsOverlap(box, r)).toBe(false);
      for (const o of boxes.slice(i + 1)) expect(rectsOverlap(box, o)).toBe(false);
    }
  });

  it('is deterministic: the same map gives the same layout', () => {
    const m = withContent(
      emptyMap(20, 20),
      [named('a', 2, 2, 3, 3, 1, 'Long Name Here'), named('b', 5, 2, 2, 3, 2, 'Another Long One'), named('c', 7, 2, 1, 3, 3, 'Hall')],
      [door('d', 5, 3, 'W')],
    );
    const first: LabelBox[] = placeLabels(m, measure);
    expect(placeLabels(m, measure)).toEqual(first);
    expect(placeLabels(structuredClone(m), measure)).toEqual(first);
  });

  it('keeps clear of a note pin in the room centre', () => {
    const base = withContent(emptyMap(20, 20), [named('a', 2, 2, 6, 3, 1, 'Hall')]);
    const note = { id: 'n', kind: 'note' as const, x: 4, y: 3, text: 'Bones' };
    const m = { ...base, features: [note] };
    const [box] = placeLabels(m, measure);
    expect(box!.lines).toEqual(['1 - Hall']);
    expect(inside(box!, m.rooms[0]!)).toBe(true);
    expect(rectsOverlap(box!, featureZone(note))).toBe(false);
  });

  it('keeps clear of stairs, falling back to the number when the name has no room left', () => {
    // A 3×1 room with stairs in its middle square: "1 - Den" (1.4 wide) fits neither side; "1" does.
    const base = withContent(emptyMap(20, 20), [named('a', 2, 2, 3, 1, 1, 'Den')]);
    const stairs = { id: 's', kind: 'stairs' as const, x: 3, y: 2, dir: 'down' as const };
    const m = { ...base, features: [stairs] };
    const [box] = placeLabels(m, measure);
    expect(box!.lines).toEqual(['1']);
    expect(inside(box!, m.rooms[0]!)).toBe(true);
    expect(rectsOverlap(box!, featureZone(stairs))).toBe(false);
  });

  it('a feature zone covers the drawn icon within its square', () => {
    const z = featureZone({ id: 'n', kind: 'note', x: 4, y: 3, text: '' });
    expect(z.x).toBeGreaterThanOrEqual(4);
    expect(z.x + z.w).toBeLessThanOrEqual(5);
    expect(z.y).toBeLessThanOrEqual(3.28);
    expect(z.y + z.h).toBeGreaterThanOrEqual(3.78);
  });

  it('ignores passages and the entrance', () => {
    const m = withContent(emptyMap(), [room('p', 1, 1, 1, 1, 'passage'), room('e', 1, 10, 1, 1, 'entrance')]);
    expect(placeLabels(m, measure)).toEqual([]);
  });
});
