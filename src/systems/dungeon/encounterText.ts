import { findCreature } from './creatures';
import type { DungeonTables } from './tables';

export type EncounterPart =
  | { kind: 'text'; text: string }
  | { kind: 'roll'; text: string; code: string; modifier: number }
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

export function scanEncounter(text: string, t: DungeonTables | null): EncounterPart[] {
  const parts: EncounterPart[] = [];
  if (!t) { pushText(parts, text); return parts; }
  const codes = Object.keys(t.tables.creatureTables ?? {}).sort((a, b) => b.length - a.length);
  if (codes.length === 0) { scanFights(text, t, parts); return parts; }
  const re = new RegExp(`(?<![A-Za-z0-9])(${codes.map(escapeRe).join('|')})(?:\\s*([+\\-−–])\\s*(\\d+))?(?![A-Za-z0-9])`, 'g');
  let pos = 0;
  for (const m of text.matchAll(re)) {
    scanFights(text.slice(pos, m.index!), t, parts);
    const modifier = m[2] ? (m[2] === '+' ? 1 : -1) * Number(m[3]) : 0;
    parts.push({ kind: 'roll', text: m[0], code: m[1]!, modifier });
    pos = m.index! + m[0].length;
  }
  scanFights(text.slice(pos), t, parts);
  return parts;
}
