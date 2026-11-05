import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/dungeon-tables.fixture.json';
import type { DungeonTables } from '../../src/systems/dungeon/tables';
import { isSlug, scanEncounter, scanReference } from '../../src/systems/dungeon/encounterText';

const t = fixture as unknown as DungeonTables;

const samples = [
  'Roll on PRAC1 -1. If you survive roll on LOOT9.',
  'PRAC1-1 and PRAC2 +2',
  'PRAC1',
  'You must fight the GRUMBLER.',
  'Face the MOSS LURKER now',
  'Gain 1 FP. Roll a D6.',
  'PRAC1 −2 then GRUMBLER and DUST WISP',
  '',
];

describe('scanEncounter', () => {
  it('splits a roll with modifier from plain text', () => {
    expect(scanEncounter('Roll on PRAC1 -1. If you survive roll on LOOT9.', t)).toEqual([
      { kind: 'text', text: 'Roll on ' },
      { kind: 'roll', text: 'PRAC1 -1', code: 'PRAC1', modifier: -1 },
      { kind: 'text', text: '. If you survive roll on LOOT9.' },
    ]);
  });
  it('finds several rolls with signed modifiers', () => {
    const rolls = scanEncounter('PRAC1-1 and PRAC2 +2', t).filter((p) => p.kind === 'roll');
    expect(rolls.map((r) => (r as { modifier: number }).modifier)).toEqual([-1, 2]);
  });
  it('accepts the unicode minus', () => {
    const p = scanEncounter('PRAC1 −2', t)[0] as { modifier: number };
    expect(p.modifier).toBe(-2);
  });
  it('reads an en dash as minus', () => {
    const p = scanEncounter('PRAC1 \u2013 1 then PRAC2\u20132', t).filter((x) => x.kind === 'roll') as { modifier: number }[];
    expect(p.map((x) => x.modifier)).toEqual([-1, -2]);
  });
  it('defaults the modifier to 0', () => {
    expect(scanEncounter('PRAC1', t)).toEqual([{ kind: 'roll', text: 'PRAC1', code: 'PRAC1', modifier: 0 }]);
  });
  it('finds a creature with the table spelling', () => {
    // The same creature named twice is one creature: only the first mention is a Fight button.
    {
      const parts = scanEncounter('A GRUMBLER keeper looses a hound, then face the GRUMBLER after.', t);
      expect(parts.filter((x) => x.kind === 'fight')).toEqual([{ kind: 'fight', text: 'GRUMBLER', name: 'Grumbler' }]);
      expect(parts.map((x) => x.text).join('')).toBe('A GRUMBLER keeper looses a hound, then face the GRUMBLER after.');
    }
    expect(scanEncounter('You must fight the GRUMBLER.', t)).toEqual([
      { kind: 'text', text: 'You must fight the ' },
      { kind: 'fight', text: 'GRUMBLER', name: 'Grumbler' },
      { kind: 'text', text: '.' },
    ]);
  });
  it('treats a two-word name as one fight', () => {
    const parts = scanEncounter('Face the MOSS LURKER now', t);
    expect(parts[1]).toEqual({ kind: 'fight', text: 'MOSS LURKER', name: 'Moss Lurker' });
  });
  it('finds the longest matching sub-run', () => {
    const parts = scanEncounter('THE GRUMBLER ATTACKS', t);
    expect(parts).toEqual([
      { kind: 'text', text: 'THE ' },
      { kind: 'fight', text: 'GRUMBLER', name: 'Grumbler' },
      { kind: 'text', text: ' ATTACKS' },
    ]);
  });
  it('leaves ordinary text alone', () => {
    expect(scanEncounter('Gain 1 FP. Then rest.', t)).toEqual([{ kind: 'text', text: 'Gain 1 FP. Then rest.' }]);
  });
  it('gives one text part with no tables', () => {
    expect(scanEncounter('PRAC1 GRUMBLER', null)).toEqual([{ kind: 'text', text: 'PRAC1 GRUMBLER' }]);
  });
  it('round-trips every sample', () => {
    for (const s of samples) {
      expect(scanEncounter(s, t).map((p) => p.text).join('')).toBe(s);
      expect(scanEncounter(s, null).map((p) => p.text).join('')).toBe(s);
    }
  });
});

describe('scanEncounter reference tables', () => {
  it('recognises a reference code with modifier', () => {
    expect(scanEncounter('roll on XX2 +1', t)).toEqual([
      { kind: 'text', text: 'roll on ' },
      { kind: 'table', text: 'XX2 +1', code: 'XX2', modifier: 1 },
    ]);
  });
  it('reads coins after a code as a second piece of loot, not a modifier', () => {
    for (const coins of ['+ 10 GC', '+10GC', '+ 10 gc', '+ 5 SC', '+ 3 CC', '+ 10 gold coins']) {
      expect(scanEncounter(`Roll on XX2 ${coins}`, t)).toEqual([
        { kind: 'text', text: 'Roll on ' },
        { kind: 'table', text: 'XX2', code: 'XX2', modifier: 0 },
        { kind: 'text', text: ` ${coins}` },
      ]);
    }
    expect(scanEncounter('XX2 +1 GCX', t)[0]).toEqual({ kind: 'table', text: 'XX2 +1', code: 'XX2', modifier: 1 });
  });
  it('accepts en dash and no modifier', () => {
    const p = scanEncounter('XX1–2 then XX2', t);
    expect(p.filter((x) => x.kind === 'table').map((x) => (x as { modifier: number }).modifier)).toEqual([-2, 0]);
  });
  it('keeps each kind beside a creature code', () => {
    const kinds = scanEncounter('PRAC1 -1 or XX1', t).map((p) => p.kind);
    expect(kinds).toEqual(['roll', 'text', 'table']);
  });
  it('a code in both stays a roll', () => {
    const both = JSON.parse(JSON.stringify(t));
    both.tables.referenceTables.PRAC1 = both.tables.referenceTables.XX1;
    expect(scanEncounter('PRAC1', both)[0]!.kind).toBe('roll');
  });
  it('dice words without "roll" are plain text', () => {
    expect(scanEncounter('Roll 2D6 or a D6', t)).toEqual([
      { kind: 'dice', text: 'Roll 2D6', dice: '2d6' },
      { kind: 'text', text: ' or a D6' },
    ]);
  });
  it('rebuilds the input', () => {
    for (const s of ['roll on XX2 +1.', 'XX1 and PRAC1-1, XX2−3', 'XX1XX2 xx1']) {
      expect(scanEncounter(s, t).map((p) => p.text).join('')).toBe(s);
    }
  });
  it('works without referenceTables', () => {
    const bare = JSON.parse(JSON.stringify(t));
    delete bare.tables.referenceTables;
    expect(scanEncounter('roll on XX2 +1', bare)).toEqual([{ kind: 'text', text: 'roll on XX2 +1' }]);
  });
});

describe('dice phrases', () => {
  const dice = (s: string, tb: DungeonTables | null = t) => scanEncounter(s, tb).filter((p) => p.kind === 'dice');
  it('finds each die after "roll", with or without "a"/"an"', () => {
    expect(dice('Roll a D6.')).toEqual([{ kind: 'dice', text: 'Roll a D6', dice: 'd6' }]);
    expect(dice('Roll D6 now')).toEqual([{ kind: 'dice', text: 'Roll D6', dice: 'd6' }]);
    expect(dice('then roll 2D6')).toEqual([{ kind: 'dice', text: 'roll 2D6', dice: '2d6' }]);
    expect(dice('Roll a D66')).toEqual([{ kind: 'dice', text: 'Roll a D66', dice: 'd66' }]);
    expect(dice('Roll a D3')).toEqual([{ kind: 'dice', text: 'Roll a D3', dice: 'd3' }]);
    expect(dice('ROLL AN d6')).toEqual([{ kind: 'dice', text: 'ROLL AN d6', dice: 'd6' }]);
    expect(dice('Roll 1D6')).toEqual([{ kind: 'dice', text: 'Roll 1D6', dice: 'd6' }]);
  });
  it('D-notation alone, or not a whole word, stays text', () => {
    expect(dice('a D6 or 2D6 in prose')).toEqual([]);
    expect(dice('Reroll a D6')).toEqual([]);
    expect(dice('Roll a D6X')).toEqual([]);
    expect(dice('Roll a D12')).toEqual([]);
    expect(dice('Roll on XX1')).toEqual([]);
  });
  it('never swallows a following code', () => {
    expect(scanEncounter('Roll a D6. 1-4= Roll on XX1', t)).toEqual([
      { kind: 'dice', text: 'Roll a D6', dice: 'd6' },
      { kind: 'text', text: '. 1-4= Roll on ' },
      { kind: 'table', text: 'XX1', code: 'XX1', modifier: 0 },
    ]);
    expect(scanEncounter('Roll a D6: on 1-3 fight the GRUMBLER, else PRAC1 -1', t).map((p) => p.kind)).toEqual(['dice', 'text', 'fight', 'text', 'roll']);
  });
  it('works with no tables and with fights off', () => {
    expect(scanEncounter('Roll 2D6.', null)).toEqual([
      { kind: 'dice', text: 'Roll 2D6', dice: '2d6' },
      { kind: 'text', text: '.' },
    ]);
    expect(dice('Roll a D3 or fight the GRUMBLER', t).length).toBe(1);
  });
  it('rebuilds the input exactly', () => {
    for (const s of ['Roll a D6. 1-4= Roll on XX1', 'roll  a  D66 then Roll 2d6 and roll D3', 'Roll a D6Roll a D6', 'ROLL A D6 GRUMBLER']) {
      expect(scanEncounter(s, t).map((p) => p.text).join('')).toBe(s);
      expect(scanEncounter(s, null).map((p) => p.text).join('')).toBe(s);
      expect(scanReference(s, t).map((p) => p.text).join('')).toBe(s);
    }
  });
  it('scanReference keeps dice phrases as buttons', () => {
    expect(scanReference('Roll a D6. 1-4= XX1', t)).toEqual([
      { kind: 'dice', text: 'Roll a D6', dice: 'd6' },
      { kind: 'text', text: '. 1-4= ' },
      { kind: 'table', text: 'XX1', code: 'XX1', modifier: 0 },
    ]);
  });
});

describe('slug ids', () => {
  it('a slug id stays plain text', () => {
    expect(scanEncounter('see practice-shelf for more', t)).toEqual([{ kind: 'text', text: 'see practice-shelf for more' }]);
  });
  it('a one-word slug does not catch ordinary words', () => {
    const w = JSON.parse(JSON.stringify(t));
    w.tables.referenceTables.traps = w.tables.referenceTables['practice-shelf'];
    expect(scanEncounter('beware the traps', w)).toEqual([{ kind: 'text', text: 'beware the traps' }]);
  });
  it('isSlug tells codes from slugs', () => {
    expect(isSlug('practice-shelf')).toBe(true);
    expect(isSlug('XX1')).toBe(false);
    expect(isSlug('LOOT9')).toBe(false);
  });
});

describe('scanEncounter options and cache', () => {
  it('fights: false leaves creature names as text', () => {
    expect(scanEncounter('fight the GRUMBLER on XX1', t, { fights: false })).toEqual([
      { kind: 'text', text: 'fight the GRUMBLER on ' },
      { kind: 'table', text: 'XX1', code: 'XX1', modifier: 0 },
    ]);
  });
  it('gives the same parts on repeat calls with the same tables', () => {
    const a = scanEncounter('PRAC1 -1 or XX2 +1 and GRUMBLER', t);
    expect(scanEncounter('PRAC1 -1 or XX2 +1 and GRUMBLER', t)).toEqual(a);
  });
  it('a different tables object gets its own codes', () => {
    const bare = JSON.parse(JSON.stringify(t));
    delete bare.tables.referenceTables;
    expect(scanEncounter('XX1', t)[0]!.kind).toBe('table');
    expect(scanEncounter('XX1', bare)[0]!.kind).toBe('text');
  });
});

describe('scanReference', () => {
  const both = JSON.parse(JSON.stringify(t)) as DungeonTables;
  (both.tables.referenceTables as Record<string, unknown>).PRAC1 = (both.tables.referenceTables as Record<string, unknown>).XX1;
  it('a code in both creature and reference tables opens the reference table', () => {
    expect(scanReference('roll PRAC1 -1', both)).toEqual([
      { kind: 'text', text: 'roll ' },
      { kind: 'table', text: 'PRAC1 -1', code: 'PRAC1', modifier: -1 },
    ]);
  });
  it('creature-only codes and creature names stay text', () => {
    expect(scanReference('PRAC2 or the GRUMBLER, then XX2 +1', both)).toEqual([
      { kind: 'text', text: 'PRAC2 or the GRUMBLER, then ' },
      { kind: 'table', text: 'XX2 +1', code: 'XX2', modifier: 1 },
    ]);
  });
  it('slugs stay text and the input round-trips', () => {
    const s = 'see practice-shelf, PRAC1 and XX1';
    expect(scanReference(s, both).map((p) => p.text).join('')).toBe(s);
    expect(scanReference(s, both).filter((p) => p.kind === 'table').map((p) => (p as { code: string }).code)).toEqual(['PRAC1', 'XX1']);
  });
  it('no tables: one text part', () => {
    expect(scanReference('XX1', null)).toEqual([{ kind: 'text', text: 'XX1' }]);
  });
});
