import { describe, it, expect } from 'vitest';
import {
  newEncounter, addFoe, setFoeHp, nextRound, queueRoll, resolveRoll, recordRoll, dropRolled, awardXp, fatigueDie, fatigueShift,
  momentumShift, allDefeated, totalXp, treasureLines, interruptReminder, encounterProblem, nextTurn, turnFoe, logThrow, setRecovered, bombEffect,
} from '../../src/systems/dungeon/combat';

const stats = { level: 1, hp: 6, xp: 3, shift: 1, treasure: 'a shiny thing' };
const two = () => addFoe(addFoe(newEncounter(), 'Gob', stats, 6, 'a'), 'Blin', stats, 6, 'b');

describe('fatigue', () => {
  it('die and shift by round', () => {
    const r = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(r.map(fatigueDie)).toEqual([1, 2, 3, 4, 5, 6, 6, 6]);
    expect(r.map(fatigueShift)).toEqual([0, 0, 0, 1, 2, 3, 3, 3]);
  });
});

describe('foes', () => {
  it('addFoe with and without stats', () => {
    const e = addFoe(addFoe(newEncounter(), 'Gob', stats, 4, 'a'), 'Odd', null, 9, 'b');
    expect(e.foes[0]).toEqual({ id: 'a', name: 'Gob', hp: 4, startHp: 4, xp: 3, shift: 1, treasure: 'a shiny thing', defeatedInRound: null });
    expect(e.foes[1]).toMatchObject({ hp: 9, xp: null, shift: null, treasure: null });
  });
  it('setFoeHp sets and clears defeat', () => {
    const e = two();
    const d = setFoeHp(e, 'a', 0);
    expect(d.foes[0]!.defeatedInRound).toBe(1);
    expect(setFoeHp(d, 'a', 5).foes[0]!.defeatedInRound).toBeNull();
    expect(setFoeHp(e, 'a', -3).foes[0]).toMatchObject({ hp: -3, defeatedInRound: 1 });
  });
  it('keeps the original defeat round when hp drops further', () => {
    const e = nextRound(setFoeHp(two(), 'a', 0));
    expect(setFoeHp(e, 'a', -2).foes[0]!.defeatedInRound).toBe(1);
  });
});

describe('momentum', () => {
  it('2 in round 2 only', () => {
    let e = setFoeHp(two(), 'a', 0);
    e = nextRound(e);
    expect(momentumShift(e)).toBe(2);
    expect(momentumShift(nextRound(e))).toBe(0);
  });
  it('0 with one foe or a round 2 kill', () => {
    const one = nextRound(setFoeHp(addFoe(newEncounter(), 'G', stats, 6, 'a'), 'a', 0));
    expect(momentumShift(one)).toBe(0);
    expect(momentumShift(setFoeHp(nextRound(two()), 'a', 0))).toBe(0);
  });
});

describe('summaries', () => {
  it('allDefeated', () => {
    expect(allDefeated(newEncounter())).toBe(false);
    const e = two();
    expect(allDefeated(setFoeHp(e, 'a', 0))).toBe(false);
    expect(allDefeated(setFoeHp(setFoeHp(e, 'a', 0), 'b', -1))).toBe(true);
  });
  it('totalXp skips null; treasureLines skips empty', () => {
    let e = addFoe(newEncounter(), 'A', stats, 1, 'a');
    e = addFoe(e, 'B', null, 1, 'b');
    e = addFoe(e, 'C', { ...stats, treasure: '' }, 1, 'c');
    expect(totalXp(e)).toBe(6);
    expect(treasureLines(e)).toEqual(['A: a shiny thing']);
  });
  it('interruptReminder', () => {
    expect(interruptReminder(6)).toBe(false);
    expect(interruptReminder(7)).toBe(true);
  });
});

describe('rolls and purity', () => {
  it('queue and resolve', () => {
    const e = queueRoll(queueRoll(newEncounter(), { code: 'x', modifier: 1 }), { code: 'y', modifier: 0 });
    expect(resolveRoll(e, 0).pending).toEqual([{ code: 'y', modifier: 0 }]);
  });
  it('record and drop resolved rolls; award XP', () => {
    let e = recordRoll(newEncounter(), { code: 'x', modifier: 1, die: 2, total: 3 });
    e = recordRoll(e, { code: 'y', modifier: 0, die: 5, total: 5 });
    expect(e.rolled.map((r) => r.code)).toEqual(['x', 'y']);
    expect(dropRolled(e, 0).rolled).toEqual([{ code: 'y', modifier: 0, die: 5, total: 5 }]);
    expect(awardXp(awardXp(e, 3), 2).xpAwarded).toBe(5);
    expect(newEncounter().xpAwarded).toBe(0);
  });
  it('returns new objects, leaves input unchanged', () => {
    const e = two();
    const snap = JSON.stringify(e);
    const outs = [
      addFoe(e, 'z', null, 1, 'z'), setFoeHp(e, 'a', 0), nextRound(e),
      queueRoll(e, { code: 'x', modifier: 0 }), resolveRoll(queueRoll(e, { code: 'x', modifier: 0 }), 0),
      recordRoll(e, { code: 'x', modifier: 0, die: 1, total: 1 }), awardXp(e, 2),
    ];
    const r = recordRoll(e, { code: 'x', modifier: 0, die: 1, total: 1 });
    const rs = JSON.stringify(r);
    dropRolled(r, 0);
    expect(JSON.stringify(r)).toBe(rs);
    for (const o of outs) expect(o).not.toBe(e);
    expect(JSON.stringify(e)).toBe(snap);
  });
});

describe('encounterProblem', () => {
  it('accepts valid encounters', () => {
    expect(encounterProblem(newEncounter())).toBeNull();
    expect(encounterProblem(two())).toBeNull();
    expect(encounterProblem(queueRoll(two(), { code: 'x', modifier: -1 }))).toBeNull();
  });
  it('flags damage with a located message', () => {
    expect(encounterProblem({ ...newEncounter(), version: 2 })).toMatch(/version/);
    expect(encounterProblem({ ...newEncounter(), round: 1.5 })).toMatch(/round/);
    const e = two();
    const bad = { ...e, foes: [{ ...e.foes[0], hp: undefined }] };
    expect(encounterProblem(bad)).toMatch(/foes\[0\] hp/);
    expect(encounterProblem(null)).not.toBeNull();
    expect(encounterProblem({ ...e, pending: [{ code: 1, modifier: 0 }] })).toMatch(/pending\[0\]/);
  });
  it('checks the throws, and still reads a fight saved without them', () => {
    const e = two();
    const id = e.foes[0]!.id;
    const ok = logThrow(e, { kind: 'weapon', name: 'Spike', foeId: id, round: 1, faces: [3, 4], damage: 4, item: 'Spike', list: 'largeItems', deflected: false });
    expect(encounterProblem(ok)).toBeNull();
    expect(encounterProblem(setRecovered(ok, 0, true))).toBeNull();
    expect(setRecovered(ok, 0, true).throws![0]!.recovered).toBe(true);
    expect(ok.throws).toHaveLength(1);
    expect(e.throws).toBeUndefined();
    const t = ok.throws![0]!;
    expect(encounterProblem({ ...ok, throws: {} })).toMatch(/throws/);
    expect(encounterProblem({ ...ok, throws: [{ ...t, kind: 'rock' }] })).toMatch(/throws\[0\] kind/);
    expect(encounterProblem({ ...ok, throws: [{ ...t, foeId: 'nobody' }] })).toMatch(/throws\[0\] foeId/);
    expect(encounterProblem({ ...ok, throws: [{ ...t, faces: [7] }] })).toMatch(/throws\[0\] faces/);
    expect(encounterProblem({ ...ok, throws: [{ ...t, damage: -1 }] })).toMatch(/throws\[0\] damage/);
    expect(encounterProblem({ ...ok, throws: [{ ...t, list: 'pockets' }] })).toMatch(/throws\[0\] list/);
    expect(encounterProblem({ ...ok, throws: [{ ...t, deflected: 'no' }] })).toMatch(/throws\[0\] deflected/);
  });
  it('finds a bomb effect on a foe this round only', () => {
    const e = two();
    const id = e.foes[0]!.id;
    const b = logThrow(e, { kind: 'bomb', name: 'Glare Phial', foeId: id, round: 1, faces: [], damage: 0, noAttack: true });
    expect(bombEffect(b, id, 'noAttack')).toBe('Glare Phial');
    expect(bombEffect(b, id, 'noMovementInterrupts')).toBeNull();
    expect(bombEffect(b, e.foes[1]!.id, 'noAttack')).toBeNull();
    expect(bombEffect({ ...b, round: 2 }, id, 'noAttack')).toBeNull();
  });
  it('refuses duplicate foe ids', () => {
    const e = two();
    expect(encounterProblem({ ...e, foes: [e.foes[0], { ...e.foes[1], id: e.foes[0]!.id }] })).toMatch(/foes\[1\] id is a duplicate/);
  });
  it('checks the resolved rolls and the XP awarded', () => {
    const e = recordRoll(two(), { code: 'x', modifier: -1, die: 1, total: 1 });
    expect(encounterProblem(e)).toBeNull();
    expect(encounterProblem({ ...e, rolled: undefined })).toMatch(/rolled/);
    expect(encounterProblem({ ...e, rolled: [{ code: 'x', modifier: 0, die: 7, total: 6 }] })).toMatch(/rolled\[0\] die/);
    expect(encounterProblem({ ...e, rolled: [{ code: 'x', modifier: 0, die: 2, total: 0 }] })).toMatch(/rolled\[0\] total/);
    expect(encounterProblem({ ...e, rolled: [{ code: 'x', modifier: 0.5, die: 2, total: 2 }] })).toMatch(/rolled\[0\] modifier/);
    expect(encounterProblem({ ...e, xpAwarded: -1 })).toMatch(/xpAwarded/);
    expect(encounterProblem({ ...e, xpAwarded: undefined })).toMatch(/xpAwarded/);
  });
});

describe('turns', () => {
  const three = () => addFoe(two(), 'Wisp', stats, 3, 'c');
  it('a fight starts on the hero\'s turn', () => {
    expect(newEncounter().turn).toBe('hero');
    expect(turnFoe(two())).toBeNull();
  });
  it('hero, then each standing foe in order, then a new round', () => {
    let e = three();
    e = nextTurn(e);
    expect(e.turn).toBe('a');
    expect(turnFoe(e)?.name).toBe('Gob');
    e = nextTurn(e);
    expect(e.turn).toBe('b');
    e = nextTurn(e);
    expect(e.turn).toBe('c');
    expect(e.round).toBe(1);
    e = nextTurn(e);
    expect(e).toMatchObject({ turn: 'hero', round: 2 });
  });
  it('skips defeated foes', () => {
    let e = setFoeHp(three(), 'a', 0);
    e = nextTurn(e);
    expect(e.turn).toBe('b');
    e = setFoeHp(e, 'c', -1);
    e = nextTurn(e);
    expect(e).toMatchObject({ turn: 'hero', round: 2 });
  });
  it('a foe defeated on its own turn is passed over by the next call', () => {
    let e = nextTurn(three());
    e = setFoeHp(e, 'a', 0);
    expect(e.turn).toBe('a');
    e = nextTurn(e);
    expect(e.turn).toBe('b');
  });
  it('with no foe standing, the hero\'s turn goes straight to the next round', () => {
    const e = nextTurn(setFoeHp(setFoeHp(two(), 'a', 0), 'b', 0));
    expect(e).toMatchObject({ turn: 'hero', round: 2 });
    expect(nextTurn(newEncounter())).toMatchObject({ turn: 'hero', round: 2 });
  });
  it('wrapping raises the fatigue die', () => {
    let e = two();
    for (let i = 0; i < 9; i++) e = nextTurn(e);
    expect(e).toMatchObject({ turn: 'hero', round: 4 });
    expect(fatigueShift(e.round)).toBe(1);
  });
  it('nextRound always hands the turn back to the hero', () => {
    expect(nextRound(nextTurn(two())).turn).toBe('hero');
  });
  it('does not change the input', () => {
    const e = two();
    nextTurn(e);
    expect(e.turn).toBe('hero');
  });
  it('encounterProblem checks the turn', () => {
    const e = two();
    expect(encounterProblem(nextTurn(e))).toBeNull();
    expect(encounterProblem({ ...e, turn: 'zz' })).toMatch(/turn/);
    expect(encounterProblem({ ...e, turn: 3 })).toMatch(/turn/);
    expect(encounterProblem({ ...e, turn: undefined })).toMatch(/turn/);
  });
});
