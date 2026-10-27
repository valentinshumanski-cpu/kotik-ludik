import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, expectation, spinReels } from '../src/game/slot.js';
import {
  createState, normalize, regenFish, applySpin, pet, buyItem, buyBreed, newest, msToNextFish,
  FISH_CAP, FISH_REGEN_MS, PETS_PER_FISH, PET_FISH_PER_DAY,
} from '../src/game/state.js';

const T0 = Date.UTC(2026, 9, 24, 12);

test('three of a kind pays its line', () => {
  assert.deepEqual(evaluate(['coin', 'coin', 'coin']).reward, { coins: 25 });
  assert.deepEqual(evaluate(['bell', 'bell', 'bell']).reward, { coins: 75 });
  assert.deepEqual(evaluate(['fish', 'fish', 'fish']).reward, { fish: 5 });
  assert.deepEqual(evaluate(['crystal', 'crystal', 'crystal']).reward, { crystals: 3 });
});

test('paw is wild and three paws is its own line', () => {
  const r = evaluate(['bell', 'paw', 'bell']);
  assert.equal(r.kind, 'bell');
  assert.deepEqual(r.winners, [0, 1, 2]);
  assert.deepEqual(evaluate(['paw', 'paw', 'paw']).reward, { coins: 150 });
  assert.equal(evaluate(['paw', 'paw', 'yarn']).kind, 'yarn');
});

test('pairs pay coins, crystal pairs pay a crystal, misses pay nothing', () => {
  const pair = evaluate(['coin', 'yarn', 'coin']);
  assert.deepEqual([pair.kind, pair.reward, pair.winners], ['pair', { coins: 6 }, [0, 2]]);
  assert.deepEqual(evaluate(['crystal', 'bell', 'paw']).reward, { crystals: 1 });
  const miss = evaluate(['coin', 'yarn', 'bell']);
  assert.deepEqual([miss.kind, miss.reward, miss.winners], ['none', {}, []]);
});

test('balance stays near GDD targets', () => {
  const e = expectation();
  assert.ok(e.coins > 6 && e.coins < 9, `coins per spin ${e.coins}`);
  assert.ok(e.crystals * 30 > 1 && e.crystals * 30 < 3, `crystals per 30 spins ${e.crystals * 30}`);
  assert.ok(e.fish < 0.2, 'fish refunds must not make spins endless');
});

test('spinReels uses the given random source', () => {
  assert.deepEqual(spinReels(() => 0), ['coin', 'coin', 'coin']);
  assert.deepEqual(spinReels(() => 0.9999), ['crystal', 'crystal', 'crystal']);
});

test('spin costs one fish and credits rewards immediately', () => {
  const s = createState(T0);
  assert.ok(applySpin(s, { reward: { coins: 25 } }, T0));
  assert.deepEqual([s.fish, s.coins, s.stats.spins], [FISH_CAP - 1, 25, 1]);
  s.fish = 0;
  assert.equal(applySpin(s, { reward: { coins: 99 } }, T0), false);
  assert.equal(s.coins, 25);
});

test('fish refill over time up to the cap, rewards can exceed it', () => {
  const s = createState(T0);
  s.fish = 0;
  s.fishAt = T0;
  regenFish(s, T0 + FISH_REGEN_MS * 2.5);
  assert.equal(s.fish, 2);
  assert.equal(msToNextFish(s, T0 + FISH_REGEN_MS * 2.5), FISH_REGEN_MS / 2);
  regenFish(s, T0 + FISH_REGEN_MS * 1000);
  assert.equal(s.fish, FISH_CAP);
  applySpin(s, { reward: { fish: 5 } }, T0 + FISH_REGEN_MS * 1000);
  assert.equal(s.fish, FISH_CAP + 4);
});

test('petting gives a fish every N pets with a daily limit', () => {
  const s = createState(T0);
  s.fish = 0;
  let earned = 0;
  for (let i = 0; i < PETS_PER_FISH * (PET_FISH_PER_DAY + 3); i++) earned += pet(s, T0) ? 1 : 0;
  assert.equal(earned, PET_FISH_PER_DAY);
  assert.equal(pet(s, T0 + 24 * 3600e3) || s.pets.count, 1, 'new day resets the counter');
});

test('buying places the item, picks the next goal and needs enough coins', () => {
  const s = createState(T0);
  assert.equal(buyItem(s, 'cat-bed'), false);
  s.coins = 100;
  assert.ok(buyItem(s, 'cat-bed'));
  assert.deepEqual([s.coins, s.placed.bed, s.target], [20, 'cat-bed', 'yarn']);
  assert.equal(buyItem(s, 'cat-bed'), false, 'no double purchase');
});

test('breeds cost crystals and switch the look', () => {
  const s = createState(T0);
  s.crystals = 30;
  assert.ok(buyBreed(s, 'sphynx'));
  assert.deepEqual([s.crystals, s.breed, s.breeds], [0, 'sphynx', ['ginger', 'sphynx']]);
});

test('normalize survives junk and keeps valid progress', () => {
  assert.deepEqual(normalize('garbage', T0), createState(T0));
  const s = normalize({ v: 1, coins: 50.7, crystals: -4, owned: ['yarn', 'hacked'], placed: { toy: 'yarn', bed: 'yarn' }, breed: 'persian', breeds: ['nope'] }, T0);
  assert.equal(s.coins, 50);
  assert.equal(s.crystals, 0);
  assert.ok(s.owned.includes('yarn') && !s.owned.includes('hacked'));
  assert.equal(s.placed.toy, 'yarn');
  assert.equal(s.placed.bed, undefined, 'yarn cannot sit in the bed place');
  assert.equal(s.breed, 'ginger');
});

test('newest save wins', () => {
  assert.equal(newest({ savedAt: 5 }, { savedAt: 9 }).savedAt, 9);
  assert.equal(newest({ savedAt: 5 }, null).savedAt, 5);
});

// ---------- progress: tasks, achievements, requests, gift, mini-game rewards ----------
import {
  pickTasks, track, todaysTasks, claimTask, claimAchievement, claimableCount, claimDailyGift,
  maybeRequest, requestProgress, completeRequest, finishGame, msToNextGameReward,
  GIFT_FISH, GAME_REWARDS_PER_HOUR, MAX_GAME_COINS, REQUEST_PAUSE_MS,
} from '../src/game/progress.js';

const DAY = 24 * 3600e3;

test('three distinct daily tasks, stable for the day, new the next day', () => {
  const s = createState(T0);
  const today = todaysTasks(s, T0).map((t) => t.id);
  assert.equal(new Set(today).size, 3);
  assert.deepEqual(todaysTasks(s, T0 + 1000).map((t) => t.id), today);
  assert.deepEqual(pickTasks(s.daily.day, s), today, 'same pick on another device');
  track(s, 'spins', 4, T0 + DAY);
  assert.equal(s.daily.counts.spins, 4, 'counters restart on a new day');
  assert.equal(s.stats.spins, 4, 'lifetime stats keep counting');
});

test('a task pays once and only when done', () => {
  const s = createState(T0);
  const [task] = todaysTasks(s, T0);
  assert.equal(claimTask(s, task.id, T0), false);
  track(s, task.event, task.target, T0);
  assert.equal(claimableCount(s, T0), 1);
  const before = { coins: s.coins, fish: s.fish, crystals: s.crystals };
  assert.ok(claimTask(s, task.id, T0));
  for (const k of Object.keys(before)) assert.equal(s[k], before[k] + (task.reward[k] || 0));
  assert.equal(claimTask(s, task.id, T0), false, 'no double claim');
});

test('achievements pay once', () => {
  const s = createState(T0);
  s.stats.spins = 100;
  assert.ok(claimAchievement(s, 'spins100'));
  assert.equal(s.crystals, 5);
  assert.equal(claimAchievement(s, 'spins100'), false);
  assert.equal(claimAchievement(s, 'spins500'), false);
});

test('daily gift once per day', () => {
  const s = createState(T0);
  s.fish = 0;
  assert.ok(claimDailyGift(s, T0));
  assert.equal(claimDailyGift(s, T0 + 1000), false);
  assert.ok(claimDailyGift(s, T0 + DAY));
  assert.equal(s.fish, GIFT_FISH * 2);
});

test('requests appear after a pause, count only new activity and reward once', () => {
  const s = createState(T0);
  assert.equal(maybeRequest(s, T0), null, 'not right at the first launch');
  s.stats.pets = 7;
  const r = maybeRequest(s, T0 + 60e3, () => 0); // first request = pet x3
  assert.equal(r.id, 'pet');
  assert.equal(maybeRequest(s, T0 + 60e3), null, 'one request at a time');
  track(s, 'pets', 2, T0);
  assert.equal(completeRequest(s, T0), false);
  track(s, 'pets', 1, T0);
  assert.equal(requestProgress(s), 3);
  const fish = s.fish;
  assert.ok(completeRequest(s, T0));
  assert.equal(s.fish, fish + 2);
  assert.equal(s.requestAt, T0 + REQUEST_PAUSE_MS);
});

test('mini-game coins are capped and limited per hour, games always count', () => {
  const s = createState(T0);
  assert.equal(finishGame(s, 100, T0), MAX_GAME_COINS);
  for (let i = 1; i < GAME_REWARDS_PER_HOUR; i++) assert.equal(finishGame(s, 5, T0 + i), 10);
  assert.equal(finishGame(s, 5, T0 + 10), 0, 'limit reached');
  assert.ok(msToNextGameReward(s, T0 + 10) > 0);
  assert.equal(s.stats.games, GAME_REWARDS_PER_HOUR + 1);
  assert.equal(finishGame(s, 5, T0 + 3600e3 + 1), 10, 'next hour pays again');
});

test('old saves without new fields still load', () => {
  const s = normalize({ v: 1, coins: 10, stats: { spins: 3 } }, T0);
  assert.equal(s.stats.spins, 3);
  assert.equal(s.stats.pets, 0);
  assert.deepEqual(s.achievements, []);
  assert.equal(s.settings.music, true);
});

// ---------- colours and feeding ----------
import { chooseColor, itemImg, feed } from '../src/game/state.js';
import { itemById, COLOR_PRICE } from '../src/data/content.js';

test('colours need the item, cost once, then switch for free', () => {
  const s = createState(T0);
  s.coins = 100;
  assert.equal(chooseColor(s, 'cat-bed', 'blue'), false, 'bed not owned yet');
  buyItem(s, 'cat-bed');
  const coins = s.coins;
  assert.ok(chooseColor(s, 'cat-bed', 'blue'));
  assert.equal(s.coins, coins - COLOR_PRICE);
  assert.equal(itemImg(s, itemById('cat-bed')), 'cat-bed-blue');
  assert.ok(chooseColor(s, 'cat-bed', 'base'));
  assert.ok(chooseColor(s, 'cat-bed', 'blue'));
  assert.equal(s.coins, coins - COLOR_PRICE, 'owned colour is free');
  assert.equal(chooseColor(s, 'bed-basket', 'blue'), false, 'basket has no colours');
  const back = normalize(JSON.parse(JSON.stringify(s)), T0);
  assert.equal(itemImg(back, itemById('cat-bed')), 'cat-bed-blue', 'survives save/load');
});

test('feeding needs a bowl and a fish', () => {
  const s = createState(T0);
  assert.equal(feed(s, T0), false, 'no bowl');
  s.coins = 40;
  buyItem(s, 'bowl-ceramic', T0);
  s.fish = 0;
  assert.equal(feed(s, T0), false, 'no fish');
  s.fish = 3;
  assert.ok(feed(s, T0));
  assert.deepEqual([s.fish, s.bond, s.stats.feeds], [2, 5, 1]);
});

test('feed request and task only come with a bowl', () => {
  const s = createState(T0);
  for (let i = 0; i < 20; i++) {
    s.request = null;
    s.requestAt = 0;
    assert.notEqual(maybeRequest(s, T0, () => i / 20).id, 'feed');
  }
  assert.ok(!pickTasks('2026-10-25', s).includes('feed2'));
});

// ---------- living room ----------
import { watchTv, readBook, placeItem } from '../src/game/state.js';

test('living room starts furnished, also for saves from before it existed', () => {
  const fresh = createState(T0);
  assert.deepEqual([fresh.placed.seat, fresh.placed['lr-wall'], fresh.placed['lr-floor'], fresh.placed['lr-rug']],
    ['armchair', 'lr-wall-cream', 'lr-floor-oak', 'lr-rug-tassel']);
  const old = normalize({ v: 1, owned: ['cat-bed'], placed: { bed: 'cat-bed' } }, T0);
  assert.equal(old.placed.bed, 'cat-bed', 'old placements kept');
  assert.equal(old.placed.seat, 'armchair', 'new places filled with starters');
  assert.ok(old.owned.includes('lr-wall-cream'));
});

test('TV needs a TV, reading always works, both count for tasks', () => {
  const s = createState(T0);
  assert.equal(watchTv(s, T0), false);
  s.coins = 500;
  buyItem(s, 'tv-retro', T0);
  assert.ok(watchTv(s, T0));
  assert.ok(readBook(s, T0));
  assert.deepEqual([s.stats.tv, s.stats.reads, s.bond], [1, 1, 4]);
});

test('buying a sofa replaces the armchair, the armchair can come back', () => {
  const s = createState(T0);
  s.coins = 200;
  assert.ok(buyItem(s, 'sofa-cozy', T0));
  assert.equal(s.placed.seat, 'sofa-cozy');
  assert.ok(placeItem(s, 'armchair'));
  assert.equal(s.placed.seat, 'armchair');
});

// ---------- bond levels ----------
import { bondNeed, bondLevel, claimBondLevels } from '../src/game/progress.js';

test('bond levels grow further apart and pay once', () => {
  assert.deepEqual([2, 3, 4, 5].map(bondNeed), [15, 45, 90, 150]);
  assert.deepEqual([0, 14, 15, 44, 45, 150].map(bondLevel), [1, 1, 2, 2, 3, 5]);
  const s = createState(T0);
  s.bond = 150; // level 5 at once, e.g. an old save
  assert.deepEqual(claimBondLevels(s), [2, 3, 4, 5]);
  assert.equal(s.crystals, 2 + 3 + 4 + 5);
  assert.equal(s.fish, FISH_CAP + 10, 'every 5th level adds fish');
  assert.deepEqual(claimBondLevels(s), [], 'no double reward');
  assert.equal(normalize(JSON.parse(JSON.stringify(s)), T0).bondPaid, 5);
});

// ---------- guests ----------
import { guestArrives, currentGuest, greetGuest, guestLeaves, GUEST_STAY_MS } from '../src/game/progress.js';

test('a friend visits, is never Alex himself, gifts once and leaves', () => {
  const s = createState(T0);
  assert.equal(guestArrives(s, T0), null, 'not right at the first launch');
  const t = s.guestAt;
  for (let i = 0; i < 10; i++) {
    s.guest = null;
    assert.notEqual(guestArrives(s, t, () => i / 10).breed, s.breed);
  }
  assert.equal(guestArrives(s, t), null, 'one guest at a time');
  const before = s.coins + s.fish + s.crystals;
  assert.ok(greetGuest(s, () => 0));
  assert.equal(s.coins + s.fish + s.crystals, before + 3);
  assert.equal(greetGuest(s), null, 'gift only once per visit');
  assert.equal(guestLeaves(s, t + GUEST_STAY_MS - 1), false);
  assert.ok(guestLeaves(s, t + GUEST_STAY_MS));
  assert.ok(s.guestAt >= t + GUEST_STAY_MS + 20 * 60e3, 'next friend 20–40 min later');
  assert.equal(currentGuest(s), null);
});
