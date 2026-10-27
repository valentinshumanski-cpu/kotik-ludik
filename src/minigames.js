// Three 20-second mini-games played on the living room floor. Positions are % of the stage.
// The game only reports catches; rewards are decided by game/progress.js.
const DURATION = 20000;
const FLOOR = { top: 68, bottom: 90, left: 6, right: 94 }; // living room floor below the armchair (nav is hidden during games)
const ASPECT = 16 / 9; // stage height / width, to measure distances in width units
const rand = (a, b) => a + Math.random() * (b - a);

const GAMES = {
  mouse: { title: '🐭 Поймай мышку', hint: 'Тапай по мышкам!', run: runMouse },
  laser: { title: '🔴 Лазерная точка', hint: 'Води точку пальцем — Алекс ловит, пока она бегает', run: runLaser },
  ball: { title: '🔔 Мячик', hint: 'Тапни по мячу — Алекс побежит за ним!', run: runBall },
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

// ---------- Ball: kick the ball, it rolls, hops and bounces softly off the walls; Alex chases it ----------
// Floor is seen from the front: x across, y into the room (both stored in % of the stage), z = height of the hop.
function runBall(game) {
  const CAT_SPEED = 36; // % of stage width per second, slower than a kicked ball so the chase lasts
  const KICK = 70;
  const GRAVITY = 160; // cqw per second²
  const BOUNCE = 0.72; // walls and floor give back a bit less each time
  const ball = document.createElement('img');
  ball.className = 'ball';
  ball.src = 'assets/toy-ball-bell.webp';
  ball.alt = '';
  const shadow = document.createElement('div');
  shadow.className = 'ball-shadow';
  const chaser = document.createElement('img');
  chaser.className = 'chaser';
  chaser.alt = '';
  game.layer.append(shadow, chaser, ball);
  game.cat.classList.add('away');

  const b = { x: 75, y: 80, z: 0, vx: -45, vy: -10, vz: 40, spin: 0 }; // starts with a roll so the chase begins
  const cat = { x: 30, y: 86 };
  let armed = true;
  let restUntil = 0;
  let pose = '';
  let frame = 0;
  let last = performance.now();
  const setPose = (p) => { if (p !== pose) { pose = p; chaser.src = game.catSrc(p); } };

  function kick(fromX, fromY, power) {
    const dx = b.x - fromX;
    const dy = (b.y - fromY) * ASPECT;
    const d = Math.hypot(dx, dy) || 1;
    const angle = Math.atan2(dy, dx) + rand(-0.4, 0.4);
    b.vx = Math.cos(angle) * power;
    b.vy = Math.sin(angle) * power * 0.6 + (d === 1 ? rand(-20, 20) : 0);
    b.vz = rand(30, 55);
  }

  game.layer.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.game-bar')) return;
    const s = game.layer.getBoundingClientRect();
    const px = ((e.clientX - s.left) / s.width) * 100;
    const py = ((e.clientY - s.top) / s.height) * 100;
    if (Math.hypot(px - b.x, (py - (b.y - 3)) * ASPECT) < 14) kick(px, py + 3, KICK); // generous hit area for fingers
  });

  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    // ball
    b.z += b.vz * dt;
    b.vz -= GRAVITY * dt;
    if (b.z <= 0) { b.z = 0; b.vz = Math.abs(b.vz) > 12 ? -b.vz * 0.5 : 0; }
    const drag = Math.exp((b.z > 0 ? -0.3 : -1.4) * dt);
    b.vx *= drag;
    b.vy *= drag;
    b.x += b.vx * dt;
    b.y += (b.vy * dt) / ASPECT;
    if (b.x < FLOOR.left + 3) { b.x = FLOOR.left + 3; b.vx = Math.abs(b.vx) * BOUNCE; }
    if (b.x > FLOOR.right - 3) { b.x = FLOOR.right - 3; b.vx = -Math.abs(b.vx) * BOUNCE; }
    if (b.y < FLOOR.top + 4) { b.y = FLOOR.top + 4; b.vy = Math.abs(b.vy) * BOUNCE; }
    if (b.y > FLOOR.bottom) { b.y = FLOOR.bottom; b.vy = -Math.abs(b.vy) * BOUNCE; }
    const speed = Math.hypot(b.vx, b.vy);
    b.spin += b.vx * dt * 12;

    // cat
    const dx = b.x - cat.x;
    const dy = (b.y - cat.y) * ASPECT;
    const dist = Math.hypot(dx, dy);
    if (dist > 18) armed = true;
    if (now < restUntil) setPose('hype');
    else if ((speed > 3 || b.z > 0) && dist > 2) {
      const step = Math.min(dist, CAT_SPEED * dt);
      cat.x += (dx / dist) * step;
      cat.y += ((dy / dist) * step) / ASPECT;
      setPose('run');
      chaser.style.transform = `translate(-50%, -83%) scaleX(${dx < 0 ? -1 : 1})`;
      if (armed && dist < 8 && b.z < 4) {
        armed = false;
        restUntil = now + 700;
        game.caught(b.x, b.y);
        kick(cat.x, cat.y, 50); // Alex swats it away and the chase goes on
      }
    } else setPose('wait'); // the ball stopped: Alex waits for the next kick

    ball.style.left = `${b.x}%`;
    ball.style.top = `${b.y}%`;
    ball.style.transform = `translate(-50%, -100%) translateY(${-b.z}cqw) rotate(${b.spin}deg)`;
    shadow.style.left = `${b.x}%`;
    shadow.style.top = `${b.y}%`;
    shadow.style.opacity = String(Math.max(0.15, 0.45 - b.z / 60));
    chaser.style.left = `${cat.x}%`;
    chaser.style.top = `${cat.y}%`;
    frame = requestAnimationFrame(tick);
  }
  frame = requestAnimationFrame(tick);
  return () => { cancelAnimationFrame(frame); game.cat.classList.remove('away'); };
}
