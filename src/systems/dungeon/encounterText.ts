import { findCreature } from './creatures';
import { findTable } from './referenceTables';
import type { DungeonTables } from './tables';

export type EncounterPart =
  | { kind: 'text'; text: string }
  | { kind: 'roll'; text: string; code: string; modifier: number }
  | { kind: 'table'; text: string; code: string; modifier: number }
  | { kind: 'fight'; text: string; name: string }
  | { kind: 'dice'; text: string; dice: DiceKind }
  | { kind: 'amount'; text: string; dice: DiceKind; modifier: number };

/** One D6, one D3, D66, or any number of D6s or D3s ("4d6", "10d6", "2d3"). */
export type DiceKind = 'd6' | 'd66' | 'd3' | `${number}d6` | `${number}d3`;

/** "Roll a D6", "roll 2D6", "Roll an D66", "Roll D3": "roll" (any case), an optional "a"/"an", then the dice. */
const DICE_RE = /(?<![A-Za-z0-9])roll\s+(?:an?\s+)?(3d6|2d6|2d3|3d3|d66|1?d6|d3)(?![A-Za-z0-9])/gi;

function diceKind(notation: string): DiceKind {
  const n = notation.toLowerCase();
  return n === '1d6' ? 'd6' : (n as DiceKind);
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const WORD = /[A-Z][A-Z'-]+/g;

function pushText(parts: EncounterPart[], text: string): void {
  if (!text) return;
  const last = parts[parts.length - 1];
  if (last && last.kind === 'text') last.text += text;
  else parts.push({ kind: 'text', text });
}

/** Find creature names among runs of capitalised words; the rest stays text. */
function scanFights(text: string, t: DungeonTables, parts: EncounterPart[]): void {
  const runRe = /[A-Z][A-Z'-]+(?:\s+[A-Z][A-Z'-]+)*/g;
  let pos = 0;
  for (const run of text.matchAll(runRe)) {
    const runStart = run.index!;
    const words = [...run[0].matchAll(WORD)].map((w) => ({ start: runStart + w.index!, end: runStart + w.index! + w[0].length }));
    let i = 0;
    while (i < words.length) {
      const first = words[i]!;
      let found = -1;
      let name = '';
      for (let j = words.length - 1; j >= i; j--) {
        const hit = findCreature(t, text.slice(first.start, words[j]!.end).replace(/\s+/g, ' '));
        if (hit) { found = j; name = hit.name; break; }
      }
      if (found < 0) { i++; continue; }
      const end = words[found]!.end;
      pushText(parts, text.slice(pos, first.start));
      parts.push({ kind: 'fight', text: text.slice(first.start, end), name });
      pos = end;
      i = found + 1;
    }
  }
  pushText(parts, text.slice(pos));
}

/** A reference-table id with a lowercase letter is a slug: reached from the list and search, never a code in text. */
export function isSlug(code: string): boolean {
  return /[a-z]/.test(code);
}

/** "+ 10 GC" after a code is coins as well as the roll, not a modifier on it: GC, SC, CC or gold. */
const COINS_AFTER = '(?!\\s*(?:[GSCgsc][Cc]|[Gg]old)(?![A-Za-z0-9]))';

interface Scanner { creatureCodes: Set<string>; re: RegExp | null }
const scanners = new WeakMap<DungeonTables, Scanner>();

/** The code pattern for a table file, built once per tables object. */
function scannerFor(t: DungeonTables): Scanner {
  let s = scanners.get(t);
  if (s) return s;
  const creatureCodes = new Set(Object.keys(t.tables.creatureTables ?? {}));
  const refCodes = Object.keys(t.tables.referenceTables ?? {}).filter((id) => !isSlug(id));
  const codes = [...new Set([...creatureCodes, ...refCodes])].sort((a, b) => b.length - a.length);
  const re = codes.length === 0
    ? null
    : new RegExp(`(?<![A-Za-z0-9])(${codes.map(escapeRe).join('|')})(?:\\s*([+\\-−–])\\s*(\\d+)${COINS_AFTER})?(?![A-Za-z0-9])`, 'g');
  s = { creatureCodes, re };
  scanners.set(t, s);
  return s;
}

export interface ScanOptions {
  /** false: creature names stay plain text (no fight scan). Default true. */
  fights?: boolean;
}

export function scanEncounter(text: string, t: DungeonTables | null, opts: ScanOptions = {}): EncounterPart[] {
  const parts: EncounterPart[] = [];
  // Dice phrases first, so a phrase never takes in a code after it; codes and names are found between them.
  let pos = 0;
  for (const m of text.matchAll(DICE_RE)) {
    scanCodes(text.slice(pos, m.index!), t, opts, parts);
    parts.push({ kind: 'dice', text: m[0], dice: diceKind(m[1]!) });
    pos = m.index! + m[0].length;
  }
  scanCodes(text.slice(pos), t, opts, parts);
  return lastFightOnly(parts);
}

/** Table codes (with modifiers) and creature names in a stretch of text without dice phrases. */
function scanCodes(text: string, t: DungeonTables | null, opts: ScanOptions, parts: EncounterPart[]): void {
  if (!t) { pushText(parts, text); return; }
  const between = (s: string): void => (opts.fights === false ? pushText(parts, s) : scanFights(s, t, parts));
  const { creatureCodes, re } = scannerFor(t);
  if (!re) { between(text); return; }
  let pos = 0;
  for (const m of text.matchAll(re)) {
    between(text.slice(pos, m.index!));
    const modifier = m[2] ? (m[2] === '+' ? 1 : -1) * Number(m[3]) : 0;
    parts.push({ kind: creatureCodes.has(m[1]!) ? 'roll' : 'table', text: m[0], code: m[1]!, modifier });
    pos = m.index! + m[0].length;
  }
  between(text.slice(pos));
}

/**
 * A creature named twice in one text is the same creature, and the last mention is where the text
 * says to face it ("A GUARD lets loose a dog. Roll on X, then face the GUARD after."): only that
 * one is a fight, so its button follows anything asked for before it. Earlier mentions become text.
 */
function lastFightOnly(parts: EncounterPart[]): EncounterPart[] {
  const last = new Map<string, number>();
  parts.forEach((p, i) => p.kind === 'fight' && last.set(p.name, i));
  const out: EncounterPart[] = [];
  parts.forEach((p, i) => {
    if (p.kind === 'text' || (p.kind === 'fight' && last.get(p.name) !== i)) pushText(out, p.text);
    else out.push(p);
  });
  return out;
}

/**
 * Text inside a reference table: only reference-table codes are parts of their own (kind 'table'),
 * including a code that is also a creature table, and dice phrases (kind 'dice').
 * Creature-only codes and creature names stay text.
 */
export function scanReference(text: string, t: DungeonTables | null, opts: { amounts?: boolean } = {}): EncounterPart[] {
  const parts: EncounterPart[] = [];
  for (const p of scanEncounter(text, t, { fights: false })) {
    if (p.kind === 'table' || p.kind === 'dice') parts.push(p);
    else if (p.kind === 'roll' && findTable(t, p.code)) parts.push({ ...p, kind: 'table' });
    else if (opts.amounts) scanAmounts(p.text, parts);
    else pushText(parts, p.text);
  }
  return parts;
}

/**
 * "2D6 +10 SC", "4D6 +10 GC", "D6 HP", "2D3 −1": dice the text says to count, with an optional bonus
 * and the two- or three-letter thing counted. D66 isn't an amount.
 */
const AMOUNT_RE = /(?<![A-Za-z0-9])(\d{0,2})d([36])(?![A-Za-z0-9])(?:\s*([+\-−–])\s*(\d+)(?![A-Za-z0-9]))?(?:\s+[A-Z]{2,3}(?![A-Za-z0-9]))?/gi;

function amountDice(count: string, sides: string): DiceKind {
  const n = count ? Number(count) : 1;
  return (n <= 1 ? `d${sides}` : `${n}d${sides}`) as DiceKind;
}

function scanAmounts(text: string, parts: EncounterPart[]): void {
  let pos = 0;
  for (const m of text.matchAll(AMOUNT_RE)) {
    pushText(parts, text.slice(pos, m.index!));
    const modifier = m[4] ? (m[3] === '+' ? 1 : -1) * Number(m[4]) : 0;
    parts.push({ kind: 'amount', text: m[0], dice: amountDice(m[1]!, m[2]!), modifier });
    pos = m.index! + m[0].length;
  }
  pushText(parts, text.slice(pos));
}
