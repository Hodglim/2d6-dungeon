import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { DungeonTables } from '../../src/systems/dungeon/tables';
import { emptyDraft, pickableManoeuvres, startingManoeuvreCount, toggleManoeuvre, wizardStepValid, wizardSteps } from '../../src/ui/wizard/steps';

const t = JSON.parse(readFileSync('tests/fixtures/dungeon-tables.fixture.json', 'utf8')) as DungeonTables;
const full = { ...emptyDraft(), name: ' Pip ', weapon: 'Practice Sword', manoeuvres: ['Wobbly Poke', 'Gentle Swipe'], armour: 'Sackcloth Vest', scroll: 'Scroll of Mild Glow' };

describe('wizard steps', () => {
  it('add-hero skips the Game step', () => {
    expect(wizardSteps('new-game')[0]).toBe('game');
    expect(wizardSteps('add-hero')[0]).toBe('name');
    expect(wizardSteps('add-hero')).not.toContain('game');
    expect(wizardSteps('new-game').at(-1)).toBe('review');
    expect(wizardSteps('new-game')).toHaveLength(6);
    expect(wizardSteps('add-hero')).toEqual(['name', 'weapon', 'armour', 'scroll', 'review']);
  });
  it('game step needs a valid size and tables for Next', () => {
    expect(wizardStepValid('game', emptyDraft(), t)).toBe(true);
    expect(wizardStepValid('game', emptyDraft(), null)).toBe(false);
    expect(wizardStepValid('game', { ...emptyDraft(), width: 5 }, t)).toBe(false);
    expect(wizardStepValid('game', { ...emptyDraft(), height: 1.5 }, t)).toBe(false);
  });
  it('name must be non-blank', () => {
    expect(wizardStepValid('name', emptyDraft(), t)).toBe(false);
    expect(wizardStepValid('name', { ...emptyDraft(), name: '  ' }, t)).toBe(false);
    expect(wizardStepValid('name', full, t)).toBe(true);
  });
  it('weapon, armour and scroll must exist in the tables', () => {
    expect(wizardStepValid('weapon', { ...full, weapon: 'Nope' }, t)).toBe(false);
    expect(wizardStepValid('armour', { ...full, armour: '' }, t)).toBe(false);
    expect(wizardStepValid('scroll', { ...full, scroll: '' }, t)).toBe(false);
    expect(wizardStepValid('scroll', full, t)).toBe(true);
  });
  it('weapon step: a weapon plus exactly the starting count, level 1 of the weapon', () => {
    expect(startingManoeuvreCount(t)).toBe(2);
    expect(pickableManoeuvres(t, 'Practice Sword').map((m) => m.name)).toEqual(['Wobbly Poke', 'Gentle Swipe']);
    expect(wizardStepValid('weapon', { ...full, manoeuvres: ['Wobbly Poke'] }, t)).toBe(false);
    expect(wizardStepValid('weapon', { ...full, manoeuvres: ['Wobbly Poke', 'Cheerful Flourish'] }, t)).toBe(false);
    expect(wizardStepValid('weapon', full, t)).toBe(true);
    expect(wizardStepValid('weapon', { ...full, weapon: '', manoeuvres: [] }, t)).toBe(false);
    expect(wizardStepValid('weapon', { ...full, weapon: 'Training Club' }, t)).toBe(false);
  });
  it('review is valid only when everything is', () => {
    expect(wizardStepValid('review', full, t)).toBe(true);
    expect(wizardStepValid('review', { ...full, scroll: '' }, t)).toBe(false);
  });
  it('toggleManoeuvre adds, removes and caps', () => {
    expect(toggleManoeuvre([], 'a', 2)).toEqual(['a']);
    expect(toggleManoeuvre(['a'], 'a', 2)).toEqual([]);
    expect(toggleManoeuvre(['a', 'b'], 'c', 2)).toEqual(['a', 'b']);
  });
});
