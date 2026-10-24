// Background music composed in code: a light, cheerful music-box tune over a bouncy bass
// and soft ukulele-like chords. No audio files to download. Loop: 8 bars, played A A B
// (B = without the melody) so it does not get tiring.
import { audioGraph } from './audio.js';

const BPM = 100;
const STEP = 60 / BPM / 2; // eighth note
const _ = null;
// chord (MIDI), bass root, melody in eighths
const BARS = [
  { chord: [60, 64, 67], bass: 48, mel: [76, _, 79, _, 81, 79, 76, _] }, // C
  { chord: [57, 60, 64], bass: 45, mel: [72, _, 76, _, 74, 72, 69, _] }, // Am
  { chord: [57, 60, 65], bass: 41, mel: [69, 72, 77, _, 76, _, 72, _] }, // F
  { chord: [55, 59, 62], bass: 43, mel: [74, _, 79, _, 77, 76, 74, _] }, // G
  { chord: [60, 64, 67], bass: 48, mel: [76, 79, 84, _, 83, _, 79, _] }, // C
  { chord: [57, 60, 64], bass: 45, mel: [81, _, 79, 76, _, 72, 76, _] }, // Am
  { chord: [57, 62, 65], bass: 38, mel: [77, _, 76, 74, _, 77, 81, _] }, // Dm
  { chord: [55, 59, 62], bass: 43, mel: [79, _, _, _, 74, _, 71, _] }, // G -> back to C
];
const LOOP = BARS.length * 8;

let timer = null;
let out = null;
let noise = null;
let next = 0;
let step = 0;

const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

function voice(ctx, freq, t, dur, type, peak) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(peak, t + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function shaker(ctx, t) {
  if (!noise) {
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.05, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const env = ctx.createGain();
  src.buffer = noise;
  filter.type = 'highpass';
  filter.frequency.value = 6000;
  env.gain.setValueAtTime(0.012, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
  src.connect(filter).connect(env).connect(out);
  src.start(t);
}

function play(ctx, i, t) {
  const loop = Math.floor(step / LOOP) % 3;
  const bar = BARS[Math.floor(i / 8)];
  const beat = i % 8;
  if (beat === 0 || beat === 4) voice(ctx, hz(bar.bass), t, 0.32, 'triangle', 0.13);
  if (beat === 3 || beat === 6) voice(ctx, hz(bar.bass + 7), t, 0.18, 'triangle', 0.08);
  if (beat === 2 || beat === 6) bar.chord.forEach((n, k) => voice(ctx, hz(n), t + k * 0.012, 0.22, 'triangle', 0.028));
  if (beat % 2) shaker(ctx, t);
  const note = bar.mel[beat];
  if (note && loop < 2) {
    voice(ctx, hz(note), t, 0.5, 'sine', 0.06); // music box: tone + soft octave sparkle
    voice(ctx, hz(note + 12), t, 0.25, 'sine', 0.015);
  }
}

function schedule() {
  const { ctx } = audioGraph();
  while (next < ctx.currentTime + 0.15) {
    play(ctx, step % LOOP, next);
    next += STEP;
    step += 1;
  }
}

export function startMusic() {
  const graph = audioGraph();
  if (!graph || timer) return;
  if (!out) {
    out = graph.ctx.createGain();
    out.gain.value = 0.45;
    out.connect(graph.master);
  }
  next = graph.ctx.currentTime + 0.1;
  timer = setInterval(schedule, 40);
}

export function stopMusic() {
  clearInterval(timer);
  timer = null;
}
