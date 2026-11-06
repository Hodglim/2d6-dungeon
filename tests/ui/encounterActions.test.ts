import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { addRoom, setPlay } from '../../src/core/commands';
import { History } from '../../src/core/history';
import { setFoeHp, type Encounter } from '../../src/systems/dungeon/combat';
import { createHero, levelUpAvailable, type Hero } from '../../src/systems/dungeon/hero';
import type { DungeonTables } from '../../src/systems/dungeon/tables';
import { applyCreatureRoll, commitEncounter, winFight, dismissRolled, dropPendingRoll, placingFirst, queueCreatureRoll, recoverThrown, startOrJoin, throwBomb, throwWeapon, type EncounterHooks } from '../../src/ui/encounter/encounterActions';
import { adjustHp } from '../../src/ui/hero/heroActions';
import { door, emptyMap, room, withContent } from '../core/fixtures';

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

  describe('XP as each creature falls', () => {
    const fight = (names = ['Grumbler', 'Moss Lurker']) => {
      const h = new History(emptyMap(), 20, hero());
      startOrJoin(h, t, names, ids(), noAsk);
      return h;
    };
    const xp = (h: History) => (h.hero as Hero).xp;
    const down = (h: History, i: number, hp = 0) => {
      const f = enc(h).foes[i]!;
      return commitEncounter(h, setFoeHp(enc(h), f.id, hp), `${f.name} HP ${hp}`);
    };

    it("adds a creature's XP to the hero in the step that defeats it, with the rest still standing", () => {
      const h = fight();
      down(h, 0);
      expect(xp(h)).toBe(2);
      expect(enc(h).xpAwarded).toBe(2);
      expect(h.undoLabel).toBe('Grumbler HP 0, XP +2');
      down(h, 1, -1);
      expect(xp(h)).toBe(5);
      expect(enc(h).xpAwarded).toBe(5);
      h.undo();
      expect(xp(h)).toBe(2);
      h.undo();
      expect(xp(h)).toBe(0);
      expect(enc(h).xpAwarded).toBe(0);
    });

    it('takes the XP back when a defeated creature is brought back above 0 HP', () => {
      const h = fight();
      down(h, 0);
      down(h, 0, 1);
      expect(xp(h)).toBe(0);
      expect(enc(h).xpAwarded).toBe(0);
      expect(h.undoLabel).toBe('Grumbler HP 1, XP −2');
    });

    it('HP taps that reach 0 and come back up leave no step and no XP', () => {
      let clock = 0;
      const h = new History(emptyMap(), 20, hero(), () => clock);
      startOrJoin(h, t, ['Dust Wisp', 'Grumbler'], ids(), noAsk);
      const id = enc(h).foes[0]!.id;
      const tap = (d: number) => {
        clock += 100;
        const e = enc(h);
        commitEncounter(h, setFoeHp(e, id, e.foes[0]!.hp + d), 'HP', { mergeKey: `foe-hp:${id}` });
      };
      for (let i = 0; i < 3; i++) tap(-1);
      expect(xp(h)).toBe(1);
      expect(h.undoLabel).toBe('Dust Wisp HP −3, XP +1');
      tap(1);
      expect(xp(h)).toBe(0);
      expect(h.undoLabel).toBe('Dust Wisp HP −2');
      tap(1);
      tap(1);
      expect(h.undoLabel).toBe('Start encounter');
    });

    it('a throw that defeats a creature adds its XP in the same step', () => {
      const h = fight(['Dust Wisp', 'Grumbler']);
      const e = enc(h);
      commitEncounter(h, setFoeHp(e, e.foes[0]!.id, 0), 'Throw', { hero: { ...(h.hero as Hero), name: 'Pip the Thrower' } });
      expect(h.hero).toMatchObject({ name: 'Pip the Thrower', xp: 1 });
    });

    it('the XP can make a level up available mid-fight', () => {
      const h = new History(emptyMap(), 20, { ...hero(), xp: 9 });
      startOrJoin(h, t, ['Dust Wisp', 'Grumbler'], ids(), noAsk);
      down(h, 0);
      expect(levelUpAvailable(h.hero as Hero)).toBe(true);
    });

    it('without a hero no XP is recorded', () => {
      const h = new History(emptyMap());
      startOrJoin(h, t, ['Grumbler', 'Dust Wisp'], ids(), noAsk);
      down(h, 0);
      expect(h.hero).toBeNull();
      expect(enc(h).xpAwarded).toBe(0);
    });

    it('ending the fight early keeps the XP of creatures already defeated', () => {
      const h = fight();
      down(h, 0);
      commitEncounter(h, null, 'End encounter');
      expect(xp(h)).toBe(2);
    });

    it('winning adds any defeated XP not yet added (a fight saved before XP came per creature)', () => {
      const h = fight();
      const e = enc(h);
      const allDown = { ...e, foes: e.foes.map((f) => ({ ...f, hp: 0, defeatedInRound: 1 })) };
      h.execute(setPlay({ hero: h.hero, encounter: allDown }, 'old save'));
      expect(xp(h)).toBe(0);
      winFight(h);
      expect(xp(h)).toBe(5);
      h.undo();
      expect(xp(h)).toBe(0);
    });

    it('winning adds nothing more when the XP is already in', () => {
      const h = fight();
      for (let i = 0; i < 2; i++) down(h, i);
      winFight(h);
      expect(xp(h)).toBe(5);
    });
  });

  describe('winning the fight', () => {
    const inRoom = (narrative: string, token: { x: number; y: number } | null = { x: 2, y: 2 }) => {
      const r = { ...room('r1', 1, 1, 3, 3), label: { type: 'Hall', unique: false, narrative } };
      const h = new History({ ...withContent(emptyMap(), [r]), token: token && { ...token, trail: [] } });
      startOrJoin(h, t, ['Grumbler', 'Grumbler', 'Moss Lurker'], ids(), noAsk);
      for (const f of enc(h).foes) commitEncounter(h, setFoeHp(enc(h), f.id, 0), 'down');
      return h;
    };
    const narrative = (h: History) => h.map.rooms[0]!.label.narrative;

    it("closes the fight and adds the defeated foes to the hero's room's narrative, in one undo step", () => {
      const h = inRoom('');
      expect(winFight(h)).toEqual({ ok: true });
      expect(h.encounter).toBeNull();
      expect(narrative(h)).toBe('Defeated Grumbler ×2, Moss Lurker.');
      expect(h.undoLabel).toBe('Win the fight');
      h.undo();
      expect(narrative(h)).toBe('');
      expect(enc(h).foes).toHaveLength(3);
    });

    it('adds a new line after narrative already written', () => {
      const h = inRoom('Smells of moss.');
      winFight(h);
      expect(narrative(h)).toBe('Smells of moss.\nDefeated Grumbler ×2, Moss Lurker.');
    });

    it("marks the hero's room as fought in and won, in the same undo step", () => {
      const h = inRoom('');
      expect(h.map.rooms[0]!.battles).toBeUndefined();
      winFight(h);
      expect(h.map.rooms[0]!.battles).toBe(1);
      h.undo();
      expect(h.map.rooms[0]!.battles).toBeUndefined();
    });

    it('counts a second won fight in the same room', () => {
      const h = inRoom('');
      winFight(h);
      startOrJoin(h, t, ['Grumbler'], ids(), noAsk);
      for (const f of enc(h).foes) commitEncounter(h, setFoeHp(enc(h), f.id, 0), 'down');
      winFight(h);
      expect(h.map.rooms[0]!.battles).toBe(2);
    });

    it('with no token, or the token outside a room, only closes the fight', () => {
      for (const token of [null, { x: 8, y: 8 }]) {
        const h = inRoom('', token);
        expect(winFight(h)).toEqual({ ok: true });
        expect(h.encounter).toBeNull();
        expect(narrative(h)).toBe('');
        expect(h.map.rooms[0]!.battles).toBeUndefined();
      }
    });
  });
});

describe('winning a patrol fight at a locked door', () => {
  const locked = { ...door('d1', 4, 2, 'W', 'metal'), checked: true as const, lock: { locked: true, note: '', quality: 8, damaged: true as const } };
  const label = (type: string) => ({ type, unique: false, narrative: '' });
  function waiting(rooms: ReturnType<typeof room>[], token: { x: number; y: number }, doorId = 'd1') {
    const h = new History({ ...withContent(emptyMap(), rooms, [locked]), token: { ...token, trail: [] } });
    startOrJoin(h, t, ['Grumbler'], ids(), noAsk);
    commitEncounter(h, { ...enc(h), waitingDoorId: doorId }, 'wait');
    for (const f of enc(h).foes) commitEncounter(h, setFoeHp(enc(h), f.id, 0), 'down');
    return h;
  }
  const a = () => ({ ...room('ra', 1, 1, 3, 3), label: label('A') });
  const roomOf = (h: History, id: string) => h.map.rooms.find((r) => r.id === id)!;

  it('opens the door and marks the room the exit belongs to, not the token room', () => {
    const b = { ...room('rb', 6, 6, 2, 2), label: label('B') };
    const h = waiting([a(), b], { x: 6, y: 6 });
    expect(winFight(h)).toEqual({ ok: true });
    expect(h.map.doors[0]!.lock).toEqual({ locked: false, note: '', quality: 8 });
    expect(roomOf(h, 'ra').battles).toBe(1);
    expect(roomOf(h, 'ra').label.narrative).toBe('Defeated Grumbler.');
    expect(roomOf(h, 'rb').battles).toBeUndefined();
    expect(h.undoLabel).toBe('Win the fight');
    h.undo();
    expect(h.map.doors[0]!.lock).toMatchObject({ locked: true, damaged: true });
    expect(roomOf(h, 'ra').battles).toBeUndefined();
    expect(enc(h).waitingDoorId).toBe('d1');
  });

  it('a door between two rooms marks the token room when the token is on either side', () => {
    const b = { ...room('rb', 4, 1, 2, 3), label: label('B') };
    const h = waiting([a(), b], { x: 4, y: 2 });
    winFight(h);
    expect(roomOf(h, 'rb').battles).toBe(1);
    expect(roomOf(h, 'ra').battles).toBeUndefined();
  });

  it('a waiting door no longer on the map: the fight still closes', () => {
    const h = waiting([a()], { x: 2, y: 2 }, 'gone');
    expect(winFight(h)).toEqual({ ok: true });
    expect(h.encounter).toBeNull();
    expect(h.map.doors[0]!.lock?.locked).toBe(true);
    expect(roomOf(h, 'ra').battles).toBe(1);
  });
});

describe('placingFirst', () => {
  function spyHooks() {
    const calls: string[] = [];
    const hooks: EncounterHooks = {
      onroll: (code, mod) => calls.push(`roll ${code} ${mod}`),
      onfight: (name) => calls.push(`fight ${name}`),
      onopentable: (code, mod) => calls.push(`table ${code} ${mod}`),
    };
    return { calls, hooks };
  }

  it('places the room before a Roll or Fight is saved, so a reload never keeps a fight without its room', () => {
    const { calls, hooks } = spyHooks();
    const wrapped = placingFirst(hooks, () => (calls.push('place'), true));
    wrapped.onroll('PRAC1', -1);
    wrapped.onfight('Grumbler');
    expect(calls).toEqual(['place', 'roll PRAC1 -1', 'place', 'fight Grumbler']);
  });

  it('starts nothing when the room could not be placed', () => {
    const { calls, hooks } = spyHooks();
    const wrapped = placingFirst(hooks, () => (calls.push('place'), false));
    wrapped.onroll('PRAC1', 0);
    wrapped.onfight('Grumbler');
    expect(calls).toEqual(['place', 'place']);
  });

  it('opens a table without placing the room (nothing is saved)', () => {
    const { calls, hooks } = spyHooks();
    placingFirst(hooks, () => (calls.push('place'), true)).onopentable('XX1', 2);
    expect(calls).toEqual(['table XX1 2']);
  });
});

describe('throwing weapons and potion bombs', () => {
  /** A fight with one Grumbler and a hero carrying a spike and a bomb. */
  function setup() {
    const h = new History(emptyMap());
    commitEncounter(h, null, 'x', { hero: { ...hero(), largeItems: ['Spike +1'], potions: [{ name: 'Fizz Jar', effect: '' }] } });
    startOrJoin(h, t, ['Grumbler'], ids(), noAsk);
    return h;
  }
  const spike = { weapon: { name: 'Spike', damage: 5 }, list: 'largeItems' as const, index: 0, item: 'Spike +1', modifier: 1 };
  const fizz = { bomb: { name: 'Fizz Jar', effect: '', damage: '2D6 +1' }, index: 0 };

  it('a throw takes the weapon from the pack, logs it and takes the damage off, as one step', () => {
    const h = setup();
    const before = enc(h).foes[0]!.hp;
    // D66 of 3 & 4 against Damp Hide (secondary 4s, −1): 5 + 1 − 1 = 5
    const ints = [{ name: 'Damp Hide', side: 'secondary' as const, dice: [4], modifier: -1 }];
    expect(throwWeapon(h, spike, 'f1', ints, [3, 4])).toEqual({ ok: true });
    expect(enc(h).foes[0]!.hp).toBe(Math.max(0, before - 5));
    expect(enc(h).throws).toEqual([
      { kind: 'weapon', name: 'Spike', foeId: 'f1', round: 1, faces: [3, 4], damage: 5, interrupts: ['Damp Hide'], item: 'Spike +1', list: 'largeItems', deflected: true },
    ]);
    expect((h.hero as Hero).largeItems).toEqual([]);
    expect(h.undoLabel).toBe('Throw Spike, XP +2'); // the Grumbler (4 HP) falls, and its XP comes in the same step
    expect((h.hero as Hero).xp).toBe(2);
    h.undo();
    expect((h.hero as Hero).largeItems).toEqual(['Spike +1']);
    expect(enc(h).throws).toBeUndefined();
  });

  it('a bomb is used up and its rolled damage taken off', () => {
    const h = setup();
    commitEncounter(h, setFoeHp(enc(h), 'f1', 20), 'hp');
    expect(throwBomb(h, fizz, 'f1', 2, [4, 1])).toEqual({ ok: true }); // 4 + 1 + 1 = 6
    expect(enc(h).foes[0]!.hp).toBe(14);
    expect(enc(h).throws![0]).toMatchObject({ kind: 'bomb', name: 'Fizz Jar', faces: [4, 1], damage: 6 });
    expect((h.hero as Hero).potions).toEqual([]);
  });

  it('a bomb is refused when another potion now sits at its index', () => {
    const h = setup();
    commitEncounter(h, enc(h), 'swap', { hero: { ...(h.hero as Hero), potions: [{ name: 'Plain Tonic', effect: '' }] } });
    const hero0 = h.hero;
    const enc0 = h.encounter;
    expect(throwBomb(h, fizz, 'f1', 2, [4, 1])).toEqual({ ok: false, reason: 'Fizz Jar is no longer in the pack' });
    expect(h.hero).toBe(hero0);
    expect(h.encounter).toBe(enc0);
  });

  it('throwBomb with no damage dice ignores faces', () => {
    const h = setup();
    commitEncounter(h, setFoeHp(enc(h), 'f1', 20), 'hp');
    commitEncounter(h, enc(h), 'swap', { hero: { ...(h.hero as Hero), potions: [{ name: 'Smoke Jar', effect: '' }] } });
    const smoke = { bomb: { name: 'Smoke Jar', effect: '' }, index: 0 };
    expect(throwBomb(h, smoke, 'f1', 1, [])).toEqual({ ok: true });
    expect(enc(h).foes[0]!.hp).toBe(20);
    expect(enc(h).throws![0]).toMatchObject({ kind: 'bomb', name: 'Smoke Jar', faces: [], damage: 0 });
  });

  it('a weapon that was not deflected can be recovered after the fight', () => {
    const h = setup();
    throwWeapon(h, spike, 'f1', [], [3, 4]);
    expect(recoverThrown(h, 0, 5)).toEqual({ ok: true });
    expect((h.hero as Hero).largeItems).toEqual(['Spike +1']);
    expect(enc(h).throws![0]!.recovered).toBe(true);
    expect(recoverThrown(h, 0, 5).ok).toBe(false);
    h.undo();
    expect(recoverThrown(h, 0, 2)).toEqual({ ok: true });
    expect((h.hero as Hero).largeItems).toEqual([]);
    expect(enc(h).throws![0]!.recovered).toBe(false);
  });
});
