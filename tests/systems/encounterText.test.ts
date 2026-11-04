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
    expect(scanEncounter('Gain 1 FP. Roll a D6.', t)).toEqual([{ kind: 'text', text: 'Gain 1 FP. Roll a D6.' }]);
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
  it('dice words are plain text', () => {
    expect(scanEncounter('Roll 2D6 or a D6', t)).toEqual([{ kind: 'text', text: 'Roll 2D6 or a D6' }]);
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
