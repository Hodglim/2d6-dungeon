import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/dungeon-tables.fixture.json';
import { parseTableFile } from '../../src/systems/dungeon/tables';
import type { DungeonTables } from '../../src/systems/dungeon/tables';
import {
  createHero, creationProblem, heroEdit, heroProblem, levelUp, levelUpAvailable, listLimit, overLimit,
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
    expect(h.rationsNote).toBe('');
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
  it('refuses a missing rations note and a legend level above 10', () => {
    const h = hero();
    expect(heroProblem({ ...h, rationsNote: undefined })).toMatch(/rationsNote/);
    expect(heroProblem({ ...h, legendLevel: 11 })).toMatch(/legendLevel/);
    expect(heroProblem({ ...h, legendLevel: 10 })).toBeNull();
  });
  it('catches damage', () => {
    const { rules: _r, ...noRules } = hero();
    expect(heroProblem(noRules)).toMatch(/rules/);
    const h = hero();
    expect(heroProblem({ ...h, coins: { ...h.coins, gc: -1 } })).toMatch(/coins/);
    expect(heroProblem({ ...h, manoeuvres: [{ name: 'x', dice: [0, 3], modifier: '1' }] })).toMatch(/dice/);
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
