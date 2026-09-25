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

// In key sheet, Q40 is the last question in Col 1 (row 39).
// Col 1 optX: [17 + 205*0.3732, 17+205*0.5537, 17+205*0.7244, 17+205*0.9024] = [93.5, 130.5, 165.5, 202.0]
// cy = 96 + 39 * 23.86 = 1026.5
const cy40 = Math.round(96 + 39 * 23.86);
console.log('Q40 cy =', cy40);

const opts = [94, 131, 166, 202];
opts.forEach((cx, i) => {
  console.log(`\n--- Q40 Option ${['A','B','C','D'][i]} (cx=${cx}, cy=${cy40}) ---`);
  for (let dy = -4; dy <= 4; dy++) {
    let row = '';
    for (let dx = -4; dx <= 4; dx++) {
      const v = gray[(cy40 + dy) * w + (cx + dx)];
      row += String(v).padStart(4, ' ') + ' ';
    }
    console.log(row);
  }
});
