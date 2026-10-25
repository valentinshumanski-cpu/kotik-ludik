// Turns ChatGPT masters (Refs/) into small game WebP files in public/assets/.
// Run: npm run assets
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const OUT = 'public/assets';
const OBJ = 'Refs/Refs_Objects/objects';
const CATS = 'Refs/Refs';
const NEW = 'Refs/Новые рефы/Котик-лудик-новые-материалы-2026-10-25/Refs/New';
const NEW_CATS = 'Refs/Новые рефы/Котики_Еда_Бег_2026-10-25/Refs/New';

// [output name, source, max side in px]
const objects = [
  ['floor', `${OBJ}/env-002-floor.png`, 1280],
  ['window-frame', `${OBJ}/env-003-window-frame.png`, 640],
  ['window-view', `${OBJ}/env-007-window-landscape.png`, 640],
  ['curtain-left', `${OBJ}/env-004-curtain-left.png`, 512],
  ['curtain-right', `${OBJ}/env-005-curtain-right.png`, 512],
  ['windowsill', `${OBJ}/env-006-windowsill.png`, 640],
  ['bookcase', `${OBJ}/env-009-bookcase.png`, 640],
  ['rug', `${OBJ}/env-013-rug.png`, 768],
  ['cat-bed', `${OBJ}/env-014-cat-bed.png`, 512],
  ['lamp', `${OBJ}/env-016-pendant-lamp.png`, 384],
  ['plant-large', `${OBJ}/prop-001-large-plant.png`, 512],
  ['plant-trailing', `${OBJ}/prop-002-trailing-plant.png`, 384],
  ['plant-flowers', `${OBJ}/prop-003-pink-flowers.png`, 384],
  ['book-blue', `${OBJ}/prop-004-a-book-blue.png`, 192],
  ['book-ochre', `${OBJ}/prop-004-b-book-ochre.png`, 192],
  ['book-burgundy', `${OBJ}/prop-004-c-book-burgundy.png`, 192],
  ['nightlight', `${OBJ}/prop-006-paw-nightlight.png`, 256],
  ['photo-frame', `${OBJ}/prop-007-photo-frame.png`, 256],
  ['toy-mouse', `${OBJ}/prop-008-toy-mouse.png`, 384],
  ['yarn', `${OBJ}/prop-009-yarn-ball.png`, 384],
  ['scratcher', `${OBJ}/prop-010-scratching-house.png`, 512],
  ['cushion', `${OBJ}/prop-011-cabinet-cushion.png`, 512],
  ['cabinet', `${OBJ}/slot-001-cabinet-approved-v2.png`, 1024],
  ['lever', `${OBJ}/slot-002-lever.png`, 384],
  ['reel-backing', `${OBJ}/slot-003-reel-backing.png`, 256],
  // order 2026-10-25
  ...['sym-coin', 'sym-yarn', 'sym-bell', 'sym-fish', 'sym-paw', 'sym-crystal'].map((n) => [n, `${NEW}/${n}.png`, 192]),
  ...['nav-room', 'nav-collection', 'nav-shop', 'nav-tasks', 'icon-settings'].map((n) => [n, `${NEW}/${n}.png`, 128]),
  ...['bowl-ceramic-empty', 'bowl-ceramic-full', 'bowl-metal-empty', 'bowl-metal-full'].map((n) => [n, `${NEW}/${n}.png`, 320]),
  ...['cat-bed-blue', 'cat-bed-mint', 'scratcher-blue', 'scratcher-mint', 'bed-basket', 'scratcher-post'].map((n) => [n, `${NEW}/${n}.png`, 512]),
  ...['rug-blue', 'rug-mint', 'rug-square'].map((n) => [n, `${NEW}/${n}.png`, 768]),
  ['toy-ball-bell', `${NEW}/toy-ball-bell.png`, 384],
  ['wall', `${NEW}/wall-9x16.png`, 900],
];

const breeds = { ginger: '1. Рыжий/Рыжий', persian: '2. Персидский/Персидский', sphynx: '3. Сфинкс/Сфинкс_канадский' };
const poses = {
  calm: '01_Спокойный', joy: '02_Радостный', happy: '03_Счастливый', super: '04_Очень_счастливый', hype: '05_Восторг_hype',
  blink: '06_Моргание', wait: '07_Ожидание', pet: '08_Поглаживание', play: '09_Игра', sleep: '10_Сон',
  eat: '14_Еда', run: '15_Бег',
};
const NEW_POSES = new Set(['eat', 'run']); // these come from the 2026-10-25 order folder

fs.mkdirSync(`${OUT}/cats`, { recursive: true });
let total = 0;
const write = async (pipeline, file) => {
  await pipeline.webp({ quality: 84, alphaQuality: 90, effort: 5 }).toFile(file);
  total += fs.statSync(file).size;
};

for (const [name, src, max] of objects) {
  const img = sharp(src).trim({ threshold: 8 }).resize(max, max, { fit: 'inside', withoutEnlargement: true });
  const file = `${OUT}/${name}.webp`;
  await write(img, file);
}
// Cats keep the shared 768 canvas (paw line at y=640) so every pose stands on the same spot.
for (const [breed, prefix] of Object.entries(breeds)) {
  for (const [pose, suffix] of Object.entries(poses)) {
    const src = NEW_POSES.has(pose) ? `${NEW_CATS}/${path.basename(prefix)}_${suffix}.png` : `${CATS}/${prefix}_${suffix}.png`;
    await write(sharp(src).resize(384, 384), `${OUT}/cats/${breed}-${pose}.webp`);
  }
}
console.log(`${objects.length} objects + ${Object.keys(breeds).length * Object.keys(poses).length} cat poses, ${(total / 1024).toFixed(0)} KB total`);
