import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addRoom } from '../../src/core/commands';
import { History } from '../../src/core/history';
import { setFoeHp, totalXp as totalXpOf, type Encounter } from '../../src/systems/dungeon/combat';
import { createHero, type Hero } from '../../src/systems/dungeon/hero';
import type { DungeonTables } from '../../src/systems/dungeon/tables';
import { applyCreatureRoll, awardVictoryXp, commitEncounter, dismissRolled, dropPendingRoll, queueCreatureRoll, startOrJoin, xpToAward } from '../../src/ui/encounter/encounterActions';
import { adjustHp } from '../../src/ui/hero/heroActions';
import { emptyMap, room } from '../core/fixtures';

const t = JSON.parse(readFileSync('tests/fixtures/dungeon-tables.fixture.json', 'utf8')) as DungeonTables;
const hero = (): Hero =>
  createHero(t, { name: 'Pip', weapon: 'Practice Sword', manoeuvres: ['Wobbly Poke', 'Gentle Swipe'], armour: 'Sackcloth Vest', scroll: 'Scroll of Mild Glow' });

function ids() {
  let n = 0;
  return () => `f${++n}`;
}
const noAsk = () => {
  throw new Error('askHp should not be called');
};
const enc = (h: History) => h.encounter as Encounter;

describe('encounterActions', () => {
  it('startOrJoin with two names makes one undo step with two foes', () => {
    const h = new History(emptyMap());
    expect(startOrJoin(h, t, ['grumbler', 'Moss Lurker'], ids(), noAsk)).toEqual({ ok: true });
    expect(enc(h).foes.map((f) => [f.name, f.hp, f.xp, f.shift])).toEqual([
      ['Grumbler', 4, 2, 0],
      ['Moss Lurker', 6, 3, -1],
    ]);
    expect(enc(h).round).toBe(1);
    expect(h.undoLabel).toBe('Start encounter');
    h.undo();
    expect(h.encounter).toBeNull();
    expect(h.canUndo).toBe(false);
  });

  it('a second call adds to the same encounter', () => {
    const h = new History(emptyMap());
    const next = ids();
    startOrJoin(h, t, ['Grumbler'], next, noAsk);
    commitEncounter(h, { ...enc(h), round: 3 }, 'Next round');
    startOrJoin(h, t, ['Dust Wisp'], next, noAsk);
    expect(enc(h).round).toBe(3);
    expect(enc(h).foes.map((f) => [f.id, f.name])).toEqual([
      ['f1', 'Grumbler'],
      ['f2', 'Dust Wisp'],
    ]);
    expect(h.undoLabel).toBe('Add Dust Wisp');
  });

  it('a name with no stats takes its HP from askHp, and is skipped on null', () => {
    const h = new History(emptyMap());
    const asked: string[] = [];
    startOrJoin(h, t, ['Guard', 'Ghost', 'Grumbler'], ids(), (name) => {
      asked.push(name);
      return name === 'Guard' ? 7 : null;
    });
    expect(asked).toEqual(['Guard', 'Ghost']);
    expect(enc(h).foes.map((f) => [f.name, f.hp, f.startHp, f.xp, f.shift, f.treasure])).toEqual([
      ['Guard', 7, 7, null, null, null],
      ['Grumbler', 4, 4, 2, 0, 'Made-up: a pouch of pebbles.'],
    ]);
  });

  it('works with no table file, and skipping every name leaves no step', () => {
    const h = new History(emptyMap());
    startOrJoin(h, null, ['Grumbler'], ids(), () => null);
    expect(h.encounter).toBeNull();
    expect(h.canUndo).toBe(false);
    startOrJoin(h, null, ['Grumbler'], ids(), () => 5);
    expect(enc(h).foes[0]).toMatchObject({ name: 'Grumbler', hp: 5, xp: null });
  });

  it('folds five −1 taps on a foe into one step labelled "Guard HP −5"', () => {
    let clock = 0;
    const h = new History(emptyMap(), 20, null, () => clock);
    startOrJoin(h, t, ['Guard'], ids(), () => 9);
    const id = enc(h).foes[0]!.id;
    for (let i = 0; i < 5; i++) {
      clock += 200;
      const e = enc(h);
      commitEncounter(h, setFoeHp(e, id, e.foes[0]!.hp - 1), 'HP', { mergeKey: `foe-hp:${id}` });
    }
    expect(enc(h).foes[0]!.hp).toBe(4);
    expect(h.undoLabel).toBe('Guard HP −5');
    h.undo();
    expect(enc(h).foes[0]!.hp).toBe(9);
    expect(h.undoLabel).toBe('Start encounter');
  });

  it('a single foe tap up is labelled "+n", and a run that nets to nothing leaves no step', () => {
    let clock = 0;
    const h = new History(emptyMap(), 20, null, () => clock);
    startOrJoin(h, t, ['Grumbler'], ids(), noAsk);
    const id = enc(h).foes[0]!.id;
    const tap = (d: number) => {
      clock += 100;
      const e = enc(h);
      commitEncounter(h, setFoeHp(e, id, e.foes[0]!.hp + d), 'HP', { mergeKey: `foe-hp:${id}` });
    };
    tap(2);
    expect(h.undoLabel).toBe('Grumbler HP +2');
    tap(-1);
    tap(-1);
    expect(enc(h).foes[0]!.hp).toBe(4);
    expect(h.undoLabel).toBe('Start encounter');
    expect(h.canRedo).toBe(false);
  });

  it('with a hero, one step sets both hero and encounter; without, the hero is unchanged', () => {
    const h = new History(emptyMap(), 20, hero());
    startOrJoin(h, t, ['Grumbler'], ids(), noAsk);
    const before = h.hero;
    commitEncounter(h, { ...enc(h), round: 2 }, 'Next round');
    expect(h.hero).toBe(before);
    const hurt = adjustHp(h.hero as Hero, -3);
    commitEncounter(h, { ...enc(h), round: 3 }, 'Ouch', { hero: hurt });
    expect((h.hero as Hero).hp).toBe(hurt.hp);
    expect(enc(h).round).toBe(3);
    h.undo();
    expect(h.hero).toBe(before);
    expect(enc(h).round).toBe(2);
  });

  it('commitEncounter(null, "End encounter") clears it and Undo restores it', () => {
    const h = new History(emptyMap());
    h.execute(addRoom(room('r1', 1, 1, 3, 3)));
    startOrJoin(h, t, ['Grumbler', 'Moss Lurker'], ids(), noAsk);
    const open = h.encounter;
    commitEncounter(h, null, 'End encounter');
    expect(h.encounter).toBeNull();
    expect(h.undoLabel).toBe('End encounter');
    expect(h.map.rooms).toHaveLength(1);
    h.undo();
    expect(h.encounter).toBe(open);
  });

  describe('creature-table rolls', () => {
    it('tapping Roll with no open encounter creates one with the pending roll, in one step', () => {
      const h = new History(emptyMap());
      expect(queueCreatureRoll(h, 'PRAC1', -1)).toEqual({ ok: true });
      expect(enc(h).foes).toEqual([]);
      expect(enc(h).pending).toEqual([{ code: 'PRAC1', modifier: -1 }]);
      expect(h.undoLabel).toBe('Roll on PRAC1 −1');
      h.undo();
      expect(h.encounter).toBeNull();
      expect(h.canUndo).toBe(false);
    });

    it('queueing onto an encounter with a pending roll appends, even the same roll twice', () => {
      const h = new History(emptyMap());
      queueCreatureRoll(h, 'PRAC1', -1);
      queueCreatureRoll(h, 'PRAC1', -1);
      expect(enc(h).pending).toEqual([
        { code: 'PRAC1', modifier: -1 },
        { code: 'PRAC1', modifier: -1 },
      ]);
      const second = enc(h).pending[1];
      applyCreatureRoll(h, t, 0, 3, ids(), noAsk);
      expect(enc(h).pending).toEqual([{ code: 'PRAC1', modifier: -1 }]);
      expect(enc(h).pending[0]).toBe(second); // the remaining roll is the same object (the pane keys on it)
      h.undo();
      expect(enc(h).pending).toHaveLength(2);
    });

    it('a second Roll queues on the open encounter', () => {
      const h = new History(emptyMap());
      startOrJoin(h, t, ['Grumbler'], ids(), noAsk);
      queueCreatureRoll(h, 'PRAC2', 0);
      expect(enc(h).foes).toHaveLength(1);
      expect(enc(h).pending).toEqual([{ code: 'PRAC2', modifier: 0 }]);
      expect(h.undoLabel).toBe('Roll on PRAC2');
    });

    it('applyCreatureRoll on the two-creature row adds both foes and removes the pending roll, in one step', () => {
      const h = new History(emptyMap());
      queueCreatureRoll(h, 'PRAC1', -1);
      const r = applyCreatureRoll(h, t, 0, 3, ids(), noAsk);
      expect(r).toEqual({ ok: true, roll: { die: 3, modifier: -1, total: 2, entry: { creatures: ['Grumbler', 'Moss Lurker'] } } });
      expect(enc(h).foes.map((f) => [f.name, f.hp])).toEqual([
        ['Grumbler', 4],
        ['Moss Lurker', 6],
      ]);
      expect(enc(h).pending).toEqual([]);
      expect(h.undoLabel).toBe('PRAC1 −1: Grumbler, Moss Lurker');
      h.undo();
      expect(h.undoLabel).toBe('Roll on PRAC1 −1');
    });

    it('die 2 with −1 lands on row 1; totals clamp to 1..6', () => {
      const h = new History(emptyMap());
      queueCreatureRoll(h, 'PRAC1', -1);
      queueCreatureRoll(h, 'PRAC1', 3);
      const low = applyCreatureRoll(h, t, 0, 2, ids(), noAsk);
      expect(low.ok && low.roll.total).toBe(1);
      expect(enc(h).foes.map((f) => f.name)).toEqual(['Moss Lurker']);
      const high = applyCreatureRoll(h, t, 0, 5, ids(), noAsk);
      expect(high.ok && high.roll.total).toBe(6);
      expect(enc(h).foes.map((f) => f.name)).toEqual(['Moss Lurker', 'Grumbler']);
    });

    it('a text row adds no foes and removes the pending roll', () => {
      const h = new History(emptyMap());
      queueCreatureRoll(h, 'PRAC1', 0);
      const r = applyCreatureRoll(h, t, 0, 4, ids(), noAsk);
      expect(r).toEqual({ ok: true, roll: { die: 4, modifier: 0, total: 4, entry: { text: 'Made-up: roll twice on this table.' } } });
      expect(enc(h).foes).toEqual([]);
      expect(enc(h).pending).toEqual([]);
      expect(h.undoLabel).toBe('PRAC1: no creatures');
    });

    it('Undo after applyCreatureRoll brings back the pending roll and removes the foes', () => {
      const h = new History(emptyMap());
      queueCreatureRoll(h, 'PRAC1', -1);
      const before = h.encounter;
      applyCreatureRoll(h, t, 0, 3, ids(), noAsk);
      h.undo();
      expect(h.encounter).toBe(before);
      expect(enc(h).pending).toEqual([{ code: 'PRAC1', modifier: -1 }]);
      expect(enc(h).foes).toEqual([]);
    });

    it('resolves the given pending roll and leaves the others', () => {
      const h = new History(emptyMap());
      queueCreatureRoll(h, 'PRAC1', 0);
      queueCreatureRoll(h, 'PRAC2', 0);
      applyCreatureRoll(h, t, 1, 2, ids(), noAsk);
      expect(enc(h).pending).toEqual([{ code: 'PRAC1', modifier: 0 }]);
      expect(enc(h).foes.map((f) => f.name)).toEqual(['Moss Lurker']);
    });

    it('a creature with no stats asks for its HP; a skipped one is left out but the roll still resolves', () => {
      const tt: DungeonTables = structuredClone(t);
      tt.tables.creatureTables!.PRAC1!['2'] = { creatures: ['Guard', 'Ghost', 'Grumbler'] };
      const h = new History(emptyMap());
      queueCreatureRoll(h, 'PRAC1', 0);
      const asked: string[] = [];
      applyCreatureRoll(h, tt, 0, 2, ids(), (n) => (asked.push(n), n === 'Guard' ? 8 : null));
      expect(asked).toEqual(['Guard', 'Ghost']);
      expect(enc(h).foes.map((f) => [f.name, f.hp])).toEqual([
        ['Guard', 8],
        ['Grumbler', 4],
      ]);
      expect(enc(h).pending).toEqual([]);
      expect(h.undoLabel).toBe('PRAC1: Guard, Grumbler');
    });

    it('refuses a bad index, a die outside 1..6, a missing encounter or an unknown table, changing nothing', () => {
      const h = new History(emptyMap());
      expect(applyCreatureRoll(h, t, 0, 3, ids(), noAsk).ok).toBe(false);
      queueCreatureRoll(h, 'NOPE9', 0);
      queueCreatureRoll(h, 'PRAC1', 0);
      const before = h.encounter;
      expect(applyCreatureRoll(h, t, 5, 3, ids(), noAsk).ok).toBe(false);
      expect(applyCreatureRoll(h, t, 1, 0, ids(), noAsk).ok).toBe(false);
      expect(applyCreatureRoll(h, t, 1, 7, ids(), noAsk).ok).toBe(false);
      const r = applyCreatureRoll(h, t, 0, 3, ids(), noAsk);
      expect(r).toEqual({ ok: false, reason: 'Your table file has no table NOPE9' });
      expect(h.encounter).toBe(before);
    });

    it('a resolved roll is kept in the encounter, in the same step, and Undo takes it back', () => {
      const h = new History(emptyMap());
      queueCreatureRoll(h, 'PRAC1', 0);
      applyCreatureRoll(h, t, 0, 4, ids(), noAsk);
      expect(enc(h).rolled).toEqual([{ code: 'PRAC1', modifier: 0, die: 4, total: 4 }]);
      queueCreatureRoll(h, 'PRAC1', -1);
      applyCreatureRoll(h, t, 0, 1, ids(), noAsk);
      expect(enc(h).rolled.map((r) => [r.die, r.total])).toEqual([
        [4, 4],
        [1, 1],
      ]);
      h.undo();
      expect(enc(h).rolled).toHaveLength(1);
      expect(enc(h).pending).toEqual([{ code: 'PRAC1', modifier: -1 }]);
    });

    it('dismissRolled clears one result as an undoable step', () => {
      const h = new History(emptyMap());
      queueCreatureRoll(h, 'PRAC2', 0);
      applyCreatureRoll(h, t, 0, 5, ids(), noAsk);
      expect(dismissRolled(h, 0)).toEqual({ ok: true });
      expect(enc(h).rolled).toEqual([]);
      expect(h.undoLabel).toBe('Clear PRAC2 result');
      h.undo();
      expect(enc(h).rolled).toHaveLength(1);
      expect(dismissRolled(h, 3).ok).toBe(false);
    });

    it('dropPendingRoll removes an unrolled roll as one step', () => {
      const h = new History(emptyMap());
      queueCreatureRoll(h, 'PRAC1', 0);
      queueCreatureRoll(h, 'PRAC2', 1);
      dropPendingRoll(h, 0);
      expect(enc(h).pending).toEqual([{ code: 'PRAC2', modifier: 1 }]);
      expect(h.undoLabel).toBe('Remove roll on PRAC1');
      h.undo();
      expect(enc(h).pending).toHaveLength(2);
    });
  });

  describe('victory XP', () => {
    const won = () => {
      const h = new History(emptyMap(), 20, hero());
      startOrJoin(h, t, ['Grumbler', 'Moss Lurker'], ids(), noAsk);
      for (const f of enc(h).foes) commitEncounter(h, setFoeHp(enc(h), f.id, 0), 'down');
      return h;
    };
    const xp = (h: History) => (h.hero as Hero).xp;

    it('adds the XP and marks it awarded in one step; a second award is refused', () => {
      const h = won();
      expect(xpToAward(enc(h))).toBe(5);
      expect(awardVictoryXp(h)).toEqual({ ok: true });
      expect(xp(h)).toBe(5);
      expect(enc(h).xpAwarded).toBe(5);
      expect(xpToAward(enc(h))).toBe(0);
      expect(h.undoLabel).toBe('XP +5');
      expect(awardVictoryXp(h).ok).toBe(false);
      expect(xp(h)).toBe(5);
    });

    it('Undo of the XP step takes the XP back and offers it again', () => {
      const h = won();
      awardVictoryXp(h);
      h.undo();
      expect(xp(h)).toBe(0);
      expect(enc(h).xpAwarded).toBe(0);
      expect(xpToAward(enc(h))).toBe(5);
    });

    it('Undo of Done reopens the fight with the XP still awarded, so it is not offered twice', () => {
      const h = won();
      awardVictoryXp(h);
      commitEncounter(h, null, 'Win the fight');
      h.undo();
      expect(enc(h).xpAwarded).toBe(5);
      expect(xpToAward(enc(h))).toBe(0);
      expect(awardVictoryXp(h).ok).toBe(false);
      expect(xp(h)).toBe(5);
    });

    it('a creature added after the award offers only its own XP', () => {
      const h = won();
      awardVictoryXp(h);
      startOrJoin(h, t, ['Dust Wisp'], () => 'w', noAsk);
      expect(xpToAward(enc(h))).toBe(totalXpOf(enc(h)) - 5);
    });

    it('needs a hero', () => {
      const h = new History(emptyMap());
      startOrJoin(h, t, ['Grumbler'], ids(), noAsk);
      expect(awardVictoryXp(h).ok).toBe(false);
    });
  });
});
