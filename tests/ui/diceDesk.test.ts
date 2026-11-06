import { describe, expect, it } from 'vitest';
import { DiceDesk, forLine, historyLine, type DiceJob } from '../../src/ui/diceDesk';

const seq = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length]!;
};

interface Calls {
  rolled: [number[], number][];
  enter: [string[], number][];
}
function job(id: string, o: Partial<DiceJob> = {}): DiceJob & { calls: Calls } {
  const calls: Calls = { rolled: [], enter: [] };
  return {
    id,
    kind: 'request',
    label: id,
    dice: 'd6',
    modifier: null,
    rolled: (f, m) => void calls.rolled.push([f, m]),
    enter: (v, m) => void calls.enter.push([v, m]),
    ...o,
    calls,
  };
}
const req = (id: string, o: Partial<DiceJob> = {}) => job(id, { kind: 'request', ...o });
const watcher = (id: string, o: Partial<DiceJob> = {}) => job(id, { kind: 'watcher', ...o });
const fresh = () => new DiceDesk({ open: false, dice: 'd6', enter: false });

describe('targeting', () => {
  it('new request becomes the target when nothing is targeted', () => {
    const d = fresh();
    d.put(req('a', { dice: '2d6' }));
    expect(d.view.target?.id).toBe('a');
    expect(d.view.kind).toBe('2d6');
  });
  it('second request does not take over', () => {
    const d = fresh();
    d.put(req('a'));
    d.put(req('b'));
    expect(d.view.target?.id).toBe('a');
    d.remove('a');
    expect(d.view.target?.id).toBe('b');
  });
  it('request takes over from a watcher; watcher returns when it goes', () => {
    const d = fresh();
    d.put(watcher('w'));
    expect(d.view.target?.id).toBe('w');
    d.put(req('r'));
    expect(d.view.target?.id).toBe('r');
    d.remove('r');
    expect(d.view.target?.id).toBe('w');
  });
  it('rollNow targets and bumps rollSeq; in enter mode bumps focusSeq instead', () => {
    const d = fresh();
    d.put(req('a'));
    d.put(req('b'));
    d.rollNow('b');
    expect(d.view.target?.id).toBe('b');
    expect(d.view.open).toBe(true);
    expect(d.view.rollSeq).toBe(1);
    expect(d.view.focusSeq).toBe(0);
    d.setEnterMode(true);
    d.rollNow('a');
    expect(d.view.target?.id).toBe('a');
    expect(d.view.rollSeq).toBe(1);
    expect(d.view.focusSeq).toBe(1);
  });
});

describe('routing', () => {
  it('settle routes by the job id captured at roll start', () => {
    const d = fresh();
    const a = req('a');
    const b = req('b');
    d.put(a);
    d.put(b);
    const s = d.facesFor(seq(0.5))!;
    expect(s.jobId).toBe('a');
    d.rollNow('b');
    d.settle(s.jobId, s.faces, 'd6', 0);
    expect(a.calls.rolled).toHaveLength(1);
    expect(b.calls.rolled).toHaveLength(0);
  });
  it('settle after remove does nothing but add a free-form history line', () => {
    const d = fresh();
    const a = req('a');
    d.put(a);
    const s = d.facesFor(seq(0.5))!;
    d.remove('a');
    d.settle(s.jobId, s.faces, 'd6', 0);
    expect(a.calls.rolled).toHaveLength(0);
    expect(d.view.history).toEqual([`Free D6: ${s.faces[0]}`]);
  });
  it('picking other dice while aimed at a job switches to a free roll and keeps the job', () => {
    const d = fresh();
    d.put(req('atk', { dice: '2d6', standing: true }));
    d.choose('d6');
    expect(d.view.target).toBeNull();
    expect(d.view.kind).toBe('d6');
    expect(d.view.jobs.map((j) => j.id)).toEqual(['atk']);
    d.aimAt('atk');
    expect(d.view.target?.id).toBe('atk');
    d.choose('2d6');
    expect(d.view.target?.id).toBe('atk');
  });
  it('free roll highlights matching watchers only', () => {
    const d = fresh();
    const w6 = watcher('w6', { dice: 'd6' });
    const w66 = watcher('w66', { dice: 'd66' });
    const r = req('r', { dice: 'd6' });
    d.put(w6);
    d.put(w66);
    d.put(r);
    d.clearTarget();
    d.choose('d6');
    d.settle(null, [4], 'd6', 0);
    expect(w6.calls.rolled).toEqual([[[4], 0]]);
    expect(w66.calls.rolled).toHaveLength(0);
    expect(r.calls.rolled).toHaveLength(0);
  });
  it('own request roll does not reach other watchers', () => {
    const d = fresh();
    const w = watcher('w');
    const r = req('r');
    d.put(w);
    d.put(r);
    d.settle('r', [3], 'd6', 0);
    expect(r.calls.rolled).toHaveLength(1);
    expect(w.calls.rolled).toHaveLength(0);
  });
  it('one-shot job is removed after it settles', () => {
    const d = fresh();
    const a = req('a', { oneShot: true });
    d.ask(a);
    expect(d.view.rollSeq).toBe(1);
    d.settle('a', [2], 'd6', 0);
    expect(a.calls.rolled).toHaveLength(1);
    expect(d.view.jobs).toHaveLength(0);
    expect(d.view.target).toBeNull();
  });
  it('one-shot job stays when its enter returns an error', () => {
    const d = fresh();
    const a = req('a', { oneShot: true, enter: () => 'Bad' });
    d.ask(a);
    expect(d.settleTyped(['9'])).toBe('Bad');
    expect(d.view.jobs.map((j) => j.id)).toEqual(['a']);
    expect(d.view.history).toEqual([]);
  });
  it('one-shot job is removed after a good typed roll', () => {
    const d = fresh();
    const a = req('a', { oneShot: true });
    d.ask(a);
    expect(d.settleTyped(['3'])).toBeNull();
    expect(d.view.jobs).toHaveLength(0);
    expect(d.view.history).toEqual(['a: 3']);
  });
});

describe('rolling', () => {
  it('facesFor returns null when the job refuses', () => {
    const d = fresh();
    d.put(req('a', { roll: () => [] }));
    expect(d.facesFor(seq(0.5))).toBeNull();
    d.put(req('a', { roll: () => null }));
    expect(d.facesFor(seq(0.5))).toBeNull();
  });
  it('facesFor uses the job roll when it has one', () => {
    const d = fresh();
    d.put(req('a', { roll: () => [6] }));
    expect(d.facesFor(seq(0))).toEqual({ jobId: 'a', faces: [6] });
  });
  it('facesFor uses rollDice without a job roll', () => {
    const d = fresh();
    d.choose('d66');
    const s = d.facesFor(seq(0, 0.99))!;
    expect(s.jobId).toBeNull();
    expect(s.faces).toEqual([1, 6]);
  });
});

describe('modifier', () => {
  it('modifier is null for D66', () => {
    const d = fresh();
    d.choose('d66');
    d.setModifier(2);
    expect(d.view.modifier).toBe(0);
    d.rollFree('d66', 3);
    expect(d.view.modifier).toBe(0);
    expect(forLine(null, 'd66', 0)).toBe('Free roll');
  });
  it('modifier follows the target and survives re-puts', () => {
    const d = fresh();
    d.put(req('r', { modifier: -1 }));
    expect(d.view.modifier).toBe(-1);
    d.setModifier(2);
    d.put(req('r', { modifier: -1 }));
    expect(d.view.modifier).toBe(2);
    d.remove('r');
    d.put(req('s', { modifier: null }));
    expect(d.view.modifier).toBe(0);
    d.setModifier(3);
    expect(d.view.modifier).toBe(0);
  });
  it('removing the only target leaves a free roll with no modifier', () => {
    const d = fresh();
    d.put(req('r', { dice: '2d6', modifier: -1 }));
    expect(d.view.modifier).toBe(-1);
    d.remove('r');
    expect(d.view.target).toBeNull();
    expect(d.view.modifier).toBe(0);
  });
  it('changed dice on a re-put reset kind and modifier', () => {
    const d = fresh();
    d.put(req('r', { modifier: -1 }));
    d.setModifier(2);
    d.put(req('r', { dice: '2d6', modifier: 1 }));
    expect(d.view.kind).toBe('2d6');
    expect(d.view.modifier).toBe(1);
  });
  it('a non-editable modifier is ignored', () => {
    const d = fresh();
    d.put(req('r', { modifier: 1, modifierEditable: false }));
    d.setModifier(5);
    expect(d.view.modifier).toBe(1);
  });
  it("choose keeps a target's own dice and modifier, and resets the modifier otherwise", () => {
    const d = fresh();
    d.put(req('r', { dice: '2d6', modifier: 1 }));
    d.choose('2d6');
    expect(d.view.target?.id).toBe('r');
    expect(d.view.modifier).toBe(1);
    d.clearTarget();
    d.setModifier(2);
    d.choose('d3');
    expect(d.view.kind).toBe('d3');
    expect(d.view.modifier).toBe(0);
  });
});

describe('typed rolls', () => {
  it('typed free roll rejects out-of-range', () => {
    const d = fresh();
    expect(d.settleTyped(['7'])).toBe('Type a number from 1 to 6.');
    expect(d.view.history).toEqual([]);
    expect(d.settleTyped(['4'])).toBeNull();
    expect(d.view.history).toEqual(['Free D6: 4']);
    d.choose('2d6');
    expect(d.settleTyped(['4', 'x'])).toBe('Type a number from 1 to 6 on each die.');
    expect(d.settleTyped(['4', '5'])).toBeNull();
    expect(d.view.history[0]).toBe('Free 2D6: 4 + 5 = 9');
    d.choose('d66');
    expect(d.settleTyped(['', '2'])).toBe('Type a number from 1 to 6 on each die.');
  });
  it('typed roll on a job calls its enter with the strings and modifier', () => {
    const d = fresh();
    const a = req('a', { modifier: -1 });
    d.put(a);
    expect(d.settleTyped(['5'])).toBeNull();
    expect(a.calls.enter).toEqual([[['5'], -1]]);
    expect(a.calls.rolled).toHaveLength(0);
  });
});

describe('history', () => {
  it('history lines', () => {
    expect(historyLine(req('XX1 Practice Crate', { modifier: -1 }), 'd6', [4], -1)).toBe('XX1 Practice Crate −1: 4 − 1 = 3');
    expect(historyLine(null, '2d6', [4, 5], 0)).toBe('Free 2D6: 4 + 5 = 9');
    expect(forLine(req('XX1 Practice Crate', { modifier: -1 }), 'd6', -1)).toBe('XX1 Practice Crate · D6 −1');
    expect(forLine(req('Room size', { dice: 'd66' }), 'd66', 0)).toBe('Room size · D66');
    const d = fresh();
    for (let i = 1; i <= 7; i++) d.settle(null, [((i - 1) % 6) + 1], 'd6', 0);
    expect(d.view.history).toHaveLength(5);
    expect(d.view.history[0]).toBe('Free D6: 1');
  });
  it('noteShift amends the newest line for that job only', () => {
    const d = fresh();
    d.put(req('atk', { label: 'Your attack', dice: '2d6' }));
    d.settle('atk', [2, 5], '2d6', 0);
    expect(d.view.history[0]).toBe('Your attack: 2 + 5 = 7');
    d.noteShift('other', [1, 1]);
    expect(d.view.history[0]).toBe('Your attack: 2 + 5 = 7');
    d.noteShift('atk', [3, 5]);
    expect(d.view.history[0]).toBe('Your attack: 2 + 5 = 7 (shifted to 3, 5)');
    d.noteShift('atk', [4, 5]);
    expect(d.view.history[0]).toBe('Your attack: 2 + 5 = 7 (shifted to 4, 5)');
  });
});

describe('store and prefs', () => {
  it('subscribe emits now and on every change', () => {
    const d = fresh();
    const seen: boolean[] = [];
    const off = d.subscribe((v) => seen.push(v.open));
    d.setOpen(true);
    d.setOpen(false);
    off();
    d.setOpen(true);
    expect(seen).toEqual([false, true, false]);
  });
  it('prefs reflect open, die and enter', () => {
    const d = new DiceDesk({ open: true, dice: '2d6', enter: true });
    expect(d.view).toMatchObject({ open: true, kind: '2d6', enterMode: true });
    d.choose('d3');
    expect(d.prefs()).toEqual({ open: true, dice: 'd3', enter: true });
  });
});

describe('standing requests (the attack dice stay registered all turn)', () => {
  it('another request takes over from a standing target', () => {
    const d = fresh();
    d.put(req('attack', { standing: true, dice: '2d6' }));
    expect(d.view.target?.id).toBe('attack');
    d.put(req('size'));
    expect(d.view.target?.id).toBe('size');
  });
  it('a standing request does not take over from another request', () => {
    const d = fresh();
    d.put(req('size'));
    d.put(req('attack', { standing: true }));
    expect(d.view.target?.id).toBe('size');
  });
  it('falls back to a plain request before a standing one, even when the standing one is newer', () => {
    const d = fresh();
    d.put(req('a'));
    d.put(req('b'));
    d.put(req('attack', { standing: true }));
    d.rollNow('a');
    d.remove('a');
    expect(d.view.target?.id).toBe('b');
    d.remove('b');
    expect(d.view.target?.id).toBe('attack');
  });
});

describe('final review fixes', () => {
  it('aimAt re-targets a standing job after a free roll, without rolling or focusing', () => {
    const d = fresh();
    d.put(req('atk', { standing: true, dice: '2d6', shift: { pool: 2, unknownShift: false, state: null, onchange: () => {} } }));
    expect(d.view.target?.id).toBe('atk');
    d.rollFree('d6');
    expect(d.view.target).toBeNull();
    const { rollSeq, focusSeq } = d.view;
    d.setOpen(false);
    d.aimAt('atk');
    expect(d.view.target?.id).toBe('atk');
    expect(d.view.kind).toBe('2d6');
    expect(d.view.open).toBe(true);
    expect(d.view.rollSeq).toBe(rollSeq);
    expect(d.view.focusSeq).toBe(focusSeq);
    d.aimAt('missing');
    expect(d.view.target?.id).toBe('atk');
  });
  it('a typed value that is not 1-6 still reaches enter but is not recorded and is refused', () => {
    const d = fresh();
    const a = req('a', { oneShot: true });
    d.ask(a);
    expect(d.settleTyped(['9'])).toBe('Type a number from 1 to 6.');
    expect(a.calls.enter).toEqual([[['9'], 0]]);
    expect(d.view.history).toEqual([]);
    expect(d.view.jobs.map((j) => j.id)).toEqual(['a']);
  });
  it('a wrong count of typed dice is refused with the per-die message', () => {
    const d = fresh();
    d.put(req('s', { dice: 'd66' }));
    expect(d.settleTyped(['3', ''])).toBe('Type a number from 1 to 6 on each die.');
    expect(d.view.history).toEqual([]);
  });
  it("the asker's own error text wins over the standard one", () => {
    const d = fresh();
    d.put(req('a', { enter: () => 'Enter a whole number from 1 to 6' }));
    expect(d.settleTyped(['9'])).toBe('Enter a whole number from 1 to 6');
  });
  it('settle uses the die and modifier captured at roll start', () => {
    const d = fresh();
    const r = req('r', { dice: 'd6', modifier: -1 });
    d.put(r);
    d.setModifier(-1);
    const w = watcher('w', { dice: 'd6' });
    d.put(w);
    d.settle('r', [4], 'd6', -1);
    d.clearTarget();
    d.choose('2d6');
    expect(d.view.history[0]).toBe('r −1: 4 − 1 = 3');
    expect(r.calls.rolled).toEqual([[[4], -1]]);
    d.settle(null, [4], 'd6', 0);
    expect(w.calls.rolled).toEqual([[[4], 0]]);
    expect(d.view.history[0]).toBe('Free D6: 4');
  });
});

describe('idle jobs (a table that already shows a result)', () => {
  it('is not aimed at when put, and free rolls do not reach it', () => {
    const d = fresh();
    const w = watcher('w', { idle: true });
    d.put(w);
    expect(d.view.target).toBeNull();
    d.settle(null, [4], 'd6', 0);
    expect(w.calls.rolled).toHaveLength(0);
  });
  it('turning idle while aimed at lets go of the roller', () => {
    const d = fresh();
    d.put(watcher('w'));
    expect(d.view.target?.id).toBe('w');
    d.put(watcher('w', { idle: true }));
    expect(d.view.target).toBeNull();
  });
  it('is skipped when the roller falls back', () => {
    const d = fresh();
    d.put(watcher('w', { idle: true }));
    d.put(req('amount', { oneShot: true }));
    d.settle('amount', [3], 'd6', 0);
    expect(d.view.target).toBeNull();
  });
  it('its own Roll button still rolls it', () => {
    const d = fresh();
    const w = watcher('w', { idle: true });
    d.put(w);
    d.rollNow('w');
    expect(d.view.target?.id).toBe('w');
    d.settle('w', [5], 'd6', 0);
    expect(w.calls.rolled).toEqual([[[5], 0]]);
  });
});

describe('idle jobs let go after their own roll', () => {
  it('rolled', () => {
    const d = fresh();
    d.put(watcher('w', { idle: true }));
    d.rollNow('w');
    d.settle('w', [5], 'd6', 0);
    expect(d.view.target).toBeNull();
  });
  it('typed', () => {
    const d = fresh();
    d.put(watcher('w', { idle: true }));
    d.rollNow('w');
    expect(d.settleTyped(['5'])).toBeNull();
    expect(d.view.target).toBeNull();
  });
});
