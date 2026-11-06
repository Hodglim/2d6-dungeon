import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/dungeon-tables.fixture.json';
import { parseTableFile } from '../../src/systems/dungeon/tables';
import type { DungeonTables } from '../../src/systems/dungeon/tables';
import {
  canEat, createHero, creationProblem, heroEdit, heroProblem, levelUp, levelUpAvailable, levelUpChoiceProblem, levelUpOptions, levelUpWith, listLimit, overLimit, restOnStairs,
  type CreationChoices, type Hero,
} from '../../src/systems/dungeon/hero';

const text = JSON.stringify(fixture);
const r = parseTableFile(text, text.length);
if (!r.ok) throw new Error(r.error);
const t: DungeonTables = r.tables;
const choices: CreationChoices = {
  name: 'Tester', weapon: 'Practice Sword', manoeuvres: ['Wobbly Poke', 'Gentle Swipe'],
  armour: 'Sackcloth Vest', scroll: 'Scroll of Mild Glow',
};
const hero = () => createHero(t, choices);

describe('createHero', () => {
  it('uses starting values and the chosen manoeuvres', () => {
    const h = hero();
    expect([h.hp, h.hpBaseline, h.shift, h.discipline, h.precision, h.level, h.rations]).toEqual([11, 11, 2, 3, 4, 1, 2]);
    expect(h.manoeuvres).toEqual([
      { name: 'Wobbly Poke', dice: [1, 4], modifier: '1' },
      { name: 'Gentle Swipe', dice: [2, 6], modifier: '2' },
    ]);
    expect(h.smallItems).toEqual(['Practice Lantern', 'Spare Bootlace']);
    expect(h.potions).toHaveLength(2);
    expect('rationsNote' in h).toBe(false);
    expect(h.favour.every((f) => f.points === 0)).toBe(true);
    expect(h.favour).toHaveLength(t.tables.gods.length);
  });
});

describe('creationProblem', () => {
  const bad = (c: Partial<CreationChoices>) => creationProblem(t, { ...choices, ...c });
  it('accepts valid choices', () => expect(bad({})).toBeNull());
  it('refuses wrong counts, other weapon, level 2, unknown kit', () => {
    expect(bad({ manoeuvres: ['Wobbly Poke'] })).not.toBeNull();
    expect(bad({ manoeuvres: ['Wobbly Poke', 'Gentle Swipe', 'Cheerful Flourish'] })).not.toBeNull();
    expect(bad({ manoeuvres: ['Wobbly Poke', 'Soft Bonk'] })).not.toBeNull();
    expect(bad({ manoeuvres: ['Wobbly Poke', 'Cheerful Flourish'] })).not.toBeNull();
    expect(bad({ armour: 'Nope' })).not.toBeNull();
    expect(bad({ scroll: 'Nope' })).not.toBeNull();
  });
});

describe('heroProblem', () => {
  it('passes a created hero', () => expect(heroProblem(hero())).toBeNull());
  it('loads an older save that still has a rations note, and refuses a legend level above 10', () => {
    const h = hero();
    expect(heroProblem({ ...h, rationsNote: 'kept from an older save' } as typeof h)).toBeNull();
    expect(heroProblem({ ...h, legendLevel: 11 })).toMatch(/legendLevel/);
    expect(heroProblem({ ...h, legendLevel: 10 })).toBeNull();
  });
  it('catches damage', () => {
    const { rules: _r, ...noRules } = hero();
    expect(heroProblem(noRules)).toMatch(/rules/);
    const h = hero();
    expect(heroProblem({ ...h, coins: { ...h.coins, gc: -1 } })).toMatch(/coins/);
    expect(heroProblem({ ...h, manoeuvres: [{ name: 'x', dice: [0, 3], modifier: '1' }] })).toMatch(/dice/);
    expect(heroProblem({ ...h, manoeuvres: [{ name: 'x', dice: [1, 3, 2], modifier: '1' }] })).toMatch(/dice/);
    // Armour dice sets run to four dice ("6 & 4 + 3 & 3").
    expect(heroProblem({ ...h, armour: [{ name: 'x', dice: [6, 4, 3, 3], modifier: '-4 Damage' }] })).toBeNull();
    expect(heroProblem({ ...h, armour: [{ name: 'x', dice: [6, 4, 3, 3, 1], modifier: '-4 Damage' }] })).toMatch(/dice/);
    expect(heroProblem(null)).not.toBeNull();
    expect(heroProblem({ ...h, hp: -2 })).toBeNull();
    expect(heroProblem({ ...h, hp: 1.5 })).toMatch(/hp/);
    expect(heroProblem({ ...h, xp: -5 })).toBeNull();
  });
});

describe('levels', () => {
  it('level-up availability at the threshold', () => {
    expect(levelUpAvailable({ ...hero(), xp: 9 })).toBe(false);
    expect(levelUpAvailable({ ...hero(), xp: 10 })).toBe(true);
  });
  it('levelUp applies the next row and keeps XP', () => {
    const h = levelUp({ ...hero(), xp: 12 });
    expect([h.level, h.title, h.hp, h.hpBaseline, h.shift, h.discipline, h.precision, h.xp]).toEqual([2, 'Explorer', 21, 14, 3, 3, 5, 12]);
  });
  it('is never available at max level', () => {
    const h = { ...hero(), level: 3, xp: 9999 };
    expect(levelUpAvailable(h)).toBe(false);
    expect(levelUp(h)).toBe(h);
  });
});

describe('manoeuvres on level up', () => {
  const ready = () => ({ ...hero(), xp: 10 });
  const names = (h: Hero) => h.manoeuvres.map((m) => m.name);

  it("offers the weapon's manoeuvres up to the new level's max, not held, and the new slots", () => {
    const o = levelUpOptions(ready(), t);
    expect(o.offered.map((m) => m.name)).toEqual(['Cheerful Flourish']);
    expect(o.newSlots).toBe(1);
    expect(o.held.map((m) => m.name)).toEqual(['Wobbly Poke', 'Gentle Swipe']);
  });

  it('without the table file there is nothing to offer, but the level up still works', () => {
    expect(levelUpOptions(ready(), null)).toMatchObject({ offered: [], newSlots: 1 });
    expect(levelUpWith(ready(), null, { add: [], swap: null }).level).toBe(2);
  });

  it('fills a new slot', () => {
    const h = levelUpWith(ready(), t, { add: ['Cheerful Flourish'], swap: null });
    expect(h.level).toBe(2);
    expect(h.manoeuvres.at(-1)).toEqual({ name: 'Cheerful Flourish', dice: [3, 3], modifier: '3' });
  });

  it('swaps one manoeuvre for another in its place', () => {
    const h = levelUpWith(ready(), t, { add: [], swap: { out: 0, in: 'Cheerful Flourish' } });
    expect(names(h)).toEqual(['Cheerful Flourish', 'Gentle Swipe']);
    expect(h.hp).toBe(levelUp(ready()).hp);
  });

  it('refuses a manoeuvre above the new max level, one not on the weapon, too many, or the same one twice', () => {
    const c = (add: string[], swap: { out: number; in: string } | null = null) => levelUpChoiceProblem(ready(), t, { add, swap });
    expect(c([])).toBeNull();
    expect(c(['Grand Wave'])).toMatch(/Grand Wave/);
    expect(c(['Soft Bonk'])).toMatch(/Soft Bonk/);
    expect(c(['Wobbly Poke'])).toMatch(/Wobbly Poke/);
    expect(c(['Cheerful Flourish'], { out: 0, in: 'Cheerful Flourish' })).toMatch(/Cheerful Flourish/);
    expect(c([], { out: 5, in: 'Cheerful Flourish' })).not.toBeNull();
    const two = { ...ready(), level: 2, xp: 25, manoeuvres: ready().manoeuvres.slice(0, 1) };
    expect(levelUpOptions(two, t).newSlots).toBe(3);
    expect(levelUpChoiceProblem(two, t, { add: ['Gentle Swipe', 'Cheerful Flourish', 'Grand Wave'], swap: null })).toBeNull();
    expect(() => levelUpWith(ready(), t, { add: ['Grand Wave'], swap: null })).toThrow();
  });
});

describe('limits', () => {
  it('reads limits from the hero rules', () => {
    const h = hero();
    expect(listLimit(h, 'largeItems')).toBe(2);
    expect(listLimit(h, 'manoeuvres')).toBe(2);
    expect(overLimit({ ...h, largeItems: ['a', 'b'] }, 'largeItems')).toBe(false);
    expect(overLimit({ ...h, largeItems: ['a', 'b', 'c'] }, 'largeItems')).toBe(true);
  });
  it('works after a serialise round trip with no tables in scope', () => {
    const h: Hero = JSON.parse(JSON.stringify({ ...hero(), xp: 10 }));
    expect(heroProblem(h)).toBeNull();
    expect(levelUpAvailable(h)).toBe(true);
    expect(levelUp(h).level).toBe(2);
    expect(listLimit(h, 'potions')).toBe(3);
  });
});

describe('heroEdit', () => {
  it('labels single changes', () => {
    const h = hero();
    expect(heroEdit(h, { ...h, hp: h.hp - 3 })).toBe('HP −3');
    expect(heroEdit(h, { ...h, xp: h.xp + 50 })).toBe('XP +50');
    expect(heroEdit(h, { ...h, coins: { ...h.coins, gc: 12 } })).toBe('GC +12');
    expect(heroEdit(h, { ...h, largeItems: ['Rope'] })).toBe('Add Rope');
    expect(heroEdit({ ...h, largeItems: ['Rope'] }, h)).toBe('Remove Rope');
    const rope = { ...h, largeItems: ['Rope'] };
    expect(heroEdit(rope, { ...h, largeItems: ['Rope', 'Rope'] })).toBe('Add Rope');
    expect(heroEdit({ ...h, largeItems: ['Rope', 'Rope'] }, rope)).toBe('Remove Rope');
    expect(heroEdit(h, { ...h, hp: 1, xp: 5 })).toBe('Edit hero');
    expect(heroEdit(h, { ...h, notes: 'x' })).toBe('Edit hero');
  });
});

describe('restOnStairs', () => {
  const h = (o: Partial<Hero>): Hero => ({ ...hero(), level: 2, hp: 5, hpBaseline: 20, rations: 2, ...o });
  it('eating heals 2 per level plus 2 with a bandage, and uses a ration', () => {
    const r = restOnStairs(h({}), { eat: true, bandage: true });
    expect([r.hp, r.rations]).toEqual([11, 1]);
    expect(restOnStairs(h({}), { eat: true, bandage: false }).hp).toBe(9);
  });
  it('eating at or above the baseline changes no HP', () => {
    const r = restOnStairs(h({ hp: 25 }), { eat: true, bandage: true });
    expect([r.hp, r.rations]).toEqual([25, 1]);
  });
  it('not eating loses half the HP, capped at 20', () => {
    expect(restOnStairs(h({ hp: 50 }), { eat: false, bandage: false }).hp).toBe(30);
    expect(restOnStairs(h({ hp: 7 }), { eat: false, bandage: false }).hp).toBe(4);
    expect(restOnStairs(h({ hp: 0 }), { eat: false, bandage: false }).hp).toBe(0);
    expect(restOnStairs(h({ hp: -3 }), { eat: false, bandage: false }).hp).toBe(-3);
  });
  it('wanting to eat with no rations falls back to not eating', () => {
    const r = restOnStairs(h({ rations: 0, hp: 10 }), { eat: true, bandage: false });
    expect([r.hp, r.rations]).toEqual([5, 0]);
    expect(canEat(h({ rations: 0 }))).toBe(false);
    expect(canEat(h({}))).toBe(true);
  });
});
