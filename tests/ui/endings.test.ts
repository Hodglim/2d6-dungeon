import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addFoe, newEncounter, setFoeHp, type Encounter } from '../../src/systems/dungeon/combat';
import { createHero, type Hero } from '../../src/systems/dungeon/hero';
import type { DungeonTables } from '../../src/systems/dungeon/tables';
import { shouldAskDeath, shouldAskWin } from '../../src/ui/endings';

const t = JSON.parse(readFileSync('tests/fixtures/dungeon-tables.fixture.json', 'utf8')) as DungeonTables;
const hero = (hp: number): Hero => ({
  ...createHero(t, { name: 'Pip', weapon: 'Practice Sword', manoeuvres: ['Wobbly Poke', 'Gentle Swipe'], armour: 'Sackcloth Vest', scroll: 'Scroll of Mild Glow' }),
  hp,
});
const stats = { level: 1, hp: 3, xp: 2, shift: 0, treasure: 'Roll on PTR1' };
const twoFoes = (): Encounter => addFoe(addFoe(newEncounter(), 'Grumbler', stats, 3, 'a'), 'Moss Lurker', stats, 3, 'b');

describe('shouldAskDeath', () => {
  it('asks for a hero at 0 HP and below', () => {
    expect(shouldAskDeath(hero(0), false, null)).toBe(true);
    expect(shouldAskDeath(hero(-2), false, null)).toBe(true);
  });
  it('does not ask for a living hero', () => {
    expect(shouldAskDeath(hero(1), false, null)).toBe(false);
  });
  it('does not ask again for the same object once dismissed', () => {
    const h = hero(0);
    expect(shouldAskDeath(h, false, h)).toBe(false);
  });
  it('asks again for a new object still at 0 HP or less', () => {
    const h = hero(0);
    expect(shouldAskDeath({ ...h, hp: -1 }, false, h)).toBe(true);
    expect(shouldAskDeath({ ...h }, false, h)).toBe(true);
  });
  it('does not ask once the game is over, or with no hero', () => {
    expect(shouldAskDeath(hero(0), true, null)).toBe(false);
    expect(shouldAskDeath(null, false, null)).toBe(false);
  });
});

describe('shouldAskWin', () => {
  it('asks only when every foe is defeated', () => {
    const e = twoFoes();
    expect(shouldAskWin(e, null)).toBe(false);
    const one = setFoeHp(e, 'a', 0);
    expect(shouldAskWin(one, null)).toBe(false);
    expect(shouldAskWin(setFoeHp(one, 'b', -1), null)).toBe(true);
  });
  it('does not ask with no fight or no foes', () => {
    expect(shouldAskWin(null, null)).toBe(false);
    expect(shouldAskWin(newEncounter(), null)).toBe(false);
  });
  it('does not ask for the dismissed object, but does for a new one', () => {
    const won = setFoeHp(setFoeHp(twoFoes(), 'a', 0), 'b', 0);
    expect(shouldAskWin(won, won)).toBe(false);
    expect(shouldAskWin({ ...won }, won)).toBe(true);
  });
});
