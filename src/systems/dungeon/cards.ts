export const CARD_PACK_FORMAT = 1;
export const MAX_CARD_PACK_BYTES = 60_000_000;

export interface CreatureCard {
  id: string;
  name: string;
  level: number;
  /** data:image/(jpeg|webp|png);base64,… */
  image: string;
}

export interface CardPack {
  format: 1;
  systemId: 'dungeon';
  name: string;
  cards: CreatureCard[];
}

export type CardsParse = { ok: true; pack: CardPack } | { ok: false; error: string };

const NOT_A_PACK = "This isn't a 2D6 Dungeon creature card pack";
const IMAGE_URL = /^data:image\/(jpeg|webp|png);base64,[A-Za-z0-9+/]*={0,2}$/;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const damaged = (detail: string): CardsParse => ({ ok: false, error: `The card pack is damaged: ${detail}` });

/** Size guard first, then JSON parse and full validation. Pass the real byte length (file.size). */
export function parseCardPack(text: string, byteLength: number): CardsParse {
  if (byteLength > MAX_CARD_PACK_BYTES) return { ok: false, error: 'This file is too large to be a card pack.' };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: NOT_A_PACK };
  }
  return validateCardPack(data);
}

/** Full validation of an already-parsed value (also used for the copy stored on the device). */
export function validateCardPack(data: unknown): CardsParse {
  if (!isObj(data) || data.systemId !== 'dungeon' || typeof data.format !== 'number' || !Array.isArray(data.cards)) {
    return { ok: false, error: NOT_A_PACK };
  }
  if (!Number.isInteger(data.format)) return damaged('format');
  if (data.format > CARD_PACK_FORMAT) return { ok: false, error: 'Made by a newer version of the app' };
  if (data.format !== CARD_PACK_FORMAT) return damaged('format');
  if (typeof data.name !== 'string' || !data.name.trim()) return damaged('name');
  const ids = new Set<string>();
  const cards: CreatureCard[] = [];
  for (let i = 0; i < data.cards.length; i++) {
    const c: unknown = data.cards[i];
    if (!isObj(c)) return damaged(`Cards[${i}]`);
    if (typeof c.id !== 'string' || !c.id) return damaged(`Cards[${i}] id`);
    if (ids.has(c.id)) return damaged(`Cards[${i}] id (duplicate "${c.id}")`);
    ids.add(c.id);
    if (typeof c.name !== 'string' || !c.name.trim()) return damaged(`Cards[${i}] name`);
    if (typeof c.level !== 'number' || !Number.isInteger(c.level) || c.level < 0) return damaged(`Cards[${i}] level`);
    if (typeof c.image !== 'string' || !IMAGE_URL.test(c.image)) return damaged(`Cards[${i}] image (must be a data:image/ URL)`);
    cards.push({ id: c.id, name: c.name, level: c.level, image: c.image });
  }
  return { ok: true, pack: { format: 1, systemId: 'dungeon', name: data.name, cards } };
}

/** Case-insensitive substring on the name, then the level filter; sorted by level then name. */
export function searchCards(pack: CardPack, query: string, level: number | null): CreatureCard[] {
  const q = query.trim().toLowerCase();
  return pack.cards
    .filter((c) => (!q || c.name.toLowerCase().includes(q)) && (level === null || c.level === level))
    .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name));
}
