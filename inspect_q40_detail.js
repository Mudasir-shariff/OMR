const fs = require('fs');

const scannerCode = fs.readFileSync('scanner.js', 'utf8');
eval(scannerCode + '\n global.omrScanner = omrScanner;');

function loadTestImage(prefix) {
  const meta = JSON.parse(fs.readFileSync(`scratch_${prefix}_meta.json`, 'utf8'));
  const rawBytes = fs.readFileSync(`scratch_${prefix}_raw.bin`);
  return {
    width: meta.width,
    height: meta.height,
    data: new Uint8Array(rawBytes)
  };
}

const keyImg = loadTestImage('key');
const res = omrScanner._processImage(keyImg, 200);

const q40 = res.bubbleDetails.find(b => b.q === 40);
console.log('Q40 detail:', q40);
