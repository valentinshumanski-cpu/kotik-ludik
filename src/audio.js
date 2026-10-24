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

export const sfx = {
  click: () => seq([880], { duration: 0.055, type: 'square', peak: 0.04 }),
  spinStart(duration) {
    spinVoice = tone(112, { at: 0.1, duration, endFreq: 238, type: 'sawtooth', peak: 0.022, sustain: true });
  },
  spinStop() {
    if (!spinVoice || !ctx) return;
    spinVoice.env.gain.cancelScheduledValues(ctx.currentTime);
    spinVoice.env.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.012);
    spinVoice = null;
  },
  reelStop: (index) => seq([690 + index * 105], { duration: 0.065, type: 'triangle', peak: 0.06 }),
  outcome(kind) {
    if (kind === 'none') seq([247, 196], { duration: 0.12, interval: 0.15, peak: 0.06 });
    else if (kind === 'pair') seq([523, 659], { duration: 0.11, type: 'triangle', peak: 0.07 });
    else if (kind === 'crystal' || kind === 'paw') seq([392, 523, 698, 1047, 1397], { duration: 0.11, interval: 0.13, peak: 0.09 });
    else seq([659, 831, 988, 1319], { duration: 0.11, interval: 0.13, type: 'triangle', peak: 0.09 });
  },
  purr: () => seq([92, 98, 92], { duration: 0.16, interval: 0.17, type: 'triangle', peak: 0.05 }),
  catch: () => seq([988, 1319], { duration: 0.07, interval: 0.07, type: 'triangle', peak: 0.06 }),
  buy: () => seq([784, 988, 1175], { duration: 0.14, interval: 0.17, peak: 0.065 }),
  denied: () => seq([220], { duration: 0.12, type: 'square', peak: 0.03 }),
};
