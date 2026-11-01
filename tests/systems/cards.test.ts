import { describe, expect, it } from 'vitest';
import { MAX_CARD_PACK_BYTES, parseCardPack, searchCards } from '../../src/systems/dungeon/cards';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const pack = () => ({
  format: 1,
  systemId: 'dungeon',
  name: 'Made-up cards',
  cards: [
    { id: 'a', name: 'Goblin Thing', level: 2, image: PNG },
    { id: 'b', name: 'Bog Wobbler', level: 1, image: PNG },
    { id: 'c', name: 'Gobbo Cousin', level: 1, image: PNG },
  ],
});
const parse = (v: unknown, bytes?: number) => {
  const t = typeof v === 'string' ? v : JSON.stringify(v);
  return parseCardPack(t, bytes ?? t.length);
};
const err = (r: ReturnType<typeof parse>) => (r.ok ? null : r.error);

describe('parseCardPack', () => {
  it('parses a 3-card pack', () => {
    const r = parse(pack());
    expect(r.ok && r.pack.cards).toHaveLength(3);
  });
  it('refuses with the specified messages', () => {
    expect(err(parse('not json {'))).toBe("This isn't a 2D6 Dungeon creature card pack");
    expect(err(parse({ ...pack(), systemId: 'other' }))).toBe("This isn't a 2D6 Dungeon creature card pack");
    expect(err(parse({ ...pack(), format: 2 }))).toBe('Made by a newer version of the app');
    expect(err(parse(pack(), MAX_CARD_PACK_BYTES + 1))).toBe('This file is too large to be a card pack.');
    const badImg = pack();
    badImg.cards[0]!.image = 'https://example.com/x.png';
    expect(err(parse(badImg))).toMatch(/^The card pack is damaged: .*image/);
    const noName = pack();
    delete (noName.cards[1] as Partial<(typeof noName.cards)[number]>).name;
    expect(err(parse(noName))).toMatch(/^The card pack is damaged: .*name/);
  });
  it('refuses duplicate ids and bad levels', () => {
    const dup = pack();
    dup.cards[1]!.id = 'a';
    expect(err(parse(dup))).toMatch(/damaged.*id/);
    const lvl = pack();
    lvl.cards[0]!.level = 1.5;
    expect(err(parse(lvl))).toMatch(/damaged.*level/);
  });
});

describe('searchCards', () => {
  const r = parse(pack());
  if (!r.ok) throw new Error(r.error);
  const p = r.pack;
  it('matches case-insensitively and sorts by level then name', () => {
    expect(searchCards(p, 'GOB', null).map((c) => c.name)).toEqual(['Gobbo Cousin', 'Goblin Thing']);
    expect(searchCards(p, 'gob', null).map((c) => c.id)).toContain('a');
  });
  it('filters by level', () => {
    expect(searchCards(p, '', 1).map((c) => c.name)).toEqual(['Bog Wobbler', 'Gobbo Cousin']);
    expect(searchCards(p, 'gob', 2).map((c) => c.name)).toEqual(['Goblin Thing']);
  });
});
