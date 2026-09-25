const fs = require('fs');

const meta = JSON.parse(fs.readFileSync('scratch_student_meta.json', 'utf8'));
const rawBytes = fs.readFileSync('scratch_student_raw.bin');
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

// In Option A, let's see what is above cy=541 vs below cy=541
console.log('Numeric values of Option A (cx=296, cy=541):');
for (let dy = -6; dy <= 6; dy++) {
  let row = `dy=${dy >= 0 ? '+' + dy : dy}: `;
  for (let dx = -4; dx <= 4; dx++) {
    row += String(gray[(541 + dy) * w + (296 + dx)]).padStart(4, ' ');
  }
  console.log(row);
}

console.log('\nNumeric values of Option B (cx=314, cy=541):');
for (let dy = -6; dy <= 6; dy++) {
  let row = `dy=${dy >= 0 ? '+' + dy : dy}: `;
  for (let dx = -4; dx <= 4; dx++) {
    row += String(gray[(541 + dy) * w + (314 + dx)]).padStart(4, ' ');
  }
  console.log(row);
}
