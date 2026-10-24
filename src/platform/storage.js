// Save = localStorage (instant, this device) + Telegram CloudStorage (shared between devices).
// On load the newer of the two wins.
import { cloudGet, cloudSet } from './telegram.js';
import { normalize, newest } from '../game/state.js';

const KEY = 'kotik-ludik-v1';
let cloudTimer = null;
let pending = null;

const parse = (text) => {
  try { return text ? JSON.parse(text) : null; } catch { return null; }
};

export async function loadState() {
  let local = null;
  try { local = parse(localStorage.getItem(KEY)); } catch { /* storage blocked: play without saving */ }
  const cloud = parse(await cloudGet(KEY));
  return normalize(newest(local, cloud));
}

// Returns false when the local write failed, so the UI can warn the player.
export function saveState(state) {
  state.savedAt = Date.now();
  const text = JSON.stringify(state);
  if (text.length > 4096) console.warn('Save is over the CloudStorage 4096-char limit; split it into several keys.');
  pending = text;
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(flushCloud, 1500); // batch rapid spins into one cloud write
  try {
    localStorage.setItem(KEY, text);
    return true;
  } catch {
    return false;
  }
}

export function flushCloud() {
  clearTimeout(cloudTimer);
  if (pending) cloudSet(KEY, pending);
  pending = null;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushCloud();
});
