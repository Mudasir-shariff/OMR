const fs = require('fs');

const meta = JSON.parse(fs.readFileSync('scratch_wa_meta.json', 'utf8'));
const raw = fs.readFileSync('scratch_wa_raw.bin');
const targetWidth = 1000;
const imgW = meta.width, imgH = meta.height;
const scale = targetWidth / imgW;
const w = targetWidth, h = Math.round(imgH * scale);
const gray = new Uint8Array(w * h);
for (let y = 0; y < h; y++) {
  const origY = Math.min(imgH - 1, Math.floor(y / scale));
  for (let x = 0; x < w; x++) {
    const origX = Math.min(imgW - 1, Math.floor(x / scale));
    const idx = (origY * imgW + origX) * 4;
    gray[y * w + x] = Math.round(0.299 * raw[idx] + 0.587 * raw[idx + 1] + 0.114 * raw[idx + 2]);
  }
}

// Let's inspect along x = 118 for dark dips (timing squares)
console.log('Sampling column around x=118:');
const dips = [];
for (let y = 200; y < 900; y++) {
  let minV = 255;
  for (let dx = -4; dx <= 4; dx++) {
    const v = gray[y * w + 118 + dx];
    if (v < minV) minV = v;
  }
  if (minV < 110) {
    dips.push({ y, minV });
  }
}

console.log('Found dips < 110:', dips.length);
console.log('First 20 dips:', dips.slice(0, 20));

// Check paper background luminance near x=118
let bgSum = 0, bgCount = 0;
for (let y = 250; y < 850; y += 10) {
  for (let x = 100; x < 110; x++) {
    bgSum += gray[y * w + x];
    bgCount++;
  }
}
console.log('Paper background near x=105:', bgSum / bgCount);
