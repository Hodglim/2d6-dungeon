// The animated dice roll shared by the dice entry forms and the dice roller: faces flicker with a
// rattle, each die lands with a clack (staggered), then a short hold. Reduced motion: final faces at once.
import { playClack, playTick } from './sound';

const CYCLE_MS = 80;
const SPIN_MS = 900;
const STAGGER_MS = 120;
const HOLD_MS = 400;
const REDUCED_MS = 300;

export interface RollAnimationHooks {
  /** The faces to show now (a new array each time). */
  faces: (faces: number[]) => void;
  /** Die i has landed on its final face. */
  land: (i: number) => void;
  /** The animation has settled. */
  done: () => void;
}

/** Animate a roll that lands on `finals` (faces 1..sides). Returns a cancel function. */
export function animateRoll(finals: number[], sides: number, hooks: RollAnimationHooks): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  let ticker: ReturnType<typeof setInterval> | null = null;
  const cancel = () => {
    for (const t of timers) clearTimeout(t);
    timers.length = 0;
    if (ticker !== null) clearInterval(ticker);
    ticker = null;
  };
  const randomFace = (prev: number): number => {
    if (sides < 2) return 1;
    let f = prev;
    while (f === prev) f = Math.floor(Math.random() * sides) + 1;
    return f;
  };
  const done = () => {
    cancel();
    hooks.done();
  };
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) {
    hooks.faces([...finals]);
    finals.forEach((_, i) => hooks.land(i));
    playClack();
    timers.push(setTimeout(done, REDUCED_MS));
    return cancel;
  }
  const landed = finals.map(() => false);
  let faces = finals.map((f) => randomFace(f));
  hooks.faces([...faces]);
  ticker = setInterval(() => {
    faces = faces.map((f, i) => (landed[i] ? finals[i]! : randomFace(f)));
    hooks.faces([...faces]);
    playTick();
  }, CYCLE_MS);
  finals.forEach((f, i) => {
    timers.push(
      setTimeout(() => {
        landed[i] = true;
        playClack();
        faces[i] = f;
        hooks.faces([...faces]);
        hooks.land(i);
      }, SPIN_MS + i * STAGGER_MS),
    );
  });
  timers.push(setTimeout(done, SPIN_MS + (finals.length - 1) * STAGGER_MS + HOLD_MS));
  return cancel;
}
