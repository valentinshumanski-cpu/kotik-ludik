import sharp from 'sharp';
import fs from 'node:fs';
const dir = process.argv[2];
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.png'))) {
  const img = sharp(`${dir}/${f}`);
  const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1, semi = 0, opaque = 0, full = 0;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    const a = data[(y * info.width + x) * 4 + 3];
    if (a > 8) { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
    if (a > 8 && a < 247) semi++; else if (a >= 247) opaque++;
  }
  console.log(f.padEnd(40), `${info.width}x${info.height}`, `bbox ${minX},${minY}-${maxX},${maxY}`, `semi ${(100*semi/(semi+opaque)).toFixed(1)}%`);
}
