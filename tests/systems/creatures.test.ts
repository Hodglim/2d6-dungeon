import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/dungeon-tables.fixture.json';
import type { DungeonTables } from '../../src/systems/dungeon/tables';
import type { CardPack } from '../../src/systems/dungeon/cards';
import { findCard, findCreature, rollCreatureTable } from '../../src/systems/dungeon/creatures';

const t = fixture as unknown as DungeonTables;
const pack: CardPack = {
  format: 1, systemId: 'dungeon', name: 'p',
  cards: [{ id: 'c1', name: 'Moss Lurker', level: 1, image: 'data:image/png;base64,AA==' }],
};

describe('rollCreatureTable', () => {
  it('applies the modifier', () => {
    const r = rollCreatureTable(t, 'PRAC1', 4, -1)!;
    expect(r.total).toBe(3);
    expect(r.die).toBe(4);
    expect(r.modifier).toBe(-1);
    expect(r.entry).toEqual({ creatures: ['Dust Wisp'] });
  });
  it('clamps low and high', () => {
    expect(rollCreatureTable(t, 'PRAC1', 1, -1)!.total).toBe(1);
    expect(rollCreatureTable(t, 'PRAC1', 6, 2)!.total).toBe(6);
  });
  it('returns null for an unknown code', () => {
    expect(rollCreatureTable(t, 'NOPE', 3, 0)).toBeNull();
  });
});

describe('findCreature', () => {
  it('ignores case and returns the table spelling', () => {
    expect(findCreature(t, 'moss LURKER')!.name).toBe('Moss Lurker');
    expect(findCreature(t, 'GRUMBLER')!.stats.hp).toBe(4);
  });
  it('returns null for unknown or missing table', () => {
    expect(findCreature(t, 'Nobody')).toBeNull();
    expect(findCreature(null, 'Grumbler')).toBeNull();
  });
});

describe('findCard', () => {
  it('ignores case', () => {
    expect(findCard(pack, 'MOSS lurker')!.id).toBe('c1');
  });
  it('never returns a god or herb card', () => {
    const p: CardPack = { ...pack, cards: [{ id: 'g1', name: 'Moss Lurker', level: 0, kind: 'god', image: 'data:image/png;base64,AA==' }] };
    expect(findCard(p, 'Moss Lurker')).toBeNull();
  });
  it('returns null for unknown or missing pack', () => {
    expect(findCard(pack, 'Nobody')).toBeNull();
    expect(findCard(null, 'Moss Lurker')).toBeNull();
  });
});
