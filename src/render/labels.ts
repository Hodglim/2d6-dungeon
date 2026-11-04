import { rectsOverlap } from '../core/geometry';
import type { DungeonMap, Feature, Rect, Room } from '../core/types';

export interface LabelBox extends Rect {
  roomId: string;
  /** The full label ("N - Type", or "N"), whatever is shown. */
  text: string;
  /** What is drawn, one entry per line, each centred in the box. */
  lines: string[];
  /** True when only the number is shown because the full label didn't fit. */
  badge: boolean;
}

/** Size of one line of text, padding included, in grid units. */
export type MeasureText = (text: string) => { w: number; h: number };

const STEP = 0.25;
/** Labels keep this far inside their room's walls. */
const INSET = 0.12;
const MAX_LINES = 3;

export function labelText(room: Room): string {
  const type = room.label.type.trim();
  return type ? `${room.number} - ${type}` : `${room.number}`;
}

/**
 * Wrap "N - Type" at word boundaries into exactly `lines` lines, keeping "N -" together and
 * making the widest line as narrow as possible, then the lines as even as possible.
 * Null when there are too few words.
 */
export function wrapLabel(number: number, type: string, lines: number, measure: MeasureText): string[] | null {
  const words = [`${number} -`, ...type.trim().split(/\s+/).filter(Boolean)];
  if (words.length < lines) return null;
  let best: string[] | null = null;
  let bestW = Infinity;
  let bestSq = Infinity;
  const split = (from: number, left: number, acc: string[]): void => {
    if (left === 1) {
      const all = [...acc, words.slice(from).join(' ')];
      const ws = all.map((l) => measure(l).w);
      const w = Math.max(...ws);
      const sq = ws.reduce((sum, x) => sum + x * x, 0);
      if (w < bestW - 1e-9 || (w < bestW + 1e-9 && sq < bestSq - 1e-9)) {
        bestW = w;
        bestSq = sq;
        best = all;
      }
      return;
    }
    for (let end = from + 1; end <= words.length - left + 1; end++) split(end, left - 1, [...acc, words.slice(from, end).join(' ')]);
  };
  split(0, lines, []);
  return best;
}

/**
 * Place a boxed label inside every numbered room, never outside its walls. Each room tries,
 * in order: "N - Type" on one line, wrapped onto 2 then 3 lines, then the number alone as a
 * badge — taking the first that fits clear of door symbols and features (notes, stairs), as
 * near the room's centre as possible. If even the badge has no clear spot it is centred in
 * the room regardless (features are drawn above labels, so they stay visible).
 */
export function placeLabels(map: DungeonMap, measure: MeasureText): LabelBox[] {
  const placed: LabelBox[] = [];
  const rooms = map.rooms.filter((r) => r.kind === 'room').sort((a, b) => a.number - b.number);
  // Door symbols, note pins and stairs stay visible: labels keep clear of them.
  const obstacles = [...map.doors.map(doorZone), ...map.features.map(featureZone)];
  for (const room of rooms) {
    const text = labelText(room);
    const zones = obstacles.filter((z) => rectsOverlap(z, room));
    const free = (r: Rect) => !zones.some((z) => rectsOverlap(z, r));
    const tryLines = (lines: string[], badge: boolean): LabelBox | null => {
      const sizes = lines.map(measure);
      let w = Math.max(...sizes.map((s) => s.w));
      const h = sizes.reduce((sum, s) => sum + s.h, 0);
      if (badge) w = Math.max(w, h);
      const rect = bestSpot(room, w, h, free);
      return rect && { ...rect, roomId: room.id, text, lines, badge };
    };
    let box = tryLines([text], false);
    const type = room.label.type.trim();
    for (let n = 2; !box && type && n <= MAX_LINES; n++) {
      const wrapped = wrapLabel(room.number, type, n, measure);
      if (wrapped) box = tryLines(wrapped, false);
    }
    const number = `${room.number}`;
    const badge = type !== '';
    box ??= tryLines([number], badge);
    if (!box) {
      const s = measure(number);
      const w = badge ? Math.max(s.w, s.h) : s.w;
      box = { x: room.x + (room.w - w) / 2, y: room.y + (room.h - s.h) / 2, w, h: s.h, roomId: room.id, text, lines: [number], badge };
    }
    placed.push(box);
  }
  return placed;
}

/** Positions along one axis from lo to hi, stepping out from `centre` (clamped), edges included. */
function axis(lo: number, hi: number, centre: number): number[] {
  if (hi < lo - 1e-9) return [];
  const c = Math.max(lo, Math.min(hi, centre));
  const out = [c];
  for (let k = 1; c - k * STEP >= lo - 1e-9 || c + k * STEP <= hi + 1e-9; k++) {
    if (c - k * STEP >= lo - 1e-9) out.push(c - k * STEP);
    if (c + k * STEP <= hi + 1e-9) out.push(c + k * STEP);
  }
  out.push(lo, hi);
  return out;
}

/** The clear spot for a w×h box inside the room whose centre is nearest the room's centre. */
function bestSpot(room: Room, w: number, h: number, ok: (r: Rect) => boolean): Rect | null {
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  const xs = axis(room.x + INSET, room.x + room.w - INSET - w, cx - w / 2);
  const ys = axis(room.y + INSET, room.y + room.h - INSET - h, cy - h / 2);
  let best: Rect | null = null;
  let bestScore = Infinity;
  for (const y of ys) {
    for (const x of xs) {
      const r = { x, y, w, h };
      const score = Math.hypot(x + w / 2 - cx, y + h / 2 - cy);
      if (score < bestScore - 1e-9 && ok(r)) {
        bestScore = score;
        best = r;
      }
    }
  }
  return best;
}

/** The area a door symbol (and its lock) occupies, which labels must keep clear of. */
export function doorZone(d: { x: number; y: number; side: 'N' | 'W' }): Rect {
  return d.side === 'N' ? { x: d.x, y: d.y - 0.36, w: 1, h: 0.72 } : { x: d.x - 0.36, y: d.y, w: 0.72, h: 1 };
}

/** The drawn icon of a note pin or stairs (see drawFeatures), plus a hair of margin. */
export function featureZone(f: Feature): Rect {
  const m = 0.04;
  return f.kind === 'stairs'
    ? { x: f.x + 0.15 - m, y: f.y + 0.18 - m, w: 0.7 + m * 2, h: 0.64 + m * 2 }
    : { x: f.x + 0.38 - m, y: f.y + 0.28 - m, w: 0.24 + m * 2, h: 0.5 + m * 2 };
}
