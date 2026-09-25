const fs = require('fs');

const scannerCode = fs.readFileSync('scanner.js', 'utf8');
eval(scannerCode + '\n global.omrScanner = omrScanner;');

function getGray(metaPath, rawPath) {
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  const raw = fs.readFileSync(rawPath);
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
  return { gray, w, h };
}

const s = getGray('scratch_student_meta.json', 'scratch_student_raw.bin');
const wa = getGray('scratch_wa_meta.json', 'scratch_wa_raw.bin');

const sPaper = omrScanner._findPaperBounds(s.gray, s.w, s.h);
const waPaper = omrScanner._findPaperBounds(wa.gray, wa.w, wa.h);
console.log('Student Paper:', sPaper);
console.log('WA Paper:', waPaper);

const sGeom = omrScanner._calibrate(s.gray, s.w, s.h);
const waGeom = omrScanner._calibrate(wa.gray, wa.w, wa.h);

console.log('Student Col 1 optX:', sGeom.columns[0].optX);
console.log('WA Col 1 optX:', waGeom.columns[0].optX);

console.log('Student Col 2 optX:', sGeom.columns[1].optX);
console.log('WA Col 2 optX:', waGeom.columns[1].optX);

console.log('Student Col 3 optX:', sGeom.columns[2].optX);
console.log('WA Col 3 optX:', waGeom.columns[2].optX);
