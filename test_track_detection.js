const fs = require('fs');

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

// Calculate paper background
const sampleLum = [];
for (let y = Math.round(h * 0.2); y < Math.round(h * 0.8); y += 10) {
  for (let x = Math.round(w * 0.2); x < Math.round(w * 0.8); x += 10) {
    sampleLum.push(gray[y * w + x]);
  }
}
sampleLum.sort((a, b) => a - b);
const medianPaper = sampleLum[Math.floor(sampleLum.length / 2)];
console.log('Median paper background luminance:', medianPaper);

// Test different dark thresholds
[75, 90, 100, 110, Math.round(medianPaper * 0.55), Math.round(medianPaper * 0.60)].forEach(thresh => {
  const binary = new Uint8Array(w * h);
  const searchY0 = Math.round(h * 0.10);
  const searchY1 = Math.round(h * 0.90);

  for (let y = searchY0; y < searchY1; y++) {
    const rowOffset = y * w;
    for (let x = 0; x < w; x++) {
      if (gray[rowOffset + x] < thresh) binary[rowOffset + x] = 1;
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

  // Cluster
  const groups = [];
  for (const sq of squares) {
    let matched = false;
    for (const g of groups) {
      if (Math.abs(g.meanX - sq.cx) < 20) {
        g.items.push(sq);
        g.meanX = g.items.reduce((s, it) => s + it.cx, 0) / g.items.length;
        if (sq.cy < g.minY) g.minY = sq.cy;
        if (sq.cy > g.maxY) g.maxY = sq.cy;
        matched = true;
        break;
      }
    }
    if (!matched) {
      groups.push({ meanX: sq.cx, items: [sq], minY: sq.cy, maxY: sq.cy });
    }
  }
  groups.sort((a, b) => a.meanX - b.meanX);
  const big = groups.filter(g => g.items.length >= 10);
  console.log(`\nThresh = ${thresh}: Found ${squares.length} squares, ${big.length} tracks with >= 10 squares:`);
  big.forEach(g => {
    console.log(`  Track X=${g.meanX.toFixed(1)}, count=${g.items.length}, Y=${g.minY.toFixed(1)}..${g.maxY.toFixed(1)}`);
  });
});
