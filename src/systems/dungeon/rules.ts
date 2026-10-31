// Dice and room-size rules for the 2D6 dungeon system (pure, no UI imports).
// Primary (red) die = width, secondary (blue) die = height.

export type Rng = () => number; // [0,1)
export interface D66 {
  primary: number;
  secondary: number;
}
export type SizeClass = 'normal' | 'small' | 'large';
export interface RoomSize {
  w: number;
  h: number;
  corridor: boolean;
  doubled: boolean;
}

export function rollD6(rng: Rng): number {
  return Math.floor(rng() * 6) + 1;
}

export function rollD66(rng: Rng): D66 {
  const primary = rollD6(rng);
  const secondary = rollD6(rng);
  return { primary, secondary };
}

export function parseDie(text: string): number | null {
  const t = text.trim();
  return /^[1-6]$/.test(t) ? Number(t) : null;
}

// Non-six doubles earn a second roll, except for the entrance room.
export function needsSecondRoll(first: D66, entrance: boolean): boolean {
  return !entrance && first.primary === first.secondary && first.primary !== 6;
}

export function clampEntranceArea(w: number, h: number): { w: number; h: number } {
  while (w * h > 12) {
    if (w >= h) w--;
    else h--;
  }
  while (w * h < 6) {
    if (w < h) w++;
    else h++;
  }
  return { w, h };
}

export function resolveRoomSize(first: D66, second: D66 | null, entrance: boolean): RoomSize {
  if (entrance) {
    const { w, h } = clampEntranceArea(first.primary, first.secondary);
    return { w, h, corridor: false, doubled: false };
  }
  const isDouble = first.primary === first.secondary;
  const corridor = !isDouble && (first.primary === 1 || first.secondary === 1);
  const doubled = isDouble && second !== null;
  return {
    w: first.primary + (doubled ? second.primary : 0),
    h: first.secondary + (doubled ? second.secondary : 0),
    corridor,
    doubled,
  };
}

export function classify(rect: { w: number; h: number }, size: RoomSize): SizeClass | 'corridor' {
  if (size.corridor || Math.min(rect.w, rect.h) === 1) return 'corridor';
  const area = rect.w * rect.h;
  if (area <= 6) return 'small';
  if (area >= 32 && size.doubled) return 'large';
  return 'normal';
}

export function exitCountFor(d6: number): 0 | 1 | 2 | 3 {
  if (d6 <= 1) return 0;
  if (d6 <= 3) return 1;
  if (d6 <= 5) return 2;
  return 3;
}

export function firstWallIndex(d6: number): 0 | 1 | 2 {
  if (d6 <= 2) return 0;
  if (d6 <= 4) return 1;
  return 2;
}
