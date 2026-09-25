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

const searchY0 = Math.round(h * 0.10);
const searchY1 = Math.round(h * 0.92);
const binary = new Uint8Array(w * h);
for (let y = searchY0; y < searchY1; y++) {
  const rowOffset = y * w;
  for (let x = 0; x < w; x++) {
    if (gray[rowOffset + x] < 115) binary[rowOffset + x] = 1;
  }
}

const visited = new Uint8Array(w * h);
const squares = [];
const minS = Math.round(w * 0.005);
const maxS = Math.round(w * 0.022);
for (let y = searchY0; y < searchY1; y++) {
  for (let x = 0; x < w; x++) {
    const idx = y * w + x;
    if (binary[idx] && !visited[idx]) {
      let q = [x, y];
      visited[idx] = 1;
      let minX = x, maxX = x, minY = y, maxY = y, count = 0;
      let head = 0;
      while (head < q.length) {
        const cx = q[head++];
        const cy = q[head++];
        count++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        const neighbors = [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]];
        for (const [nx, ny] of neighbors) {
          if (nx >= 0 && nx < w && ny >= searchY0 && ny < searchY1) {
            const nIdx = ny * w + nx;
            if (binary[nIdx] && !visited[nIdx]) {
              visited[nIdx] = 1;
              q.push(nx, ny);
            }
          }
        }
      }
      const bw = maxX - minX + 1, bh = maxY - minY + 1;
      const fill = count / (bw * bh);
      const aspect = bw / bh;
      if (bw >= minS && bw <= maxS && bh >= minS && bh <= maxS && fill > 0.65 && aspect >= 0.70 && aspect <= 1.40) {
        squares.push({ cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, bw, bh });
      }
    }
  }
}

const t1Sq = squares.filter(s => Math.abs(s.cx - 380) < 15);
t1Sq.sort((a, b) => a.cy - b.cy);
console.log('T1 squares (n=' + t1Sq.length + '):');
const pitches = [];
for (let i = 0; i < t1Sq.length; i++) {
  const diff = i > 0 ? (t1Sq[i].cy - t1Sq[i-1].cy) : 0;
  if (diff > 0) pitches.push(diff);
  console.log(`  ${i}: cy=${t1Sq[i].cy.toFixed(1)}, diff=${diff.toFixed(1)}`);
}
pitches.sort((a, b) => a - b);
console.log('Pitches:', pitches);
console.log('Median pitch:', pitches[Math.floor(pitches.length / 2)]);
