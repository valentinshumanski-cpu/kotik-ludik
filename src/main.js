import { SYMBOLS, spinReels, evaluate } from './game/slot.js';
import { applySpin, regenFish, msToNextFish, pet, buyItem, placeItem, buyBreed, chooseColor, itemImg, feed, FISH_CAP } from './game/state.js';
import { ITEMS, PLACES, BREEDS, ACHIEVEMENTS, COLOR_PRICE, itemById } from './data/content.js';
import {
  todaysTasks, taskProgress, claimTask, achievementProgress, claimAchievement, claimableCount, claimDailyGift,
  maybeRequest, currentRequest, requestProgress, completeRequest, finishGame, msToNextGameReward,
  GIFT_FISH, GAME_REWARDS_PER_HOUR, MAX_GAME_COINS, REQUEST_REWARD,
} from './game/progress.js';
import { startGame } from './minigames.js';
import { startMusic, stopMusic } from './music.js';
import { loadState, saveState } from './platform/storage.js';
import { initTelegram, haptic, setBackButton, inTelegram } from './platform/telegram.js';
import { sfx, unlockAudio, configureAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const asset = (name) => `assets/${name}.webp`;
const catSrc = (pose) => `assets/cats/${state.breed}-${pose}.webp`;
const reels = [0, 1, 2].map((i) => $(`reel${i}`));
const symbolById = Object.fromEntries(SYMBOLS.map((s) => [s.id, s]));
// On by default: with motion off, spins finish instantly and can be tapped through.
const motionOn = () => state.settings.motion ?? true;
const applyMotion = () => document.body.classList.toggle('no-motion', !motionOn());

let state;
let spinning = false;
let shown = null; // currency values on screen; lag behind state while reels spin
let pose = 'calm';
let poseTimer = null;
let idleTimer = null;
let bubbleTimer = null;
let saveWarned = false;
let stopGame = null;
let lastGame = null;
let feeding = false;
let lastMeow = 0;

// Audio may only start after a tap; music joins it when enabled and the app is in front.
function audioOn() {
  unlockAudio();
  if (state.settings.sound && state.settings.music && document.visibilityState === 'visible') startMusic();
  else stopMusic();
}

// ---------- persistence ----------
function save() {
  if (!saveState(state) && !saveWarned) {
    saveWarned = true;
    say('Не получается сохранить прогресс 😿', 4000);
  }
}

// ---------- HUD ----------
function renderHud() {
  const values = shown ?? state;
  for (const key of ['coins', 'crystals', 'fish']) {
    const el = $(key);
    if (el.textContent !== String(values[key])) {
      if (el.textContent !== '') $(`${key}Pill`).classList.remove('bump'), void el.offsetWidth, $(`${key}Pill`).classList.add('bump');
      el.textContent = values[key];
    }
  }
  const ms = msToNextFish(state);
  $('fishTimer').textContent = ms ? `+1 через ${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}` : '';
  $('spinButton').disabled = spinning;
  document.querySelector('[data-panel=tasks]').classList.toggle('badge', claimableCount(state) > 0);
}

function renderGoal() {
  const item = itemById(state.target);
  const card = $('goalCard');
  card.hidden = !item;
  if (!item) return;
  const have = Math.min(state.coins, item.price);
  card.classList.toggle('ready', state.coins >= item.price);
  card.innerHTML = `<img src="${asset(item.img)}" alt="">
    <span>Следующий предмет:<b>${item.name}</b><span class="bar"><i style="width:${(100 * have) / item.price}%"></i></span>${
      state.coins >= item.price ? 'Купить!' : `🪙 ${have} / ${item.price}`
    }</span>`;
}

function renderRoom(justPlaced) {
  for (const el of document.querySelectorAll('[data-place]')) {
    const item = itemById(state.placed[el.dataset.place]);
    if (!item) { el.innerHTML = ''; continue; }
    const key = `${item.id}:${state.colors[item.id] || 'base'}`;
    if (el.dataset.item === key) continue;
    el.dataset.item = key;
    el.innerHTML = `<img src="${asset(itemImg(state, item))}" alt="${item.name}"${item.id === justPlaced ? ' class="appear"' : ''}>`;
    // drop the one-shot class so ambient sway (plants) can take over after the landing
    el.firstChild.addEventListener('animationend', (e) => e.target.classList.remove('appear'), { once: true });
  }
}

const renderAll = (justPlaced) => { renderHud(); renderGoal(); renderRoom(justPlaced); setPose(pose); };

// ---------- cat ----------
function setPose(next, ms = 0) {
  const img = $('catImg');
  const src = catSrc(next);
  // Cross-fade: the old pose fades out on top of the new one. Blinks stay instant or they look mushy.
  if (img.getAttribute('src') && img.getAttribute('src') !== src && next !== 'blink' && pose !== 'blink' && motionOn()) {
    const prev = $('catPrev');
    prev.src = img.getAttribute('src');
    prev.classList.remove('fade');
    void prev.offsetWidth;
    prev.classList.add('fade');
  }
  pose = next;
  img.src = src;
  $('cat').classList.toggle('sleeping', next === 'sleep');
  clearTimeout(poseTimer);
  if (ms) poseTimer = setTimeout(() => setPose('calm'), ms);
}

function react(className, nextPose, ms) {
  const cat = $('cat');
  cat.classList.remove('joy', 'hype', 'squish', 'waiting');
  void cat.offsetWidth;
  if (className) cat.classList.add(className);
  setPose(nextPose, ms);
}

function wake() {
  if (pose === 'sleep') setPose('calm');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (!spinning) setPose('sleep'); }, 45000);
}

function blinkLoop() {
  setTimeout(() => {
    if (pose === 'calm') { setPose('blink'); setTimeout(() => pose === 'blink' && setPose('calm'), 170); }
    blinkLoop();
  }, 2800 + Math.random() * 3500);
}

function say(text, ms = 2200) {
  const bubble = $('bubble');
  bubble.textContent = text;
  bubble.hidden = false;
  bubble.style.animation = 'none';
  void bubble.offsetWidth;
  bubble.style.animation = '';
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(showRequest, ms);
}

// Alex's current request stays in his speech bubble until it is done.
function showRequest() {
  bubbleTimer = null;
  const r = currentRequest(state);
  const bubble = $('bubble');
  bubble.hidden = !r || Boolean(stopGame);
  if (r) bubble.textContent = `💭 ${r.text} ${requestProgress(state)}/${r.target}`;
}

// Called after anything the player does: finishes a request once its counter is reached.
function afterActivity() {
  if (completeRequest(state)) {
    hearts(5);
    sfx.buy();
    haptic('success');
    shown = null;
    say(`Спасибо! 💛 +${REQUEST_REWARD.fish} 🐟`, 2600);
    setTimeout(() => sfx.meow(true), 300);
  } else if (bubbleTimer === null) showRequest(); // refresh the progress unless a message is showing
  save();
  renderHud();
}

// Floating particles (hearts, sparkles, reward text) at x/y in % of the stage.
function burst(cls, text, count, x, y, spread = 14) {
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = cls;
    p.textContent = text;
    p.style.left = `${x + (Math.random() - 0.5) * spread}%`;
    p.style.top = `${y + (Math.random() - 0.5) * spread * 0.4}%`;
    p.style.animationDelay = `${i * 110}ms`;
    $('fx').append(p);
    setTimeout(() => p.remove(), 1500 + i * 110);
  }
}
const hearts = (count = 3) => burst('heart', '♥', count, 50, 27);

// Centre of an element in % of the stage, to aim particles at it.
function stagePoint(el) {
  const s = $('stage').getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return [((r.left + r.width / 2 - s.left) / s.width) * 100, ((r.top + r.height / 2 - s.top) / s.height) * 100];
}

function confetti(count = 26) {
  if (!motionOn()) return;
  const colors = ['#ff6b7d', '#ffd56b', '#7bd3f7', '#a77bf3', '#7fdc8a'];
  for (let i = 0; i < count; i++) {
    const c = document.createElement('i');
    c.className = 'confetti';
    c.style.left = `${Math.random() * 100}%`;
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = `${1.4 + Math.random()}s`;
    c.style.animationDelay = `${Math.random() * 300}ms`;
    $('fx').append(c);
    setTimeout(() => c.remove(), 2800);
  }
}

function onPet() {
  audioOn();
  wake();
  const gotFish = pet(state);
  react('squish', 'pet', 1200);
  hearts();
  sfx.purr();
  haptic('soft');
  if (Date.now() - lastMeow > 8000 && Math.random() < 0.18) { lastMeow = Date.now(); setTimeout(() => sfx.meow(), 450); } // now and then
  if (gotFish) {
    shown = null;
    say('Мур! Держи рыбку 🐟');
  } else if (state.pets.count % 10 === 5) say('Мур-мур…');
  afterActivity();
}

// ---------- slot ----------
function symbolMarkup(id) {
  const s = symbolById[id];
  return `<img class="sym" src="${asset(s.img)}" alt="${s.name}">`;
}

function flyCoins(fromEl, toPill, count) {
  if (!motionOn()) return;
  const from = fromEl.getBoundingClientRect();
  const to = $(toPill).getBoundingClientRect();
  for (let i = 0; i < count; i++) {
    const img = document.createElement('img');
    img.className = 'flying';
    img.src = toPill === 'coinsPill' ? asset('sym-coin') : asset('sym-fish');
    document.body.append(img);
    const x0 = from.left + from.width * Math.random(), y0 = from.top + from.height / 2;
    img.animate(
      [
        { transform: `translate(${x0}px, ${y0}px) scale(.6)`, opacity: 0 },
        { transform: `translate(${x0 + (Math.random() - 0.5) * 60}px, ${y0 - 40}px) scale(1)`, opacity: 1, offset: 0.3 },
        { transform: `translate(${to.left + 8}px, ${to.top + 4}px) scale(.7)`, opacity: 0.9 },
      ],
      { duration: 700 + i * 60, delay: i * 70, easing: 'ease-in', fill: 'forwards' },
    ).onfinish = () => img.remove();
  }
}

function spin() {
  if (spinning) return;
  audioOn();
  wake();
  regenFish(state);
  const outcome = spinReels();
  const result = evaluate(outcome);
  const before = { coins: state.coins, crystals: state.crystals, fish: state.fish };
  if (!applySpin(state, result)) {
    sfx.denied();
    haptic('warning');
    const ms = msToNextFish(state);
    say(`Рыбки кончились! +1 через ${Math.ceil(ms / 60000)} мин. Погладь меня 🐾`, 3200);
    return;
  }
  save(); // the result is stored before the animation: closing the app mid-spin keeps the win
  shown = { ...before, fish: before.fish - 1 };
  spinning = true;
  renderHud();
  sfx.click();
  haptic('medium');
  $('lever').classList.remove('pull');
  void $('lever').offsetWidth;
  $('lever').classList.add('pull');
  $('result').textContent = 'Крутим…';
  reels.forEach((r) => r.classList.remove('win'));
  react('waiting', 'wait');

  const durations = reels.map((_, i) => (motionOn() ? 1200 + i * 330 : 80 * (i + 1)));
  sfx.spinStart(durations[2] / 1000);
  outcome.forEach((id, i) => {
    const reel = reels[i];
    const cell = reel.clientHeight;
    const rows = motionOn() ? 14 + i * 4 : 2;
    const filler = Array.from({ length: rows - 1 }, (_, k) => SYMBOLS[(k * 5 + i * 2) % SYMBOLS.length].id);
    const current = reel.dataset.symbol || SYMBOLS[i].id;
    reel.innerHTML = `<div class="reel-strip" style="--cell:${cell}px;--dur:${durations[i]}ms">${[current, ...filler, id]
      .map((s) => `<div class="cell">${symbolMarkup(s)}</div>`).join('')}</div>`;
    const strip = reel.firstChild;
    void strip.offsetWidth;
    strip.style.transform = `translateY(-${cell * rows}px)`;
    setTimeout(() => {
      reel.innerHTML = `<div class="cell" style="--cell:${cell}px">${symbolMarkup(id)}</div>`;
      reel.dataset.symbol = id;
      sfx.reelStop(i);
      haptic('light');
      if (i === 2) reveal(result);
    }, durations[i] + 40);
  });
}

function reveal(result) {
  spinning = false;
  sfx.spinStop();
  sfx.outcome(result.kind);
  result.winners.forEach((i) => reels[i].classList.add('win'));
  const { coins = 0, fish = 0, crystals = 0 } = result.reward;
  const parts = [coins && `+${coins} 🪙`, fish && `+${fish} 🐟`, crystals && `+${crystals} 💎`].filter(Boolean);
  $('result').textContent = parts.length ? `${result.text} ${parts.join(' ')}` : result.text;
  if (parts.length) burst('reward', parts.join(' '), 1, 50, 64, 0);
  const big = ['bell', 'paw', 'crystal', 'fish'].includes(result.kind);
  if (big && motionOn()) { const c = document.querySelector('.cabinet'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); }
  if (result.kind === 'paw' || result.kind === 'crystal') confetti();
  if (big) burst('spark', '✦', 6, 50, 30, 30);
  if (coins) flyCoins($('reel1'), 'coinsPill', Math.min(8, 2 + Math.round(coins / 15)));
  if (fish) flyCoins($('reel1'), 'fishPill', 3);
  setTimeout(() => { shown = null; renderHud(); renderGoal(); }, motionOn() ? 650 : 0);

  if (result.kind === 'none') react(null, 'calm');
  else if (result.kind === 'pair') { react('joy', 'joy', 1300); haptic('light'); }
  else if (['paw', 'crystal', 'fish'].includes(result.kind)) { react('hype', 'hype', 2200); haptic('success'); hearts(5); setTimeout(() => sfx.meow(true), 500); }
  else if (result.kind === 'bell') { react('hype', 'super', 1800); haptic('success'); }
  else { react('joy', 'happy', 1500); haptic('success'); }
  if (state.target && state.coins >= itemById(state.target).price && state.coins - coins < itemById(state.target).price) {
    setTimeout(() => say(`Хватает на «${itemById(state.target).name}»! Жми на карточку`, 3000), 900);
  }
  afterActivity();
}

// ---------- feeding: Alex jumps down and eats next to the bowl ----------
function onFeed() {
  const bowlItem = itemById(state.placed.bowl);
  if (!bowlItem || spinning || stopGame || feeding) return;
  audioOn();
  wake();
  if (!feed(state)) {
    sfx.denied();
    haptic('warning');
    say('Нет рыбок для миски 🐟');
    return;
  }
  feeding = true;
  shown = null;
  save();
  renderHud();
  wake();
  const bowl = $('bowl');
  const food = document.createElement('img'); // full bowl on top of the empty one, fades out lick by lick
  food.className = 'food';
  food.src = asset(bowlItem.full);
  bowl.append(food);

  // Geometry in % of the stage. Eater is 46% wide, anchored at the paw line (83% of its canvas).
  // In the eat pose the head sits at 69% of the canvas width -> 0.19 * 46 = 8.7% right of the anchor.
  const s = $('stage').getBoundingClientRect();
  const b = bowl.getBoundingClientRect();
  const bowlX = ((b.left + b.width / 2 - s.left) / s.width) * 100;
  const bowlTop = ((b.top - s.top) / s.height) * 100;
  const bowlH = (b.height / s.height) * 100;
  const land = { x: bowlX - 8.7, y: bowlTop + bowlH * 0.45 }; // paws behind the bowl, mouth inside it
  const eater = document.createElement('img');
  eater.className = 'eater';
  eater.alt = '';
  eater.src = catSrc('run');
  bowl.before(eater); // the bowl's front rim covers the chin
  $('cat').classList.add('away');

  // Up on the machine Alex is drawn larger (62% vs 46% wide), so the seat end of a jump is scaled.
  const seat = { x: 48, y: 48, scale: 1.35 };
  const at = (p, extra = '') => ({ left: `${p.x}%`, top: `${p.y}%`, transform: `translate(-50%, -83%) scale(${p.scale ?? 1}) ${extra}` });
  const wait = (ms) => new Promise((r) => setTimeout(r, motionOn() ? ms : 1));
  // A timer backs up the animation: a paused or backgrounded WebView must not leave Alex stuck at the bowl.
  const jump = (from, to, flip) => Promise.race([wait(700), eater.animate(
    [at(from, flip), at({ x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 8, scale: ((from.scale ?? 1) + (to.scale ?? 1)) / 2 }, flip), at(to, flip)],
    { duration: motionOn() ? 620 : 1, easing: 'ease-in-out', fill: 'forwards' },
  ).finished]);

  (async () => {
    sfx.hop();
    await jump(seat, land, '');
    eater.src = catSrc('eat');
    for (let lick = 1; lick <= 3; lick++) {
      eater.animate([at(land), at({ x: land.x + 0.4, y: land.y + 0.9 }), at(land)], { duration: 420, easing: 'ease-in-out' });
      await wait(200);
      food.style.opacity = String(1 - lick / 3);
      sfx.lick();
      haptic('light');
      burst('heart', lick === 3 ? '♥' : '·', 1, bowlX, bowlTop - 2, 6);
      await wait(380);
    }
    sfx.purr();
    await wait(300);
    eater.src = catSrc('run');
    sfx.hop();
    await jump(land, seat, 'scaleX(-1)');
    eater.remove();
    food.remove();
    $('cat').classList.remove('away');
    feeding = false;
    react('joy', 'happy', 1200);
    sfx.meow(true);
    say('Вкусно! Спасибо 💛');
    afterActivity();
  })();
}

// ---------- goal card & panels ----------
function buy(id) {
  if (!buyItem(state, id)) { sfx.denied(); haptic('error'); return false; }
  sfx.buy();
  haptic('success');
  save();
  renderAll(id);
  react('hype', 'hype', 1800);
  hearts(4);
  const placed = document.querySelector(`[data-place="${itemById(id).place}"]`);
  if (placed) burst('spark', '✦', 6, ...stagePoint(placed), 18);
  say('Ура, обновка! 💛');
  afterActivity();
  return true;
}

function onGoal() {
  audioOn();
  const item = itemById(state.target);
  if (item && state.coins >= item.price) buy(item.id);
  else openPanel('shop');
}

const panels = {
  shop: {
    title: 'Магазин',
    render: () => PLACES.map((place) => {
      const items = ITEMS.filter((i) => i.place === place.id);
      const cards = items.map((item) => {
        const owned = state.owned.includes(item.id);
        const placed = state.placed[place.id] === item.id;
        const button = placed ? '<button class="ghost" disabled>Стоит ✓</button>'
          : owned ? `<button data-place-item="${item.id}">Поставить</button>`
          : state.coins >= item.price ? `<button data-buy="${item.id}">Купить · 🪙${item.price}</button>`
          : `<button class="ghost" data-target="${item.id}">${state.target === item.id ? 'Копим ✓' : 'Копить'} · 🪙${item.price}</button>`;
        const swatches = owned && item.colors ? `<div class="swatches">${item.colors.map((c) => {
          const on = (state.colors[item.id] || 'base') === c.id;
          const have = c.id === 'base' || state.ownedColors.includes(`${item.id}:${c.id}`);
          return `<button class="swatch${on ? ' on' : ''}${have ? '' : ' locked'}" style="background:${c.swatch}" data-color="${item.id}:${c.id}" aria-label="${c.name}${have ? '' : `, ${COLOR_PRICE} монеток`}"></button>`;
        }).join('')}</div>` : '';
        return `<div class="card"><img src="${asset(itemImg(state, item))}" alt=""><b>${item.name}</b>${button}${swatches}</div>`;
      }).join('') || '<div class="card missing">Пока нет картинки предмета</div>';
      const hint = place.id === 'bowl' ? '<p class="note">Нажми на миску в комнате — Алекс поест (1 🐟, +привязанность).</p>' : '';
      return `<h3>${place.name}</h3>${hint}<div class="grid">${cards}</div>`;
    }).join('') + `<p class="note">Кружочки под купленной вещью — её цвета. Новый цвет стоит ${COLOR_PRICE} 🪙, потом переключается бесплатно.</p>`,
  },
  collection: {
    title: 'Коллекция',
    render: () => `<h3>Породы Алекса</h3><div class="grid">${BREEDS.map((b) => {
      const owned = state.breeds.includes(b.id);
      const button = state.breed === b.id ? '<button class="ghost" disabled>Сейчас ✓</button>'
        : owned ? `<button data-breed="${b.id}">Выбрать</button>`
        : `<button data-buy-breed="${b.id}" ${state.crystals < b.price ? 'disabled' : ''}>💎 ${b.price}</button>`;
      return `<div class="card"><img src="assets/cats/${b.id}-calm.webp" alt=""><b>${b.name}</b>${button}</div>`;
    }).join('')}</div>
    <h3>Алекс и ты</h3>
    <div class="row"><span>Привязанность</span><b>♥ ${state.bond}</b></div>
    <div class="row"><span>Прокруток</span><b>${state.stats.spins}</b></div>
    <div class="row"><span>Вещей в комнате</span><b>${state.owned.length} / ${ITEMS.length}</b></div>`,
  },
  tasks: {
    title: 'Задания',
    render: () => {
      const row = (title, have, target, reward, button) => `<div class="task"><span>${title}<span class="bar"><i style="width:${(100 * have) / target}%"></i></span><small>${have} / ${target} · награда ${rewardText(reward)}</small></span>${button}</div>`;
      const daily = todaysTasks(state).map((t) => {
        const done = taskProgress(state, t) >= t.target;
        const claimed = state.daily.claimed.includes(t.id);
        return row(t.title, taskProgress(state, t), t.target, t.reward,
          claimed ? '<button class="ghost" disabled>✓</button>' : `<button data-claim-task="${t.id}" ${done ? '' : 'disabled'}>Забрать</button>`);
      }).join('');
      const r = currentRequest(state);
      const achievements = ACHIEVEMENTS.map((a) => {
        const claimed = state.achievements.includes(a.id);
        const have = achievementProgress(state, a);
        return row(`<b>${a.title}</b> — ${a.text}`, have, a.target, a.reward,
          claimed ? '<button class="ghost" disabled>✓</button>' : `<button data-claim-ach="${a.id}" ${have >= a.target ? '' : 'disabled'}>Забрать</button>`);
      }).join('');
      return `<h3>На сегодня</h3>${daily}<p class="note">Новые задания каждый день в полночь. Пропустить день не страшно.</p>
        <h3>Просьба Алекса</h3>${r ? row(r.text, requestProgress(state), r.target, REQUEST_REWARD, '<span class="note">💭</span>') : '<p class="note">Алекс пока ничего не просит. Загляни попозже 🐾</p>'}
        <h3>Достижения</h3>${achievements}`;
    },
  },
  play: {
    title: 'Поиграть с Алексом',
    render: () => {
      const wait = msToNextGameReward(state);
      const left = GAME_REWARDS_PER_HOUR - state.playLog.filter((t) => Date.now() - t < 3600e3).length;
      return `<div class="grid">
        <button class="game-pick" data-game="mouse"><img src="assets/toy-mouse.webp" alt=""><b>Поймай мышку</b><small>Тапай по мышкам</small></button>
        <button class="game-pick" data-game="laser"><span class="laser-preview"></span><b>Лазерная точка</b><small>Веди точку — Алекс ловит</small></button>
      </div>
      <p class="note">${wait ? `Монетки на этот час закончились, следующие через ${Math.ceil(wait / 60000)} мин. Играть можно и так!` : `Монетки за игру: по 2 за поимку, до ${MAX_GAME_COINS}. Осталось игр с наградой в этот час: ${left} из ${GAME_REWARDS_PER_HOUR}.`}</p>`;
    },
  },
  result: {
    title: 'Игра окончена',
    render: () => `<div class="game-result"><b>Поймано: ${lastGame.catches}</b>
      <p>${lastGame.coins ? `+${lastGame.coins} 🪙` : msToNextGameReward(state) ? 'Без монеток: лимит наград на этот час' : 'В этот раз без монеток'}</p></div>
      <div class="grid"><button data-game="${lastGame.kind}">Ещё раз</button><button class="ghost" data-close="1">Готово</button></div>`,
  },
  settings: {
    title: 'Настройки',
    render: () => `
      <div class="row"><label for="soundOn">Звук</label><input type="checkbox" id="soundOn" ${state.settings.sound ? 'checked' : ''}></div>
      <div class="row"><label for="musicOn">Музыка</label><input type="checkbox" id="musicOn" ${state.settings.music ? 'checked' : ''}></div>
      <div class="row"><label for="volume">Громкость</label><input type="range" id="volume" min="0" max="100" value="${Math.round(state.settings.volume * 100)}"></div>
      <div class="row"><label for="motionOn">Анимации</label><input type="checkbox" id="motionOn" ${motionOn() ? 'checked' : ''}></div>
      <h3>Выплаты</h3>
      <table class="paytable">
        <tr><td>🐾🐾🐾</td><td>150 🪙</td></tr><tr><td>💎💎💎</td><td>3 💎</td></tr><tr><td>🐟🐟🐟</td><td>5 🐟</td></tr>
        <tr><td>🔔🔔🔔</td><td>75 🪙</td></tr><tr><td>🧶🧶🧶</td><td>40 🪙</td></tr><tr><td>🪙🪙🪙</td><td>25 🪙</td></tr>
        <tr><td>Пара 💎</td><td>1 💎</td></tr><tr><td>Любая другая пара</td><td>6 🪙</td></tr>
      </table>
      <p class="note">🐾 лапка заменяет любой символ. Прокрутка стоит 1 🐟, рыбки восполняются: +1 каждые 3 минуты до ${FISH_CAP}.</p>
      <h3>Тест</h3>
      <button class="god" data-god="1">⚡ Год-мод: +10 000 🪙, +100 💎, +50 🐟</button>
      <p class="note">${inTelegram ? 'Прогресс хранится в облаке Telegram и общий для всех твоих устройств.' : 'Прогресс хранится только в этом браузере.'}</p>`,
  },
};

let openName = null;
function openPanel(name) {
  if (name === 'room') return closePanel();
  openName = name;
  $('panelTitle').textContent = panels[name].title;
  $('panelBody').innerHTML = panels[name].render();
  document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('active', b.dataset.panel === name));
  if (!$('panel').open) $('panel').showModal();
  setBackButton(closePanel);
}
function closePanel() {
  openName = null;
  if ($('panel').open) $('panel').close();
  document.querySelectorAll('.nav button').forEach((b) => b.classList.toggle('active', b.dataset.panel === 'room'));
  setBackButton(null);
}
const rewardText = (r) => [r.coins && `${r.coins} 🪙`, r.fish && `${r.fish} 🐟`, r.crystals && `${r.crystals} 💎`].filter(Boolean).join(' ');

function playGame(kind) {
  closePanel();
  document.body.classList.add('in-game');
  $('bubble').hidden = true;
  react(null, 'calm');
  stopGame = startGame(kind, {
    stage: $('stage'),
    cat: $('cat'),
    catSrc,
    onCatch(x, y) {
      burst('spark', '✦', 5, x, y, 10);
      sfx.catch();
      haptic('medium');
      if (kind === 'mouse') react('joy', 'play', 500);
    },
    onEnd(catches, quit) {
      stopGame = null;
      document.body.classList.remove('in-game');
      setBackButton(null);
      if (quit && !catches) return showRequest(); // leaving at once does not count as a game
      const coins = finishGame(state, catches);
      lastGame = { kind, catches, coins };
      if (coins) { shown = null; react('hype', 'hype', 1600); hearts(3); sfx.meow(true); }
      afterActivity();
      openPanel('result');
    },
  });
  setBackButton(() => stopGame?.());
}

const refreshPanel = () => openName && ($('panelBody').innerHTML = panels[openName].render());

$('panelBody').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  audioOn();
  if (b.dataset.buy) buy(b.dataset.buy);
  else if (b.dataset.placeItem) { placeItem(state, b.dataset.placeItem); save(); renderRoom(b.dataset.placeItem); sfx.click(); }
  else if (b.dataset.target) { state.target = b.dataset.target; save(); renderGoal(); sfx.click(); }
  else if (b.dataset.breed) { state.breed = b.dataset.breed; save(); setPose('calm'); sfx.click(); }
  // shortcut: test-only cheat for the owner, remove (or hide) before friends play for real
  else if (b.dataset.god) { state.coins += 10000; state.crystals += 100; state.fish += 50; shown = null; save(); renderHud(); renderGoal(); sfx.buy(); haptic('success'); }
  else if (b.dataset.color) {
    const [itemId, colorId] = b.dataset.color.split(':');
    if (chooseColor(state, itemId, colorId)) { sfx.click(); save(); renderRoom(itemId); renderHud(); renderGoal(); }
    else { sfx.denied(); haptic('error'); }
  }
  else if (b.dataset.claimTask || b.dataset.claimAch) {
    const ok = b.dataset.claimTask ? claimTask(state, b.dataset.claimTask) : claimAchievement(state, b.dataset.claimAch);
    if (ok) { sfx.buy(); haptic('success'); shown = null; save(); renderHud(); }
  }
  else if (b.dataset.game) return playGame(b.dataset.game);
  else if (b.dataset.close) return closePanel();
  else if (b.dataset.buyBreed) {
    if (buyBreed(state, b.dataset.buyBreed)) { sfx.buy(); haptic('success'); save(); renderHud(); setPose('hype', 1800); }
  }
  refreshPanel();
});
$('panelBody').addEventListener('input', (e) => {
  if (e.target.id === 'soundOn') state.settings.sound = e.target.checked;
  if (e.target.id === 'volume') state.settings.volume = e.target.value / 100;
  if (e.target.id === 'motionOn') state.settings.motion = e.target.checked;
  if (e.target.id === 'musicOn') state.settings.music = e.target.checked;
  configureAudio(state.settings);
  audioOn();
  applyMotion();
  save();
});
$('panel').addEventListener('click', (e) => { if (e.target === $('panel')) closePanel(); }); // tap on backdrop
$('panel').addEventListener('close', closePanel);
$('panelClose').addEventListener('click', closePanel);

// ---------- wiring ----------
$('spinButton').addEventListener('click', spin);
$('lever').addEventListener('click', spin);
$('cat').addEventListener('click', onPet);
$('petButton').addEventListener('click', onPet);
$('playButton').addEventListener('click', () => {
  audioOn();
  wake();
  react('joy', 'play', 1200);
  openPanel('play');
});
$('goalCard').addEventListener('click', onGoal);
$('bowl').addEventListener('click', onFeed);
$('settingsButton').addEventListener('click', () => openPanel('settings'));
document.querySelectorAll('.nav button').forEach((b) => b.addEventListener('click', () => { sfx.click(); openPanel(b.dataset.panel); }));

setInterval(() => {
  const before = state.fish;
  regenFish(state);
  if (state.fish !== before) save();
  if (!stopGame && !spinning && maybeRequest(state)) {
    save();
    showRequest();
    haptic('light');
  }
  renderHud();
}, 1000);
document.addEventListener('visibilitychange', () => (document.visibilityState === 'visible' ? state && audioOn() : stopMusic()));
document.addEventListener('pointerdown', () => audioOn(), { once: true }); // music starts with the first tap anywhere

initTelegram();
state = await loadState();
configureAudio(state.settings);
applyMotion();
reels.forEach((reel, i) => { reel.dataset.symbol = ['paw', 'fish', 'yarn'][i]; reel.innerHTML = `<div class="cell" style="--cell:${reel.clientHeight}px">${symbolMarkup(reel.dataset.symbol)}</div>`; });
regenFish(state);
renderAll();
wake();
blinkLoop();
if (claimDailyGift(state)) {
  save();
  setTimeout(() => {
    say(`Ежедневный подарок: +${GIFT_FISH} 🐟`, 3000);
    burst('reward', `+${GIFT_FISH} 🐟`, 1, 50, 20, 0);
    renderHud();
  }, 700);
} else showRequest();
