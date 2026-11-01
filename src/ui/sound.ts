// Synthesised dice sounds (Web Audio, no samples). Everything is optional and fails silently.

export const SOUND_KEY = '2d6.soundEnabled';

let enabled: boolean | null = null;
let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;

export function isSoundEnabled(): boolean {
  if (enabled === null) {
    try {
      enabled = localStorage.getItem(SOUND_KEY) !== '0';
    } catch {
      enabled = true;
    }
  }
  return enabled;
}

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(SOUND_KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable: keep it for this session only */
  }
}

/** Test hook: forget cached state. */
export function resetSoundForTests(): void {
  enabled = null;
  ctx = null;
  noise = null;
}

/** Create or resume the shared context. Call from inside a tap handler (iOS needs a gesture). */
export function unlockAudio(): void {
  if (!isSoundEnabled()) return;
  try {
    if (!ctx) {
      const Ctor: typeof AudioContext | undefined = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
  } catch {
    ctx = null;
  }
}

function burst(freq: number, q: number, gain: number, dur: number): void {
  if (!ctx || !isSoundEnabled()) return;
  try {
    if (!noise) {
      noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.1), ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(ctx.destination);
    src.start(t);
    src.stop(t + dur + 0.01);
  } catch {
    /* ignore */
  }
}

/** A quiet rattle tick, one per face change. */
export function playTick(): void {
  burst(2200 + Math.random() * 2200, 4, 0.12 + Math.random() * 0.06, 0.03);
}

/** A louder, lower clack when a die lands. */
export function playClack(): void {
  burst(900 + Math.random() * 300, 2.5, 0.5, 0.09);
}
