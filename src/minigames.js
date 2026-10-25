// Two 20-second mini-games played on the room floor. Positions are % of the stage.
// The game only reports catches; rewards are decided by game/progress.js.
const DURATION = 20000;
const FLOOR = { top: 78, bottom: 90, left: 6, right: 94 }; // rug area in front of the machine (nav is hidden during games)
const ASPECT = 16 / 9; // stage height / width, to measure distances in width units
const rand = (a, b) => a + Math.random() * (b - a);

const GAMES = {
  mouse: { title: '🐭 Поймай мышку', hint: 'Тапай по мышкам!', run: runMouse },
  laser: { title: '🔴 Лазерная точка', hint: 'Води точку пальцем — Алекс ловит, пока она бегает', run: runLaser },
};

export function startGame(kind, { stage, cat, catSrc, onCatch, onEnd }) {
  const game = GAMES[kind];
  const layer = document.createElement('div');
  layer.className = 'game-layer';
  layer.innerHTML = `<div class="game-bar"><b>${game.title}</b><span>Поймано: <b class="game-score">0</b></span><span class="game-time">20</span><button class="game-quit" aria-label="Выйти">×</button></div>
    <p class="game-hint">${game.hint}</p>`;
  stage.append(layer);

  let catches = 0;
  let ended = false;
  const startedAt = performance.now();
  const ctx = {
    layer, cat, catSrc,
    get over() { return ended; },
    get count() { return catches; },
    caught(x, y) {
      catches += 1;
      layer.querySelector('.game-score').textContent = catches;
      onCatch(x, y);
    },
  };
  const cleanupGame = game.run(ctx);
  const clock = setInterval(() => {
    const left = Math.max(0, DURATION - (performance.now() - startedAt));
    layer.querySelector('.game-time').textContent = Math.ceil(left / 1000);
    if (!left) end();
  }, 100);

  function end(quit = false) {
    if (ended) return;
    ended = true;
    clearInterval(clock);
    cleanupGame();
    layer.remove();
    onEnd(catches, quit);
  }
  layer.querySelector('.game-quit').addEventListener('click', () => end(true));
  return () => end(true);
}

// ---------- Catch the mouse: tap mice running across the rug, they get faster ----------
function runMouse(game) {
  let timer = null;
  let current = null;
  function spawn() {
    if (game.over) return;
    const fromLeft = Math.random() < 0.5;
    const y = rand(FLOOR.top - 2, FLOOR.bottom - 6);
    const runner = document.createElement('button');
    runner.className = 'runner';
    runner.setAttribute('aria-label', 'Мышка');
    runner.style.top = `${y}%`;
    if (!fromLeft) runner.style.transform = 'scaleX(-1)'; // the sprite faces right
    runner.innerHTML = '<img src="assets/toy-mouse.webp" alt="">';
    game.layer.append(runner);
    const duration = Math.max(950, 2300 - game.count * 110);
    const run = runner.animate([{ left: fromLeft ? '-20%' : '104%' }, { left: fromLeft ? '104%' : '-20%' }], { duration, easing: 'linear' });
    current = { runner, run };
    run.onfinish = () => { runner.remove(); timer = setTimeout(spawn, 250); };
    runner.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      run.onfinish = null;
      run.pause();
      const s = game.layer.getBoundingClientRect();
      const r = runner.getBoundingClientRect();
      game.caught(((r.left + r.width / 2 - s.left) / s.width) * 100, y);
      runner.classList.add('caught');
      setTimeout(() => runner.remove(), 300);
      timer = setTimeout(spawn, 380);
    }, { once: true });
  }
  timer = setTimeout(spawn, 600);
  return () => { clearTimeout(timer); current?.run.cancel(); };
}

// ---------- Laser dot: lead the dot, Alex chases it only while it moves ----------
function runLaser(game) {
  const SPEED = 42; // % of stage width per second
  const dot = document.createElement('div');
  dot.className = 'laser-dot';
  const chaser = document.createElement('img');
  chaser.className = 'chaser';
  chaser.alt = '';
  game.layer.append(chaser, dot);
  game.cat.classList.add('away'); // Alex jumps off the machine for this one

  const pos = { x: 50, y: 86 };
  const target = { x: rand(20, 80), y: rand(FLOOR.top, FLOOR.bottom) };
  let movedAt = 0;
  let armed = true; // after a catch the dot must get away before it can be caught again
  let restUntil = 0;
  let pose = '';
  let frame = 0;
  let last = performance.now();

  const setPose = (p) => { if (p !== pose) { pose = p; chaser.src = game.catSrc(p); } };
  const place = (el, p) => { el.style.left = `${p.x}%`; el.style.top = `${p.y}%`; };
  place(dot, target);

  function onMove(e) {
    if (e.pointerType !== 'mouse' && !e.buttons) return;
    if (e.target.closest('.game-bar')) return;
    const s = game.layer.getBoundingClientRect();
    const x = Math.min(FLOOR.right, Math.max(FLOOR.left, ((e.clientX - s.left) / s.width) * 100));
    const y = Math.min(FLOOR.bottom, Math.max(FLOOR.top, ((e.clientY - s.top) / s.height) * 100));
    if (Math.hypot(x - target.x, (y - target.y) * ASPECT) > 0.6) movedAt = performance.now();
    target.x = x;
    target.y = y;
    place(dot, target);
  }
  game.layer.addEventListener('pointermove', onMove);
  game.layer.addEventListener('pointerdown', onMove);

  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const dx = target.x - pos.x;
    const dy = (target.y - pos.y) * ASPECT;
    const dist = Math.hypot(dx, dy);
    if (dist > 22) armed = true;
    if (now < restUntil) setPose('hype');
    else if (now - movedAt < 700 && dist > 1) {
      const step = Math.min(dist, SPEED * dt);
      pos.x += (dx / dist) * step;
      pos.y += ((dy / dist) * step) / ASPECT;
      setPose('run');
      chaser.style.transform = `translate(-50%, -83%) scaleX(${dx < 0 ? -1 : 1})`;
      if (armed && dist < 7) {
        armed = false;
        restUntil = now + 650;
        game.caught(target.x, target.y);
      }
    } else setPose('wait'); // dot is still: Alex just watches it
    place(chaser, pos);
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
  return () => { cancelAnimationFrame(frame); game.cat.classList.remove('away'); };
}
