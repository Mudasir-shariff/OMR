const fs = require('fs');

const scannerCode = fs.readFileSync('scanner.js', 'utf8');
eval(scannerCode + '\n global.omrScanner = omrScanner;');

const meta = JSON.parse(fs.readFileSync('scratch_wa_meta.json', 'utf8'));
const raw = fs.readFileSync('scratch_wa_raw.bin');

const targetWidth = 1000;
const imgW = meta.width;
const imgH = meta.height;
const scale = targetWidth / imgW;
const w = targetWidth;
const h = Math.round(imgH * scale);

const gray = new Uint8Array(w * h);
for (let y = 0; y < h; y++) {
  const origY = Math.min(imgH - 1, Math.floor(y / scale));
  for (let x = 0; x < w; x++) {
    const origX = Math.min(imgW - 1, Math.floor(x / scale));
    const idx = (origY * imgW + origX) * 4;
    gray[y * w + x] = Math.round(0.299 * raw[idx] + 0.587 * raw[idx + 1] + 0.114 * raw[idx + 2]);
  }
}

console.log('Image dimensions scaled:', w, 'x', h);
const paper = omrScanner._findPaperBounds(gray, w, h);
console.log('Paper bounds:', paper);

// Check brightness histogram
let sum = 0;
for (let i = 0; i < w * h; i++) sum += gray[i];
console.log('Average image gray:', sum / (w * h));

const squares = omrScanner._findSquares(gray, w, h, paper);
console.log('Squares found:', squares.length);

const tracks = omrScanner._clusterTracks(squares, w);
console.log('Tracks found:', tracks.map(t => ({ meanX: t.meanX, count: t.items.length, minY: t.minY, maxY: t.maxY })));

const geom = omrScanner._calibrate(gray, w, h);
console.log('Geom layout:', geom.layout);
console.log('Geom topY:', geom.topY, 'botY:', geom.botY, 'rowPitch:', geom.rowPitch);
console.log('Columns:', geom.columns.map(c => ({ col: c.col, startQ: c.startQ, endQ: c.endQ, optX0: c.optX[0], optX3: c.optX[3] })));
