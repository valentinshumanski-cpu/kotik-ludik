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
  assert.deepEqual(s.placed, { toy: 'yarn' });
  assert.equal(s.breed, 'ginger');
});

test('newest save wins', () => {
  assert.equal(newest({ savedAt: 5 }, { savedAt: 9 }).savedAt, 9);
  assert.equal(newest({ savedAt: 5 }, null).savedAt, 5);
});
