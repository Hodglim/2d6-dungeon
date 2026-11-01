import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addRoom } from '../../src/core/commands';
import { History } from '../../src/core/history';
import { createHero, type Hero } from '../../src/systems/dungeon/hero';
import type { DungeonTables } from '../../src/systems/dungeon/tables';
import { addItem, addXp, adjustCoin, adjustHp, commitHero, removeItem } from '../../src/ui/hero/heroActions';
import { emptyMap, room } from '../core/fixtures';

const t = JSON.parse(readFileSync('tests/fixtures/dungeon-tables.fixture.json', 'utf8')) as DungeonTables;
const hero = (): Hero =>
  createHero(t, { name: 'Pip', weapon: 'Practice Sword', manoeuvres: ['Wobbly Poke', 'Gentle Swipe'], armour: 'Sackcloth Vest', scroll: 'Scroll of Mild Glow' });

describe('heroActions', () => {
  it('adjustHp may exceed the baseline and drop below zero', () => {
    const h = hero();
    expect(adjustHp(h, 5).hp).toBe(h.hpBaseline + 5);
    expect(adjustHp({ ...h, hp: 1 }, -3).hp).toBe(-2);
  });
  it('addXp adds', () => expect(addXp(hero(), 50).xp).toBe(50));
  it('adjustCoin never goes below 0 and leaves the others', () => {
    const h = adjustCoin(hero(), 'gc', 2);
    expect(adjustCoin(h, 'gc', -5).coins).toEqual({ gc: 0, sc: 0, cc: 0 });
    expect(adjustCoin(h, 'sc', 1).coins).toEqual({ gc: 2, sc: 1, cc: 0 });
  });
  it('addItem adds to the right list, trimmed; blank is ignored', () => {
    const h = hero();
    expect(addItem(h, 'large', ' Rope ').largeItems).toEqual(['Rope']);
    expect(addItem(h, 'small', 'Chalk').smallItems.at(-1)).toBe('Chalk');
    expect(addItem(h, 'large', '  ')).toBe(h);
  });
  it('removeItem removes by index', () => {
    const h = addItem(addItem(hero(), 'large', 'A'), 'large', 'B');
    expect(removeItem(h, 'largeItems', 0).largeItems).toEqual(['B']);
    expect(removeItem(h, 'largeItems', 9)).toBe(h);
  });
  it('a keyed tap after another edit is labelled from that tap alone', () => {
    let clock = 0;
    const history = new History(emptyMap(), 20, hero(), () => clock);
    commitHero(history, addItem(history.hero as Hero, 'large', 'Rope'));
    clock += 50;
    commitHero(history, adjustHp(history.hero as Hero, -2), { mergeKey: 'hp' });
    expect(history.undoLabel).toBe('HP −2');
  });
  it('five quick HP taps are one step labelled HP −5, and an earlier map step stays undoable', () => {
    let clock = 0;
    const history = new History(emptyMap(), 20, hero(), () => clock);
    history.execute(addRoom(room('r1', 1, 1, 3, 3)));
    for (let i = 0; i < 5; i++) {
      clock += 100;
      commitHero(history, adjustHp(history.hero as Hero, -1), { mergeKey: 'hp' });
    }
    expect(history.undoLabel).toBe('HP −5');
    history.undo();
    expect((history.hero as Hero).hp).toBe(11);
    expect(history.map.rooms).toHaveLength(1);
    expect(history.undo()).toBe(true);
    expect(history.map.rooms).toHaveLength(0);
  });
});
