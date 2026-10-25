// Synth sounds ported from old-version (Web Audio, no files to download).
let ctx = null;
let master = null;
let spinVoice = null;
const settings = { sound: true, volume: 0.7 };

export function configureAudio({ sound, volume }) {
  settings.sound = sound;
  settings.volume = volume;
  if (master) master.gain.setTargetAtTime(sound ? volume : 0, ctx.currentTime, 0.02);
}

export const audioGraph = () => (ctx ? { ctx, master } : null);

// Browsers only allow audio after a user gesture, so call this from click handlers.
export function unlockAudio() {
  if (!settings.sound) return;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = settings.volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  } catch {
    ctx = null;
  }
}

function tone(freq, { at = 0, duration = 0.14, type = 'sine', peak = 0.08, endFreq, sustain = false } = {}) {
  if (!ctx || !settings.sound) return null;
  const start = ctx.currentTime + 0.01 + at;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (endFreq) osc.frequency.linearRampToValueAtTime(endFreq, start + duration);
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(peak, start + Math.min(0.025, duration / 4));
  if (sustain) env.gain.setTargetAtTime(0.0001, start + duration * 0.86, 0.025);
  else env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(env).connect(master);
  osc.start(start);
  osc.stop(start + duration + 0.03);
  return { osc, env };
}

const seq = (freqs, opts = {}) =>
  freqs.forEach((f, i) => tone(f, { ...opts, at: (opts.at || 0) + i * (opts.interval || 0.14) }));

// Low, soft voice through a filter: the base for purr and meow.
function voice({ at = 0, duration, type = 'sawtooth', freq, filter, peak, attack = 0.05, release = 0.25 }) {
  if (!ctx || !settings.sound) return null;
  const t = ctx.currentTime + 0.01 + at;
  const osc = ctx.createOscillator();
  const lp = ctx.createBiquadFilter();
  const env = ctx.createGain();
  osc.type = type;
  freq.forEach(([f, dt], i) => (i ? osc.frequency.linearRampToValueAtTime(f, t + dt) : osc.frequency.setValueAtTime(f, t)));
  lp.type = 'lowpass';
  filter.forEach(([f, dt], i) => (i ? lp.frequency.linearRampToValueAtTime(f, t + dt) : lp.frequency.setValueAtTime(f, t)));
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(peak, t + attack);
  env.gain.setValueAtTime(peak, t + duration - release);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(lp).connect(env).connect(master);
  osc.start(t);
  osc.stop(t + duration + 0.02);
  return { osc, env, t };
}

let purrUntil = 0;

export const sfx = {
  click: () => seq([880], { duration: 0.055, type: 'square', peak: 0.04 }),
  // Soft wooden ticks that slow down, instead of the old buzzing hum.
  spinStart(duration) {
    spinVoice = [];
    for (let at = 0.08, gap = 0.055; at < duration; at += gap, gap = Math.min(0.13, gap * 1.035)) {
      spinVoice.push(tone(1150 - at * 120, { at, duration: 0.028, type: 'triangle', peak: 0.022 }));
    }
  },
  spinStop() {
    if (!spinVoice || !ctx) return;
    for (const v of spinVoice) {
      try { v?.osc.stop(ctx.currentTime); } catch { /* already finished */ }
    }
    spinVoice = null;
  },
  reelStop: (index) => seq([690 + index * 105], { duration: 0.065, type: 'triangle', peak: 0.06 }),
  outcome(kind) {
    if (kind === 'none') seq([247, 196], { duration: 0.12, interval: 0.15, peak: 0.06 });
    else if (kind === 'pair') seq([523, 659], { duration: 0.11, type: 'triangle', peak: 0.07 });
    else if (kind === 'crystal' || kind === 'paw') seq([392, 523, 698, 1047, 1397], { duration: 0.11, interval: 0.13, peak: 0.09 });
    else seq([659, 831, 988, 1319], { duration: 0.11, interval: 0.13, type: 'triangle', peak: 0.09 });
  },
  // Purr: a low rasp pulsing ~24 times a second. Filter kept fairly open so phone speakers still play it.
  purr() {
    if (!ctx || !settings.sound || ctx.currentTime < purrUntil) return; // one purr at a time when petting fast
    const t = ctx.currentTime + 0.01;
    const duration = 1.3;
    purrUntil = t + 1.1;
    const osc = ctx.createOscillator();
    const am = ctx.createGain(); // amplitude pulsing = the "rrrr"
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    const env = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(54, t);
    osc.frequency.linearRampToValueAtTime(50, t + duration);
    lfo.frequency.value = 24;
    am.gain.value = 0.5;
    depth.gain.value = 0.5;
    lp.frequency.value = 750;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(0.09, t + 0.15);
    env.gain.setValueAtTime(0.09, t + duration - 0.35);
    env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    lfo.connect(depth).connect(am.gain);
    osc.connect(am).connect(lp).connect(env).connect(master);
    for (const node of [osc, lfo]) { node.start(t); node.stop(t + duration + 0.02); }
  },
  // Cartoon meow: pitch rises then falls while the filter opens ("m-ia-u").
  meow(happy = false) {
    const up = happy ? 1.15 : 1;
    voice({
      duration: 0.62,
      freq: [[430 * up, 0], [720 * up, 0.14], [800 * up, 0.3], [470 * up, 0.62]],
      filter: [[450, 0], [2600, 0.16], [1900, 0.4], [700, 0.62]],
      peak: 0.11,
      attack: 0.06,
      release: 0.22,
    });
  },
  lick: () => tone(520, { duration: 0.07, endFreq: 260, type: 'sine', peak: 0.05 }),
  hop: () => tone(330, { duration: 0.14, endFreq: 760, type: 'sine', peak: 0.04 }),
  catch: () => seq([988, 1319], { duration: 0.07, interval: 0.07, type: 'triangle', peak: 0.06 }),
  buy: () => seq([784, 988, 1175], { duration: 0.14, interval: 0.17, peak: 0.065 }),
  denied: () => seq([220], { duration: 0.12, type: 'square', peak: 0.03 }),
};
