// Contact sheet of new art on a checkerboard, with alpha bbox info printed.
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const [dir, out, cell = '220'] = process.argv.slice(2);
const C = Number(cell);
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
const cols = 6;
const rows = Math.ceil(files.length / cols);
const tiles = [];
for (const [i, f] of files.entries()) {
  const img = sharp(path.join(dir, f));
  const meta = await img.metadata();
  const { data, info } = await sharp(path.join(dir, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, semi = 0, vis = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const a = data[(y * info.width + x) * 4 + 3];
    if (a > 8) { vis++; if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (a < 247) semi++; }
  }
  console.log(`${f.padEnd(34)} ${meta.width}x${meta.height} alpha:${meta.hasAlpha} bbox ${minX},${minY}-${maxX},${maxY} semi ${(100 * semi / Math.max(1, vis)).toFixed(1)}%`);
  const buf = await sharp(path.join(dir, f)).resize(C - 10, C - 30, { fit: 'inside' }).png().toBuffer();
  const label = Buffer.from(`<svg width="${C}" height="20"><text x="4" y="14" font-size="12" font-family="sans-serif">${f.replace('.png', '')}</text></svg>`);
  tiles.push({ input: buf, left: (i % cols) * C + 5, top: Math.floor(i / cols) * C + 5 });
  tiles.push({ input: label, left: (i % cols) * C, top: Math.floor(i / cols) * C + C - 20 });
}
const W = cols * C, H = rows * C;
const sq = 16;
const checker = Buffer.from(`<svg width="${W}" height="${H}"><defs><pattern id="p" width="${sq * 2}" height="${sq * 2}" patternUnits="userSpaceOnUse"><rect width="${sq * 2}" height="${sq * 2}" fill="#ddd"/><rect width="${sq}" height="${sq}" fill="#fff"/><rect x="${sq}" y="${sq}" width="${sq}" height="${sq}" fill="#fff"/></pattern></defs><rect width="100%" height="100%" fill="url(#p)"/></svg>`);
await sharp(checker).composite(tiles).png().toFile(out);
