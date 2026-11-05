// The always-available dice roller: rolling, totals, the short history and remembered choices.
// Rolling here never touches the game: nothing goes on the History or into the save.
import type { DiceKind } from '../systems/dungeon/encounterText';
import { d3FromD6, rollD6, type Rng } from '../systems/dungeon/rules';

export type { DiceKind };

/** The die chips, in order. */
export const DICE: { kind: DiceKind; label: string }[] = [
  { kind: 'd6', label: 'D6' },
  { kind: '2d6', label: '2D6' },
  { kind: 'd66', label: 'D66' },
  { kind: 'd3', label: 'D3' },
];

export const diceLabel = (kind: DiceKind): string => DICE.find((d) => d.kind === kind)?.label ?? kind.toUpperCase();

/** The faces rolled: one D6 for D6 and D3 (a D6 read in halves), two for 2D6 and D66 (red first). */
export function rollDice(kind: DiceKind, rng: Rng): number[] {
  if (kind === 'd6' || kind === 'd3') return [rollD6(rng)];
  return [rollD6(rng), rollD6(rng)];
}

/**
 * "9" for 2D6 (the sum), "34" for D66 (red tens, blue units), "3" for D3 (a 5 read in halves), the
 * face for D6; plus any modifier (never on a D66). A modified roll is a damage roll: it never goes
 * below 0, and a 6 on a D6 or 2D6 always does at least 1.
 */
export function rollTotal(kind: DiceKind, faces: number[], modifier = 0): string {
  if (kind === 'd66') return faces.join('');
  const base = kind === '2d6' ? faces.reduce((a, b) => a + b, 0) : kind === 'd3' ? d3FromD6(faces[0] ?? 0) : (faces[0] ?? 0);
  if (!modifier) return String(base);
  const floor = kind !== 'd3' && faces.includes(6) ? 1 : 0;
  return String(Math.max(floor, base + modifier));
}

const signed = (n: number) => (n < 0 ? `−${-n}` : `+${n}`);
const step = (n: number) => (n < 0 ? ` − ${-n}` : ` + ${n}`);

/** "D6", or with a modifier "D6 −1", "2D6 +7". */
export function rollLabel(kind: DiceKind, modifier = 0): string {
  return modifier ? `${diceLabel(kind)} ${signed(modifier)}` : diceLabel(kind);
}

/** A history line: "2D6: 4 + 5 = 9", "D66: 34", "D6: 4", "D3: 5 → 3", "D6 −1: 4 − 1 = 3". */
export function describeRoll(kind: DiceKind, faces: number[], modifier = 0): string {
  const total = rollTotal(kind, faces, modifier);
  const label = rollLabel(kind, modifier);
  if (kind === 'd66') return `${label}: ${total}`;
  const mod = modifier ? step(modifier) : '';
  if (kind === 'd3') return mod ? `${label}: ${faces[0]} → ${d3FromD6(faces[0] ?? 0)}${mod} = ${total}` : `${label}: ${faces[0]} → ${total}`;
  if (kind === '2d6') return `${label}: ${faces.join(' + ')}${mod} = ${total}`;
  return mod ? `${label}: ${faces[0]}${mod} = ${total}` : `${label}: ${total}`;
}

/**
 * A damage text such as "D6 -1" or "2D6 +7" as a die and a modifier; null for a fixed number or
 * dice the roller doesn't have. A card's "D6 -2 damage + special attack - …" reads as D6 −2.
 */
export function parseDamage(text: string): { dice: DiceKind; modifier: number } | null {
  const plain = text.replace(/\s*\+\s*special\b.*$/i, '').replace(/\s*damage\b.*$/i, '');
  const m = /^\s*(2d6|d6|d3)\s*(?:([+\-−])\s*(\d+))?\s*$/i.exec(plain);
  if (!m) return null;
  const dice = m[1]!.toLowerCase() as DiceKind;
  const n = m[3] ? Number(m[3]) : 0;
  return { dice, modifier: m[2] === '+' || n === 0 ? n : -n };
}

export const HISTORY_SIZE = 5;

/** Newest first, at most five. */
export function addToHistory(list: string[], entry: string, max = HISTORY_SIZE): string[] {
  return [entry, ...list].slice(0, max);
}

export const DICE_PREFS_KEY = '2d6.diceRoller';

export interface DicePrefs {
  open: boolean;
  dice: DiceKind;
}

const DEFAULT_PREFS: DicePrefs = { open: false, dice: 'd6' };

type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;

/** The remembered panel state; the defaults when storage is missing, blocked or holds something else. */
export function readDicePrefs(storage: Storage | undefined): DicePrefs {
  try {
    const raw = storage?.getItem(DICE_PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const v = JSON.parse(raw) as Partial<DicePrefs>;
    if (typeof v.open !== 'boolean' || !DICE.some((d) => d.kind === v.dice)) return { ...DEFAULT_PREFS };
    return { open: v.open, dice: v.dice as DiceKind };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function writeDicePrefs(storage: Storage | undefined, prefs: DicePrefs): void {
  try {
    storage?.setItem(DICE_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable: the panel just forgets */
  }
}
