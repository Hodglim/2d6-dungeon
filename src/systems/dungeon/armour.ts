/**
 * Armour dice sets and deflection. Pure.
 *
 * A dice set is stored flat as primary/secondary pairs: [P1, S1, P2, S2]. "6 & 5" is [6, 5],
 * "4 & 3 + 1" is [4, 3, 1]. A 0 in a secondary slot means that group has no secondary ("4 + 2" is
 * [4, 0, 2]). A one- or two-die set is the same as before, so older saves read unchanged.
 */

/** "4 & 3 + 1" → [4, 3, 1]; null for anything that isn't one or two groups of "P" or "P & S". */
export function parseDiceSet(text: string): number[] | null {
  const groups = text.trim().split('+');
  if (groups.length > 2) return null;
  const out: number[] = [];
  for (const [g, raw] of groups.entries()) {
    const m = /^\s*([1-6])\s*(?:&\s*([1-6])\s*)?$/.exec(raw);
    if (!m) return null;
    const p = Number(m[1]);
    const s = m[2] ? Number(m[2]) : 0;
    const last = g === groups.length - 1;
    out.push(p);
    if (s || !last) out.push(s);
  }
  return out;
}

/** True for a stored set: 1–4 dice, primaries 1–6, secondaries 1–6 (or 0 before another group). */
export function isArmourDice(v: unknown): boolean {
  if (!Array.isArray(v) || v.length < 1 || v.length > 4) return false;
  return v.every((d, i) => {
    if (!Number.isInteger(d)) return false;
    const empty = d === 0 && i % 2 === 1 && i < v.length - 1;
    return empty || (d >= 1 && d <= 6);
  });
}

/** [[P1, S1], [P2]]: each group's dice, with empty secondaries left out. */
export function armourGroups(dice: readonly number[]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < dice.length; i += 2) out.push(dice.slice(i, i + 2).filter((d) => d > 0));
  return out;
}

/** [4, 3, 1] → "4 & 3 + 1". */
export const formatDiceSet = (dice: readonly number[]): string => armourGroups(dice).map((g) => g.join(' & ')).join(' + ');

const primaries = (dice: readonly number[]) => dice.filter((d, i) => i % 2 === 0 && d > 0);
const secondaries = (dice: readonly number[]) => dice.filter((d, i) => i % 2 === 1 && d > 0);

/**
 * Indexes of the armour that deflects an attack whose dice (after shifting) are [red, blue]: its
 * red die matches one of the armour's primaries, or its blue die one of the secondaries.
 */
export function deflects(faces: readonly number[], armour: readonly { dice: readonly number[] }[]): number[] {
  const out: number[] = [];
  armour.forEach((a, i) => {
    if (primaries(a.dice).includes(faces[0]!) || secondaries(a.dice).includes(faces[1]!)) out.push(i);
  });
  return out;
}

/** The damage a piece takes off, read from its modifier text ("-2 Damage" → 2); 0 when there's no number. */
export function armourModifier(text: string): number {
  const m = /(\d+)/.exec(text);
  return m ? Number(m[1]) : 0;
}
