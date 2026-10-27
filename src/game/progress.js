// Daily tasks, achievements, Alex's requests, daily gift and mini-game rewards. Pure, no DOM.
import { ITEMS, TASKS, ACHIEVEMENTS, REQUESTS, GUESTS } from '../data/content.js';

export const GIFT_FISH = 10;
export const REQUEST_REWARD = { fish: 2 };
export const REQUEST_BOND = 5;
export const REQUEST_PAUSE_MS = 4 * 60 * 1000;
export const GAME_REWARDS_PER_HOUR = 3;
export const COINS_PER_CATCH = 2;
export const MAX_GAME_COINS = 40;
const HOUR = 60 * 60 * 1000;

export const dayKey = (now) => new Date(now).toLocaleDateString('sv'); // local YYYY-MM-DD

const hash = (text) => [...text].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

// Same 3 tasks all day on every device: the pick depends only on the date.
export function pickTasks(day, state) {
  return TASKS.filter((t) => (t.event !== 'buys' || state.owned.length < ITEMS.length) && (!t.needs || state.placed[t.needs]))
    .sort((a, b) => hash(day + a.id) - hash(day + b.id))
    .slice(0, 3)
    .map((t) => t.id);
}

export function rollDay(state, now = Date.now()) {
  const day = dayKey(now);
  if (state.daily.day !== day) state.daily = { day, counts: {}, tasks: pickTasks(day, state), claimed: [] };
}

// The single place where activity is counted: lifetime stats and today's counters.
export function track(state, event, n = 1, now = Date.now()) {
  rollDay(state, now);
  state.stats[event] = (state.stats[event] || 0) + n;
  state.daily.counts[event] = (state.daily.counts[event] || 0) + n;
}

export function give(state, reward) {
  for (const key of ['coins', 'fish', 'crystals']) state[key] += reward[key] || 0;
}

export const taskProgress = (state, task) => Math.min(task.target, state.daily.counts[task.event] || 0);
export const todaysTasks = (state, now = Date.now()) => {
  rollDay(state, now);
  return state.daily.tasks.map((id) => TASKS.find((t) => t.id === id));
};

export function claimTask(state, id, now = Date.now()) {
  rollDay(state, now);
  const task = TASKS.find((t) => t.id === id);
  if (!task || !state.daily.tasks.includes(id) || state.daily.claimed.includes(id) || taskProgress(state, task) < task.target) return false;
  state.daily.claimed.push(id);
  give(state, task.reward);
  return true;
}

export const achievementProgress = (state, a) => Math.min(a.target, a.value(state));

export function claimAchievement(state, id) {
  const a = ACHIEVEMENTS.find((x) => x.id === id);
  if (!a || state.achievements.includes(id) || achievementProgress(state, a) < a.target) return false;
  state.achievements.push(id);
  give(state, a.reward);
  return true;
}

// For the red dot on the "Задания" tab.
export const claimableCount = (state, now = Date.now()) =>
  todaysTasks(state, now).filter((t) => !state.daily.claimed.includes(t.id) && taskProgress(state, t) >= t.target).length +
  ACHIEVEMENTS.filter((a) => !state.achievements.includes(a.id) && achievementProgress(state, a) >= a.target).length;

export function claimDailyGift(state, now = Date.now()) {
  const day = dayKey(now);
  if (state.giftDay === day) return false;
  state.giftDay = day;
  state.fish += GIFT_FISH;
  return true;
}

export const currentRequest = (state) => (state.request ? REQUESTS.find((r) => r.id === state.request.id) : null);

export function maybeRequest(state, now = Date.now(), random = Math.random) {
  if (state.request || now < state.requestAt) return null;
  const doable = REQUESTS.filter((x) => !x.needs || state.placed[x.needs]);
  const r = doable[Math.floor(random() * doable.length)];
  state.request = { id: r.id, base: state.stats[r.event] || 0 };
  return r;
}

export function requestProgress(state) {
  const r = currentRequest(state);
  return r ? Math.min(r.target, (state.stats[r.event] || 0) - state.request.base) : 0;
}

export function completeRequest(state, now = Date.now()) {
  const r = currentRequest(state);
  if (!r || requestProgress(state) < r.target) return false;
  state.request = null;
  state.requestAt = now + REQUEST_PAUSE_MS;
  state.bond += REQUEST_BOND;
  give(state, REQUEST_REWARD);
  return true;
}

// Every game counts for tasks; only the first few per hour pay coins (GDD: rewards are limited, fun is not).
export function finishGame(state, catches, now = Date.now()) {
  track(state, 'games', 1, now);
  if (catches) track(state, 'catches', catches, now);
  state.playLog = state.playLog.filter((t) => now - t < HOUR);
  if (state.playLog.length >= GAME_REWARDS_PER_HOUR) return 0;
  state.playLog.push(now);
  const coins = Math.min(MAX_GAME_COINS, catches * COINS_PER_CATCH);
  state.coins += coins;
  return coins;
}

export const msToNextGameReward = (state, now = Date.now()) =>
  state.playLog.length < GAME_REWARDS_PER_HOUR ? 0 : Math.max(0, Math.min(...state.playLog) + HOUR - now);

// ---------- bond levels: petting, feeding, cartoons, requests all raise the bond ----------
// Bond needed to reach a level: 15, 45, 90, 150, 225… (each level a bit further than the last).
export const bondNeed = (level) => (15 * level * (level - 1)) / 2;
export function bondLevel(bond) {
  let level = 1;
  while (bond >= bondNeed(level + 1)) level += 1;
  return level;
}
export const levelReward = (level) => (level % 5 === 0 ? { crystals: level, fish: 10 } : { crystals: level });

// Pays every level reached since the last call, once. Returns the new levels.
export function claimBondLevels(state) {
  const reached = bondLevel(state.bond);
  const levels = [];
  while (state.bondPaid < reached) {
    state.bondPaid += 1;
    give(state, levelReward(state.bondPaid));
    levels.push(state.bondPaid);
  }
  return levels;
}

// ---------- guests ----------

export const GUEST_STAY_MS = 90 * 1000;
export const FIRST_GUEST_MS = 3 * 60 * 1000;
export const GUEST_GIFTS = [{ fish: 3 }, { coins: 20 }, { crystals: 1 }];
const nextGuestIn = (random) => (20 + random() * 20) * 60 * 1000; // 20–40 minutes

// A friend arrives when it is time and nobody is visiting; returns the guest or null.
export function guestArrives(state, now = Date.now(), random = Math.random) {
  if (state.guest || now < state.guestAt) return null;
  const friends = GUESTS.filter((g) => g.breed !== state.breed);
  const g = friends[Math.floor(random() * friends.length)];
  state.guest = { id: g.id, until: now + GUEST_STAY_MS, gifted: false };
  return g;
}

export const currentGuest = (state) => (state.guest ? GUESTS.find((g) => g.id === state.guest.id) : null);

// Greeting the guest the first time gives a small gift. Returns the gift or null.
export function greetGuest(state, random = Math.random) {
  if (!state.guest || state.guest.gifted) return null;
  state.guest.gifted = true;
  const gift = GUEST_GIFTS[Math.floor(random() * GUEST_GIFTS.length)];
  give(state, gift);
  track(state, 'guests');
  return gift;
}

// Returns true when the guest just left.
export function guestLeaves(state, now = Date.now(), random = Math.random) {
  if (!state.guest || now < state.guest.until) return false;
  state.guest = null;
  state.guestAt = now + nextGuestIn(random);
  return true;
}
