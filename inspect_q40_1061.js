const fs = require('fs');

const meta = JSON.parse(fs.readFileSync('scratch_key_meta.json', 'utf8'));
const rawBytes = fs.readFileSync('scratch_key_raw.bin');
const w = 1000, h = Math.round(meta.height * (1000 / meta.width));
const scale = 1000 / meta.width;

const gray = new Uint8Array(w * h);
for (let y = 0; y < h; y++) {
  const origY = Math.min(meta.height - 1, Math.floor(y / scale));
  for (let x = 0; x < w; x++) {
    const origX = Math.min(meta.width - 1, Math.floor(x / scale));
    const idx = (origY * meta.width + origX) * 4;
    gray[y * w + x] = Math.round(0.299 * rawBytes[idx] + 0.587 * rawBytes[idx + 1] + 0.114 * rawBytes[idx + 2]);
  }
}

const cy = 1061;
console.log('--- Option D of Q40 (cx=202, cy=1061) ---');
for (let dy = -4; dy <= 4; dy++) {
  let row = '';
  for (let dx = -4; dx <= 4; dx++) {
    const v = gray[(cy + dy) * w + (202 + dx)];
    row += String(v).padStart(4, ' ') + ' ';
  }
  console.log(row);
}

console.log('\n--- Option A of Q40 (cx=94, cy=1061) ---');
for (let dy = -4; dy <= 4; dy++) {
  let row = '';
  for (let dx = -4; dx <= 4; dx++) {
    const v = gray[(cy + dy) * w + (94 + dx)];
    row += String(v).padStart(4, ' ') + ' ';
  }
  console.log(row);
}
