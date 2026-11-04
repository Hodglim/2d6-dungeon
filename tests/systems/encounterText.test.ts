import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/dungeon-tables.fixture.json';
import type { DungeonTables } from '../../src/systems/dungeon/tables';
import { scanEncounter } from '../../src/systems/dungeon/encounterText';

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
