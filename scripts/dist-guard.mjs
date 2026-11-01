// Pure helpers for check-dist.mjs: which private names to look for, and whole-name matching.
export const MIN_NAME_LENGTH = 4;
const list = (v) => (Array.isArray(v) ? v : []);
const ok = (n) => typeof n === 'string' && n.trim().length >= MIN_NAME_LENGTH;

/** Weapon, manoeuvre, starting armour and starting scroll names from a parsed table file (data.tables.*). */
export function tableNames(data) {
  const t = data?.tables ?? {};
  const out = [];
  for (const w of list(t.weapons)) {
    out.push(w?.name);
    for (const m of list(w?.manoeuvres)) out.push(m?.name);
  }
  for (const a of list(t.startingArmour)) out.push(a?.name);
  for (const s of list(t.startingScrolls)) out.push(s?.name);
  return out.filter(ok);
}

/** Card names from a parsed card pack. */
export const cardNames = (data) => list(data?.cards).map((c) => c?.name).filter(ok);

/** True if `name` appears in `text` as a whole name, not inside a longer word ("Rat" is not in "Rations"). */
export function containsName(text, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9])${esc}(?![A-Za-z0-9])`).test(text);
}
