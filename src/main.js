import { SYMBOLS, spinReels, evaluate } from './game/slot.js';
import { applySpin, regenFish, msToNextFish, pet, buyItem, placeItem, buyBreed, FISH_CAP } from './game/state.js';
import { ITEMS, PLACES, BREEDS, itemById } from './data/content.js';
import { loadState, saveState } from './platform/storage.js';
import { initTelegram, haptic, setBackButton, inTelegram } from './platform/telegram.js';
import { sfx, unlockAudio, configureAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const asset = (name) => `assets/${name}.webp`;
const catSrc = (pose) => `assets/cats/${state.breed}-${pose}.webp`;
const reels = [0, 1, 2].map((i) => $(`reel${i}`));
const symbolById = Object.fromEntries(SYMBOLS.map((s) => [s.id, s]));
const systemReduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const motionOn = () => state.settings.motion ?? !systemReduce;
const applyMotion = () => document.body.classList.toggle('no-motion', !motionOn());

let state;
let spinning = false;
let shown = null; // currency values on screen; lag behind state while reels spin
let pose = 'calm';
let poseTimer = null;
let idleTimer = null;
let bubbleTimer = null;
let saveWarned = false;

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
    if (el.dataset.item === item.id) continue;
    el.dataset.item = item.id;
    el.innerHTML = `<img src="${asset(item.img)}" alt="${item.name}"${item.id === justPlaced ? ' class="appear"' : ''}>`;
  }
}

const renderAll = (justPlaced) => { renderHud(); renderGoal(); renderRoom(justPlaced); setPose(pose); };

// ---------- cat ----------
function setPose(next, ms = 0) {
  pose = next;
  $('catImg').src = catSrc(next);
  clearTimeout(poseTimer);
  if (ms) poseTimer = setTimeout(() => setPose('calm'), ms);
}

function react(className, nextPose, ms) {
  const cat = $('cat');
  cat.classList.remove('joy', 'hype');
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
  bubbleTimer = setTimeout(() => { bubble.hidden = true; }, ms);
}

function hearts(count = 3) {
  const fx = $('fx');
  for (let i = 0; i < count; i++) {
    const h = document.createElement('span');
    h.className = 'heart';
    h.textContent = '♥';
    h.style.left = `${42 + Math.random() * 16}%`;
    h.style.top = `${24 + Math.random() * 6}%`;
    h.style.animationDelay = `${i * 120}ms`;
    fx.append(h);
    setTimeout(() => h.remove(), 1400 + i * 120);
  }
}

function onPet() {
  unlockAudio();
  wake();
  const gotFish = pet(state);
  react(null, 'pet', 1200);
  hearts();
  sfx.purr();
  haptic('soft');
  if (gotFish) {
    shown = null;
    say('Мур! Держи рыбку 🐟');
  } else if (state.pets.count % 10 === 5) say('Мур-мур…');
  save();
  renderHud();
}

// ---------- slot ----------
function symbolMarkup(id) {
  const s = symbolById[id];
  return s.img ? `<img class="sym" src="${asset(s.img)}" alt="${s.name}">` : `<span class="sym emoji" role="img" aria-label="${s.name}">${s.emoji}</span>`;
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
  unlockAudio();
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
  react(null, 'wait');

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
  if (coins) flyCoins($('reel1'), 'coinsPill', Math.min(8, 2 + Math.round(coins / 15)));
  if (fish) flyCoins($('reel1'), 'fishPill', 3);
  setTimeout(() => { shown = null; renderHud(); renderGoal(); }, motionOn() ? 650 : 0);

  if (result.kind === 'none') react(null, 'calm');
  else if (result.kind === 'pair') { react('joy', 'joy', 1300); haptic('light'); }
  else if (['paw', 'crystal', 'fish'].includes(result.kind)) { react('hype', 'hype', 2200); haptic('success'); hearts(5); }
  else if (result.kind === 'bell') { react('hype', 'super', 1800); haptic('success'); }
  else { react('joy', 'happy', 1500); haptic('success'); }
  if (state.target && state.coins >= itemById(state.target).price && state.coins - coins < itemById(state.target).price) {
    setTimeout(() => say(`Хватает на «${itemById(state.target).name}»! Жми на карточку`, 3000), 900);
  }
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
  say('Ура, обновка! 💛');
  return true;
}

function onGoal() {
  unlockAudio();
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
        return `<div class="card"><img src="${asset(item.img)}" alt=""><b>${item.name}</b>${button}</div>`;
      }).join('') || '<div class="card missing">Пока нет картинки предмета</div>';
      return `<h3>${place.name}</h3><div class="grid">${cards}</div>`;
    }).join('') + '<p class="note">Расцветки вещей появятся, когда будут готовы их картинки.</p>',
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
    render: () => '<p>Дневные задания и просьбы Алекса появятся на этапе 3.</p><p class="note">Пока: гладь Алекса — каждые 10 поглаживаний дают рыбку (до 10 в день).</p>',
  },
  settings: {
    title: 'Настройки',
    render: () => `
      <div class="row"><label for="soundOn">Звук</label><input type="checkbox" id="soundOn" ${state.settings.sound ? 'checked' : ''}></div>
      <div class="row"><label for="volume">Громкость</label><input type="range" id="volume" min="0" max="100" value="${Math.round(state.settings.volume * 100)}"></div>
      <div class="row"><label for="motionOn">Анимации</label><input type="checkbox" id="motionOn" ${motionOn() ? 'checked' : ''}></div>
      <h3>Выплаты</h3>
      <table class="paytable">
        <tr><td>🐾🐾🐾</td><td>150 🪙</td></tr><tr><td>💎💎💎</td><td>3 💎</td></tr><tr><td>🐟🐟🐟</td><td>5 🐟</td></tr>
        <tr><td>🔔🔔🔔</td><td>75 🪙</td></tr><tr><td>🧶🧶🧶</td><td>40 🪙</td></tr><tr><td>🪙🪙🪙</td><td>25 🪙</td></tr>
        <tr><td>Пара 💎</td><td>1 💎</td></tr><tr><td>Любая другая пара</td><td>6 🪙</td></tr>
      </table>
      <p class="note">🐾 лапка заменяет любой символ. Прокрутка стоит 1 🐟, рыбки восполняются: +1 каждые 3 минуты до ${FISH_CAP}.</p>
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
const refreshPanel = () => openName && ($('panelBody').innerHTML = panels[openName].render());

$('panelBody').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  unlockAudio();
  if (b.dataset.buy) buy(b.dataset.buy);
  else if (b.dataset.placeItem) { placeItem(state, b.dataset.placeItem); save(); renderRoom(b.dataset.placeItem); sfx.click(); }
  else if (b.dataset.target) { state.target = b.dataset.target; save(); renderGoal(); sfx.click(); }
  else if (b.dataset.breed) { state.breed = b.dataset.breed; save(); setPose('calm'); sfx.click(); }
  else if (b.dataset.buyBreed) {
    if (buyBreed(state, b.dataset.buyBreed)) { sfx.buy(); haptic('success'); save(); renderHud(); setPose('hype', 1800); }
  }
  refreshPanel();
});
$('panelBody').addEventListener('input', (e) => {
  if (e.target.id === 'soundOn') state.settings.sound = e.target.checked;
  if (e.target.id === 'volume') state.settings.volume = e.target.value / 100;
  if (e.target.id === 'motionOn') state.settings.motion = e.target.checked;
  configureAudio(state.settings);
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
  unlockAudio();
  wake();
  react('joy', 'play', 1500);
  say('Мини-игры с мышкой и лазером скоро! 🐭');
});
$('goalCard').addEventListener('click', onGoal);
$('settingsButton').addEventListener('click', () => openPanel('settings'));
document.querySelectorAll('.nav button').forEach((b) => b.addEventListener('click', () => { sfx.click(); openPanel(b.dataset.panel); }));

setInterval(() => {
  const before = state.fish;
  regenFish(state);
  if (state.fish !== before) save();
  renderHud();
}, 1000);

initTelegram();
state = await loadState();
configureAudio(state.settings);
applyMotion();
reels.forEach((reel, i) => { reel.dataset.symbol = ['paw', 'fish', 'yarn'][i]; reel.innerHTML = `<div class="cell" style="--cell:${reel.clientHeight}px">${symbolMarkup(reel.dataset.symbol)}</div>`; });
regenFish(state);
renderAll();
wake();
blinkLoop();
