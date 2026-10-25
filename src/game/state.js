// Player state and the rules that change it. Pure functions, no DOM, no storage.
import { ITEMS, BREEDS, TASKS, ACHIEVEMENTS, REQUESTS, COLOR_PRICE, itemById } from '../data/content.js';
import { dayKey, track } from './progress.js';

export { dayKey };

export const SAVE_VERSION = 1;
export const FISH_CAP = 30;
export const FISH_REGEN_MS = 3 * 60 * 1000;
export const PETS_PER_FISH = 10;
export const PET_FISH_PER_DAY = 10;
export const FEED_BOND = 5;

export function createState(now = Date.now()) {
  return {
    v: SAVE_VERSION,
    savedAt: 0,
    coins: 0,
    crystals: 0,
    fish: FISH_CAP,
    fishAt: now,
    bond: 0,
    pets: { day: dayKey(now), count: 0, fishGiven: 0 },
    owned: ITEMS.filter((item) => item.price === 0).map((item) => item.id),
    placed: { plant: 'plant-large', rug: 'rug' },
    target: 'cat-bed',
    breed: 'ginger',
    breeds: ['ginger'],
    stats: { spins: 0, pets: 0, games: 0, catches: 0, wins: 0, buys: 0, feeds: 0 },
    colors: {}, // itemId -> chosen colour id ('base' when missing)
    ownedColors: [], // 'itemId:colorId' bought extras
    daily: { day: '', counts: {}, tasks: [], claimed: [] },
    achievements: [],
    request: null,
    requestAt: now + 60 * 1000, // first request a minute after the very first launch
    giftDay: '',
    playLog: [],
    settings: { sound: true, volume: 0.7, music: true, motion: null }, // motion null = default (on)
  };
}

// Accepts anything read from storage; keeps only known fields with sane values.
export function normalize(raw, now = Date.now()) {
  const base = createState(now);
  if (!raw || typeof raw !== 'object' || raw.v !== SAVE_VERSION) return base;
  const num = (value, fallback) => (Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback);
  const state = { ...base };
  for (const key of ['savedAt', 'coins', 'crystals', 'fish', 'fishAt', 'bond']) state[key] = num(raw[key], base[key]);
  if (raw.pets && typeof raw.pets.day === 'string') {
    state.pets = { day: raw.pets.day, count: num(raw.pets.count, 0), fishGiven: num(raw.pets.fishGiven, 0) };
  }
  const known = new Set(ITEMS.map((item) => item.id));
  state.owned = [...new Set([...base.owned, ...(Array.isArray(raw.owned) ? raw.owned.filter((id) => known.has(id)) : [])])];
  state.placed = {};
  for (const [place, id] of Object.entries(raw.placed || {})) {
    if (state.owned.includes(id) && itemById(id).place === place) state.placed[place] = id;
  }
  state.target = known.has(raw.target) && !state.owned.includes(raw.target) ? raw.target : nextTarget(state);
  const breedIds = new Set(BREEDS.map((breed) => breed.id));
  state.breeds = [...new Set(['ginger', ...(Array.isArray(raw.breeds) ? raw.breeds.filter((id) => breedIds.has(id)) : [])])];
  state.breed = state.breeds.includes(raw.breed) ? raw.breed : 'ginger';
  state.stats = Object.fromEntries(Object.keys(base.stats).map((k) => [k, num(raw.stats?.[k], 0)]));
  const ids = (list, all) => (Array.isArray(list) ? [...new Set(list.filter((id) => all.some((x) => x.id === id)))] : []);
  if (typeof raw.daily?.day === 'string') {
    const counts = Object.fromEntries(Object.keys(base.stats).map((k) => [k, num(raw.daily.counts?.[k], 0)]));
    state.daily = { day: raw.daily.day, counts, tasks: ids(raw.daily.tasks, TASKS), claimed: ids(raw.daily.claimed, TASKS) };
  }
  state.achievements = ids(raw.achievements, ACHIEVEMENTS);
  const colorKeys = new Set(ITEMS.flatMap((i) => (i.colors || []).filter((c) => c.id !== 'base').map((c) => `${i.id}:${c.id}`)));
  state.ownedColors = Array.isArray(raw.ownedColors) ? [...new Set(raw.ownedColors.filter((k) => colorKeys.has(k)))] : [];
  state.colors = {};
  for (const [id, color] of Object.entries(raw.colors || {})) if (hasColor(state, id, color)) state.colors[id] = color;
  state.request = REQUESTS.some((r) => r.id === raw.request?.id) ? { id: raw.request.id, base: num(raw.request.base, 0) } : null;
  state.requestAt = num(raw.requestAt, base.requestAt);
  state.giftDay = typeof raw.giftDay === 'string' ? raw.giftDay : '';
  state.playLog = Array.isArray(raw.playLog) ? raw.playLog.filter((t) => Number.isFinite(t)).slice(-10) : [];
  state.settings = {
    sound: raw.settings?.sound !== false,
    volume: Number.isFinite(raw.settings?.volume) ? Math.min(1, Math.max(0, raw.settings.volume)) : base.settings.volume,
    music: raw.settings?.music !== false,
    motion: typeof raw.settings?.motion === 'boolean' ? raw.settings.motion : null,
  };
  return state;
}

// Fish refill over time, also while the game is closed. Rewards may push fish above the cap; refill never does.
export function regenFish(state, now = Date.now()) {
  if (state.fish >= FISH_CAP || now < state.fishAt) {
    state.fishAt = now;
    return;
  }
  const gained = Math.floor((now - state.fishAt) / FISH_REGEN_MS);
  if (gained <= 0) return;
  state.fish = Math.min(FISH_CAP, state.fish + gained);
  state.fishAt = state.fish >= FISH_CAP ? now : state.fishAt + gained * FISH_REGEN_MS;
}

export const msToNextFish = (state, now = Date.now()) =>
  state.fish >= FISH_CAP ? 0 : Math.max(0, state.fishAt + FISH_REGEN_MS - now);

// Pays for the spin and credits the result at once, before any animation:
// closing the app mid-spin can no longer lose a win (old version bug).
export function applySpin(state, result, now = Date.now()) {
  regenFish(state, now);
  if (state.fish < 1) return false;
  if (state.fish >= FISH_CAP) state.fishAt = now;
  state.fish -= 1;
  state.coins += result.reward.coins || 0;
  state.fish += result.reward.fish || 0;
  state.crystals += result.reward.crystals || 0;
  track(state, 'spins', 1, now);
  if (result.kind && result.kind !== 'none') track(state, 'wins', 1, now);
  return true;
}

// Returns true when this pet earned a fish.
export function pet(state, now = Date.now()) {
  const day = dayKey(now);
  if (state.pets.day !== day) state.pets = { day, count: 0, fishGiven: 0 };
  state.pets.count += 1;
  state.bond += 1;
  track(state, 'pets', 1, now);
  if (state.pets.count % PETS_PER_FISH === 0 && state.pets.fishGiven < PET_FISH_PER_DAY) {
    state.pets.fishGiven += 1;
    state.fish += 1;
    return true;
  }
  return false;
}

export function buyItem(state, id, now = Date.now()) {
  const item = itemById(id);
  if (!item || state.owned.includes(id) || state.coins < item.price) return false;
  state.coins -= item.price;
  state.owned.push(id);
  state.placed[item.place] = id;
  track(state, 'buys', 1, now);
  if (state.target === id) state.target = nextTarget(state);
  return true;
}

export function placeItem(state, id) {
  const item = itemById(id);
  if (!item || !state.owned.includes(id)) return false;
  state.placed[item.place] = id;
  return true;
}

// Cheapest item not owned yet: a sensible default goal after a purchase.
export const nextTarget = (state) =>
  ITEMS.filter((item) => !state.owned.includes(item.id)).sort((a, b) => a.price - b.price)[0]?.id ?? null;

export function buyBreed(state, id) {
  const breed = BREEDS.find((b) => b.id === id);
  if (!breed || state.breeds.includes(id) || state.crystals < breed.price) return false;
  state.crystals -= breed.price;
  state.breeds.push(id);
  state.breed = id;
  return true;
}

// Picks the newer of two saves (local vs Telegram cloud).
export const newest = (a, b) => ((b?.savedAt || 0) > (a?.savedAt || 0) ? b : a);

// ---------- colours ----------
export const hasColor = (state, itemId, colorId) =>
  Boolean(itemById(itemId)?.colors?.some((c) => c.id === colorId)) && (colorId === 'base' || state.ownedColors.includes(`${itemId}:${colorId}`));

// Image of an item in its chosen colour.
export function itemImg(state, item) {
  const color = item.colors?.find((c) => c.id === state.colors[item.id]);
  return color ? color.img : item.img;
}

// Buys a colour if needed (item must be owned), then puts it on.
export function chooseColor(state, itemId, colorId) {
  if (!state.owned.includes(itemId) || !itemById(itemId)?.colors?.some((c) => c.id === colorId)) return false;
  if (!hasColor(state, itemId, colorId)) {
    if (state.coins < COLOR_PRICE) return false;
    state.coins -= COLOR_PRICE;
    state.ownedColors.push(`${itemId}:${colorId}`);
  }
  state.colors[itemId] = colorId;
  return true;
}

// ---------- feeding: one fish from the stock goes into the bowl ----------
export function feed(state, now = Date.now()) {
  regenFish(state, now);
  if (!state.placed.bowl || state.fish < 1) return false;
  if (state.fish >= FISH_CAP) state.fishAt = now;
  state.fish -= 1;
  state.bond += FEED_BOND;
  track(state, 'feeds', 1, now);
  return true;
}
