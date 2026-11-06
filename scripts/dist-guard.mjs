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

// ---- book terms: anything from the player's own rulebook data that must never be committed ----

const vals = (v) => (v && typeof v === 'object' ? Object.values(v) : []);
const keys = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v) : []);
/** A table code ("QX7") may be short; a name must be MIN_NAME_LENGTH or longer. */
const isCode = (s) => /^[A-Za-z0-9-]+$/.test(s) && /\d/.test(s) && s.length >= 3;

/**
 * Every term to keep out of git: table codes and names, room and level names, creatures, items, gods,
 * plus card names (pack) and name files ({ "page:n": "Name" }). `allow` lists generic words that may appear.
 */
export function bookTerms({ tables = null, pack = null, nameMaps = [], allow = [] } = {}) {
  const t = tables?.tables ?? {};
  const out = [...tableNames(tables)];
  for (const g of list(t.gods)) out.push(g);
  for (const k of ['potions', 'throwingWeapons', 'potionBombs']) for (const x of list(t[k])) out.push(x?.name);
  for (const p of list(t.starting?.potions)) out.push(p?.name);
  for (const l of list(t.dungeonLevels)) {
    out.push(l?.name);
    for (const k of ['rooms', 'smallRooms', 'largeRooms']) for (const r of vals(l?.[k])) out.push(r?.type);
  }
  const codes = [...keys(t.exitTables), ...keys(t.creatureTables), ...keys(t.referenceTables)];
  for (const r of vals(t.referenceTables)) out.push(r?.name);
  out.push(...keys(t.creatures));
  if (pack) out.push(...cardNames(pack));
  for (const m of nameMaps) out.push(...vals(m));
  const allowed = new Set(allow);
  const all = [...out.filter(ok), ...codes.filter((c) => typeof c === 'string' && (isCode(c) || ok(c)))].map((s) => s.trim());
  return [...new Set(all)].filter((s) => !allowed.has(s));
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matchers = new WeakMap();
/** The terms found in `text` as whole words, each once, in `terms` order (one compiled regex per term list). */
export function findTerms(text, terms) {
  let re = matchers.get(terms);
  if (!re) {
    const alts = [...terms].sort((a, b) => b.length - a.length).map(escape).join('|');
    re = new RegExp(`(?<![A-Za-z0-9])(?:${alts || '(?!)'})(?![A-Za-z0-9])`, 'g');
    matchers.set(terms, re);
  }
  const found = new Set();
  for (const m of text.matchAll(re)) found.add(m[0]);
  // A longer term hides a shorter one inside it; check those separately so each term is reported.
  for (const t of terms) if (!found.has(t) && [...found].some((f) => f.includes(t)) && containsName(text, t)) found.add(t);
  return terms.filter((t) => found.has(t));
}

/** The lines a unified diff adds, with the file each belongs to. */
export function addedLines(diff) {
  const out = [];
  let file = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) file = line.slice(4).replace(/^b\//, '');
    else if (line.startsWith('+') && file !== null) out.push({ file, text: line.slice(1) });
  }
  return out;
}
