const fs = require('fs');

const meta = JSON.parse(fs.readFileSync('scratch_wa_meta.json', 'utf8'));
const raw = fs.readFileSync('scratch_wa_raw.bin');
const targetWidth = 1000;
const scale = targetWidth / meta.width;
const w = targetWidth, h = Math.round(meta.height * scale);
const gray = new Uint8Array(w * h);
for (let y = 0; y < h; y++) {
  const origY = Math.min(meta.height - 1, Math.floor(y / scale));
  for (let x = 0; x < w; x++) {
    const origX = Math.min(meta.width - 1, Math.floor(x / scale));
    const idx = (origY * meta.width + origX) * 4;
    gray[y * w + x] = Math.round(0.299 * raw[idx] + 0.587 * raw[idx + 1] + 0.114 * raw[idx + 2]);
  }
}

// Col 3 has 4 bubbles A, B, C, D around X=412..460
// Let's scan along X=412 (where option 1 / A of Col 3 is)
console.log('Scanning column X=412 (Col 3 option 1) for bubble centers:');
const dips = [];
for (let y = 180; y < 900; y++) {
  let minV = 255;
  for (let dx = -3; dx <= 3; dx++) {
    const v = gray[y * w + 412 + dx];
    if (v < minV) minV = v;
  }
  dips.push({ y, minV });
}

// Find local minima
const localMinima = [];
for (let i = 2; i < dips.length - 2; i++) {
  const v = dips[i].minV;
  if (v < 130 && v <= dips[i-1].minV && v <= dips[i-2].minV && v < dips[i+1].minV && v <= dips[i+2].minV) {
    localMinima.push({ y: dips[i].y, v });
  }
}

console.log('Found bubble rows in Col 3 (n=' + localMinima.length + '):');
for (let i = 0; i < localMinima.length; i++) {
  const diff = i > 0 ? (localMinima[i].y - localMinima[i-1].y) : 0;
  console.log(`  Row ${i+1}: y=${localMinima[i].y}, diff=${diff}, val=${localMinima[i].v}`);
}
