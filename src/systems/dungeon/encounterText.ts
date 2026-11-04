import { findCreature } from './creatures';
import { findTable } from './referenceTables';
import type { DungeonTables } from './tables';

export type EncounterPart =
  | { kind: 'text'; text: string }
  | { kind: 'roll'; text: string; code: string; modifier: number }
  | { kind: 'table'; text: string; code: string; modifier: number }
  | { kind: 'fight'; text: string; name: string };

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
    : new RegExp(`(?<![A-Za-z0-9])(${codes.map(escapeRe).join('|')})(?:\\s*([+\\-−–])\\s*(\\d+))?(?![A-Za-z0-9])`, 'g');
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
  if (!t) { pushText(parts, text); return parts; }
  const between = (s: string): void => (opts.fights === false ? pushText(parts, s) : scanFights(s, t, parts));
  const { creatureCodes, re } = scannerFor(t);
  if (!re) { between(text); return parts; }
  let pos = 0;
  for (const m of text.matchAll(re)) {
    between(text.slice(pos, m.index!));
    const modifier = m[2] ? (m[2] === '+' ? 1 : -1) * Number(m[3]) : 0;
    parts.push({ kind: creatureCodes.has(m[1]!) ? 'roll' : 'table', text: m[0], code: m[1]!, modifier });
    pos = m.index! + m[0].length;
  }
  between(text.slice(pos));
  return parts;
}

/**
 * Text inside a reference table: only reference-table codes are parts of their own (kind 'table'),
 * including a code that is also a creature table. Creature-only codes and creature names stay text.
 */
export function scanReference(text: string, t: DungeonTables | null): EncounterPart[] {
  const parts: EncounterPart[] = [];
  for (const p of scanEncounter(text, t, { fights: false })) {
    if (p.kind === 'table') parts.push(p);
    else if (p.kind === 'roll' && findTable(t, p.code)) parts.push({ ...p, kind: 'table' });
    else pushText(parts, p.text);
  }
  return parts;
}
