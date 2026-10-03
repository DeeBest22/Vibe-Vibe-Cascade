/**
 * Tiny synthesized sound-effects engine for Sugar Rush.
 * Uses the Web Audio API to generate sounds on the fly — no audio
 * files to load, and it stays crisp at any volume.
 *
 * Place this file at: src/lib/sfx.ts
 */

type Wave = OscillatorType;

let ctx: AudioContext | null = null;
let muted = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(
  freq: number,
  opts: { start?: number; duration?: number; type?: Wave; gain?: number; glideTo?: number } = {},
) {
  const c = getCtx();
  if (!c || muted) return;
  const { start = 0, duration = 0.14, type = "sine", gain = 0.16, glideTo } = opts;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + duration);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.03);
}

function noiseBurst(opts: { start?: number; duration?: number; gain?: number; filterFreq?: number } = {}) {
  const c = getCtx();
  if (!c || muted) return;
  const { start = 0, duration = 0.22, gain = 0.2, filterFreq = 1000 } = opts;
  const t0 = c.currentTime + start;
  const buffer = c.createBuffer(1, Math.max(1, c.sampleRate * duration), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buffer;
  const filt = c.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.value = filterFreq;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  src.connect(filt).connect(g).connect(c.destination);
  src.start(t0);
  src.stop(t0 + duration + 0.03);
}

// A bright pentatonic run — matches rise in pitch to combo/chain length.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 987.77, 1174.66];

export const sfx = {
  /** Call once on the first user gesture (e.g. the Play button) to unlock audio. */
  init() {
    getCtx();
  },
  setMuted(v: boolean) {
    muted = v;
  },
  isMuted() {
    return muted;
  },

  /** Selecting a candy. */
  select() {
    tone(760, { duration: 0.05, type: "triangle", gain: 0.1 });
  },
  /** A valid swap begins. */
  swap() {
    tone(340, { duration: 0.09, type: "sine", gain: 0.14, glideTo: 480 });
  },
  /** Swap rejected — candies nudge back. */
  invalid() {
    tone(190, { duration: 0.1, type: "square", gain: 0.09 });
    tone(150, { start: 0.06, duration: 0.12, type: "square", gain: 0.08 });
  },
  /** A group of candies pops. Pitch rises with chain length. */
  pop(chain: number) {
    const note = SCALE[Math.min(chain - 1, SCALE.length - 1)];
    tone(note, { duration: 0.16, type: "sine", gain: 0.2, glideTo: note * 1.4 });
    tone(note * 2, { duration: 0.1, type: "triangle", gain: 0.08 });
  },
  /** A striped/wrapped/color-bomb candy is created. */
  special() {
    [0, 0.06, 0.12].forEach((t, i) => tone(680 + i * 210, { start: t, duration: 0.13, type: "triangle", gain: 0.13 }));
  },
  /** Special-candy explosion / color bomb blast. */
  blast() {
    tone(95, { duration: 0.32, type: "sawtooth", gain: 0.2, glideTo: 40 });
    noiseBurst({ duration: 0.3, gain: 0.22, filterFreq: 850 });
  },
  /** Multi-step cascade combo announcement. */
  combo(chain: number) {
    const base = 520 + chain * 36;
    [0, 0.07].forEach((t, i) => tone(base + i * 170, { start: t, duration: 0.14, type: "triangle", gain: 0.16 }));
  },
  /** Board reshuffle. */
  shuffle() {
    for (let i = 0; i < 5; i++) tone(300 + i * 55, { start: i * 0.035, duration: 0.07, type: "sine", gain: 0.1 });
  },
  /** Generic UI click (restart, home, mute). */
  click() {
    tone(520, { duration: 0.05, type: "sine", gain: 0.12 });
  },
  /** Game start fanfare. */
  start() {
    [0, 0.08, 0.16].forEach((t, i) => tone(440 * 2 ** ((i * 4) / 12), { start: t, duration: 0.15, type: "triangle", gain: 0.15 }));
  },
};
