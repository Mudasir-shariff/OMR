/* =============================================
   OMR Dot Scanner — Precision Universal Engine
   - Pure Canvas API (Zero external dependencies)
   - Dual Layout Support:
     1. 5-Column Grid Layout (Master table: 40 questions/col × 5 columns = 200 Qs)
     2. 6-Column Track Layout (26 + 26 + 37 + 37 + 37 + 37 = 200 Qs + 6-digit Roll Number)
   - Mobile-Photo Resilient (Auto paper contour & desk margin detection)
   - Circle Interior Disc Sampling (Never samples outer printed circumference rings)
   - Row-Adaptive Dynamic Lighting Normalization (Immune to shadows/uneven light)
   - Strict Multi-Bubble Detection (Flags 2+ options filled -> 0 marks)
   - High-contrast visual debug overlay (Emerald Green ✓, Crimson ✗, Red ⚠️ MULTIPLE)
   ============================================= */

class OMRScanner {
  constructor() {
    this.ready = true;
    this.debugCanvas = null;
    this.debugMode = false;
  }

  isReady() { return true; }
  init() { this.ready = true; }

  setDebugCanvas(canvas) {
    this.debugCanvas = canvas;
    this.debugMode = !!canvas;
  }

  /**
   * Process an image file and detect filled bubbles
   * Compares against answerKey if provided
   */
  async processFile(file, numQuestions = 200, answerKey = null) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const result = this._processImage(img, numQuestions, answerKey);
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          URL.revokeObjectURL(img.src);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        reject(new Error('Failed to load image'));
      };
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Core image processing pipeline
   */
  _processImage(img, numQuestions = 200, answerKey = null) {
    const targetWidth = 1000;
    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;
    const scale = targetWidth / imgW;
    const w = targetWidth;
    const h = Math.round(imgH * scale);

    const canvas = (typeof document !== 'undefined') ? document.createElement('canvas') : null;
    let gray;
    let ctx = null;

    if (img.data) {
      gray = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) {
        const origY = Math.min(imgH - 1, Math.floor(y / scale));
        for (let x = 0; x < w; x++) {
          const origX = Math.min(imgW - 1, Math.floor(x / scale));
          const idx = (origY * imgW + origX) * 4;
          gray[y * w + x] = Math.round(0.299 * img.data[idx] + 0.587 * img.data[idx + 1] + 0.114 * img.data[idx + 2]);
        }
      }
    } else if (canvas) {
      canvas.width = w;
      canvas.height = h;
      ctx = canvas.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0, w, h);

      const imageData = ctx.getImageData(0, 0, w, h);
      const pixels = imageData.data;
      gray = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        const idx = i * 4;
        gray[i] = Math.round(0.299 * pixels[idx] + 0.587 * pixels[idx + 1] + 0.114 * pixels[idx + 2]);
      }
    }

    const geom = this._calibrate(gray, w, h);
    const rollNumber = geom.layout === '6col' ? this._detectRollNumber(gray, w, h, geom) : null;
    const { answers, confidence, bubbleDetails, multiDetails } = this._detectBubbles(gray, w, h, geom, numQuestions);

    if (this.debugMode && this.debugCanvas && ctx && canvas) {
      this._drawDebug(ctx, canvas, w, h, geom, bubbleDetails, answers, rollNumber, answerKey);
    }

    return {
      answers,
      confidence,
      rollNumber,
      bubbleDetails,
      multiDetails,
      layout: geom.layout
    };
  }

  /**
   * Detect paper bounding box on darker desk/table backgrounds
   */
  _findPaperBounds(gray, w, h) {
    const isPaperRow = new Uint32Array(h);
    const isPaperCol = new Uint32Array(w);

    for (let y = 0; y < h; y++) {
      const rowOffset = y * w;
      for (let x = 0; x < w; x++) {
        if (gray[rowOffset + x] > 150) {
          isPaperRow[y]++;
          isPaperCol[x]++;
        }
      }
    }

    const rowThresh = w * 0.25;
    const colThresh = h * 0.25;

    let y0 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      if (isPaperRow[y] > rowThresh) {
        if (y0 === -1) y0 = y;
        y1 = y;
      }
    }

    let x0 = -1, x1 = -1;
    for (let x = 0; x < w; x++) {
      if (isPaperCol[x] > colThresh) {
        if (x0 === -1) x0 = x;
        x1 = x;
      }
    }

    if (y0 !== -1 && y1 !== -1 && x0 !== -1 && x1 !== -1) {
      const pw = x1 - x0, ph = y1 - y0;
      if (pw > w * 0.5 && ph > h * 0.5) {
        return { px0: x0, py0: y0, px1: x1, py1: y1, pw, ph };
      }
    }

    return { px0: 0, py0: 0, px1: w, py1: h, pw: w, ph: h };
  }

  /**
   * Universal Layout Classifier:
   * 5-Column Grid Sheet has a solid horizontal table border at the top.
   * 6-Column Track Sheet has vertical timing tracks of black squares and no top table border.
   */
  _calibrate(gray, w, h) {
    const paper = this._findPaperBounds(gray, w, h);
    const { px0, py0, px1, py1, pw, ph } = paper;

    let maxDarkLine = 0;
    const searchY0 = Math.round(py0 + ph * 0.04);
    const searchY1 = Math.round(py0 + ph * 0.16);
    const lineX0 = Math.round(px0 + pw * 0.08);
    const lineX1 = Math.round(px0 + pw * 0.92);

    for (let y = searchY0; y < searchY1; y++) {
      let dark = 0;
      const rowOffset = y * w;
      for (let x = lineX0; x < lineX1; x++) {
        if (gray[rowOffset + x] < 140) dark++;
      }
      if (dark > maxDarkLine) maxDarkLine = dark;
    }

    const is5Col = maxDarkLine > (pw * 0.40);

    if (is5Col) {
      return this._calibrate5Col(gray, w, h, paper);
    } else {
      return this._calibrate6Col(gray, w, h, paper);
    }
  }

  /**
   * 5-Column Grid Master Layout:
   * Calibrates table top, bottom, and 6 vertical dividers with subpixel precision
   */
  _calibrate5Col(gray, w, h, paper) {
    const { px0, py0, px1, py1, pw, ph } = paper;
    const lineX0 = Math.round(px0 + pw * 0.08);
    const lineX1 = Math.round(px0 + pw * 0.92);

    // 1. Detect top horizontal table border line within paper bounds
    let bestTopDark = 0, topY = Math.round(py0 + ph * 0.0713);
    const searchTopY0 = Math.round(py0 + ph * 0.03);
    const searchTopY1 = Math.round(py0 + ph * 0.20);

    for (let y = searchTopY0; y < searchTopY1; y++) {
      let dark = 0;
      const rowOffset = y * w;
      for (let x = lineX0; x < lineX1; x++) {
        if (gray[rowOffset + x] < 140) dark++;
      }
      if (dark > bestTopDark) {
        bestTopDark = dark;
        topY = y;
      }
    }

    // 2. Detect bottom horizontal table border line within paper bounds
    let bestBotDark = 0, botY = Math.round(py0 + ph * 0.8076);
    const searchBotY0 = Math.round(py0 + ph * 0.70);
    const searchBotY1 = Math.round(py0 + ph * 0.95);

    for (let y = searchBotY0; y < searchBotY1; y++) {
      let dark = 0;
      const rowOffset = y * w;
      for (let x = lineX0; x < lineX1; x++) {
        if (gray[rowOffset + x] < 140) dark++;
      }
      if (dark > bestBotDark) {
        bestBotDark = dark;
        botY = y;
      }
    }

    const tableH = botY - topY;
    const startY = topY + tableH * 0.036472;
    const rowPitch = tableH * 0.0242977;

    // 3. Detect column dividers with double gutter detection
    const midT = Math.round(topY + tableH * 0.1);
    const midB = Math.round(topY + tableH * 0.9);
    const vp = new Uint32Array(w);
    for (let y = midT; y < midB; y++) {
      const rowOffset = y * w;
      for (let x = px0 + 5; x < px1 - 5; x++) {
        if (gray[rowOffset + x] < 140) vp[x]++;
      }
    }

    const findPeak = (fromX, toX) => {
      let maxV = 0, bestX = Math.round((fromX + toX) / 2);
      for (let x = fromX; x <= toX; x++) {
        if (vp[x] > maxV) { maxV = vp[x]; bestX = x; }
      }
      return bestX;
    };

    const l0 = findPeak(Math.round(px0 + pw * 0.010), Math.round(px0 + pw * 0.035));
    const l1 = findPeak(Math.round(px0 + pw * 0.200), Math.round(px0 + pw * 0.240));
    const c2Right = findPeak(Math.round(px0 + pw * 0.395), Math.round(px0 + pw * 0.410));
    const c3Left  = findPeak(Math.round(px0 + pw * 0.411), Math.round(px0 + pw * 0.428));
    const l3 = findPeak(Math.round(px0 + pw * 0.585), Math.round(px0 + pw * 0.615));
    const l4 = findPeak(Math.round(px0 + pw * 0.770), Math.round(px0 + pw * 0.795));
    const l5 = findPeak(Math.round(px0 + pw * 0.965), Math.round(px0 + pw * 0.995));

    const colBounds = [
      [l0, l1],
      [l1, c2Right],
      [c3Left, l3],
      [l3, l4],
      [l4, l5]
    ];

    // Exact subpixel bubble center fractions per column:
    const colFractions = [
      [0.3732, 0.5537, 0.7244, 0.9024], // Col 1 (Q1..40)
      [0.3919, 0.5676, 0.7351, 0.9054], // Col 2 (Q41..80)
      [0.3831, 0.5516, 0.7228, 0.8995], // Col 3 (Q81..120)
      [0.4049, 0.5652, 0.7310, 0.9049], // Col 4 (Q121..160)
      [0.4158, 0.5767, 0.7376, 0.8985]  // Col 5 (Q161..200)
    ];

    const columns = [];
    for (let c = 0; c < 5; c++) {
      const [x0, x1] = colBounds[c];
      const cw = x1 - x0;
      const optX = colFractions[c].map(f => x0 + cw * f);
      columns.push({
        col: c + 1,
        startQ: c * 40 + 1,
        endQ: (c + 1) * 40,
        startRow: 0,
        endRow: 39,
        cw,
        optX
      });
    }

    return {
      layout: '5col',
      columns,
      topY: startY,
      rowPitch,
      bubbleRadius: Math.max(5, Math.round(tableH * 0.007))
    };
  }

  /**
   * 6-Column Track Layout:
   * Calibrates via black timing tracks T0, T1, T2, T3
   */
  _calibrate6Col(gray, w, h, paper) {
    const { px0, py0, px1, py1, pw, ph } = paper;
    const squares = this._findSquares(gray, w, h, paper);
    const tracks = this._clusterTracks(squares, w);

    const pickBest = (minR, maxR) => {
      const candidates = tracks.filter(t => {
        const r = (t.meanX - px0) / pw;
        return r >= minR && r <= maxR;
      });
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => (b.maxY - b.minY) - (a.maxY - a.minY));
      return candidates[0];
    };

    const bestT0 = pickBest(0.08, 0.22);
    const bestT1 = pickBest(0.32, 0.44);
    const bestT2 = pickBest(0.52, 0.64);
    const bestT3 = pickBest(0.72, 0.86);

    const t0X = bestT0 ? bestT0.meanX : (px0 + pw * 0.1202);
    const t1X = bestT1 ? bestT1.meanX : (px0 + pw * 0.3786);
    const t2X = bestT2 ? bestT2.meanX : (px0 + pw * 0.5758);
    const t3X = bestT3 ? bestT3.meanX : (px0 + pw * 0.7939);

    let topY = py0 + ph * 0.198;
    let botY = py0 + ph * 0.613;

    const refTrack = bestT1 || bestT3;
    if (refTrack) {
      topY = refTrack.minY + 34.2 * (ph / 1000);
      botY = refTrack.maxY - 26.5 * (ph / 1000);
    }

    const b1W = t1X - t0X;
    const c1OptX = [t0X + b1W * 0.218, t0X + b1W * 0.280, t0X + b1W * 0.342, t0X + b1W * 0.404];
    const c2OptX = [t0X + b1W * 0.680, t0X + b1W * 0.750, t0X + b1W * 0.820, t0X + b1W * 0.890];

    const b2W = t2X - t1X;
    const c3OptX = [t1X + b2W * 0.170, t1X + b2W * 0.252, t1X + b2W * 0.334, t1X + b2W * 0.416];
    const c4OptX = [t1X + b2W * 0.608, t1X + b2W * 0.690, t1X + b2W * 0.772, t1X + b2W * 0.854];

    const b3W = t3X - t2X;
    const c5OptX = [t2X + b3W * 0.155, t2X + b3W * 0.237, t2X + b3W * 0.319, t2X + b3W * 0.401];
    const c6OptX = [t2X + b3W * 0.605, t2X + b3W * 0.686, t2X + b3W * 0.767, t2X + b3W * 0.848];

    const rollX = [
      t0X + b1W * 0.220,
      t0X + b1W * 0.286,
      t0X + b1W * 0.351,
      t0X + b1W * 0.417,
      t0X + b1W * 0.483,
      t0X + b1W * 0.553
    ];

    const columns = [
      { col: 1, startQ: 1,   endQ: 26,  startRow: 11, endRow: 36, optX: c1OptX },
      { col: 2, startQ: 27,  endQ: 52,  startRow: 11, endRow: 36, optX: c2OptX },
      { col: 3, startQ: 53,  endQ: 89,  startRow: 0,  endRow: 36, optX: c3OptX },
      { col: 4, startQ: 90,  endQ: 126, startRow: 0,  endRow: 36, optX: c4OptX },
      { col: 5, startQ: 127, endQ: 163, startRow: 0,  endRow: 36, optX: c5OptX },
      { col: 6, startQ: 164, endQ: 200, startRow: 0,  endRow: 36, optX: c6OptX }
    ];

    return {
      layout: '6col',
      columns,
      rollX,
      topY,
      botY,
      rowPitch: (botY - topY) / 36,
      bubbleRadius: Math.max(5, Math.round(w * 0.007))
    };
  }

  _findSquares(gray, w, h, paper) {
    const { py0, ph } = paper || { py0: 0, ph: h };
    const binary = new Uint8Array(w * h);
    const searchY0 = Math.round(py0 + ph * 0.12);
    const searchY1 = Math.round(py0 + ph * 0.72);

    for (let y = searchY0; y < searchY1; y++) {
      const rowOffset = y * w;
      for (let x = 0; x < w; x++) {
        if (gray[rowOffset + x] < 75) binary[rowOffset + x] = 1;
      }
    }

    const visited = new Uint8Array(w * h);
    const squares = [];
    const minS = Math.round(w * 0.004);
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
          if (bw >= minS && bw <= maxS && bh >= minS && bh <= maxS && fill > 0.65 && aspect >= 0.75 && aspect <= 1.35) {
            squares.push({ cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, bw, bh });
          }
        }
      }
    }

    return squares;
  }

  _clusterTracks(squares, w) {
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
    return groups.filter(g => g.items.length >= 3);
  }

  _detectRollNumber(gray, w, h, geom) {
    try {
      const rollX = geom.rollX;
      const startY = geom.topY - 41.5 * (h / 1333);
      const digitPitch = geom.rowPitch * 1.10;
      const digits = [];

      for (let col = 0; col < 6; col++) {
        const cx = rollX[col];
        let minMean = 255;
        let bestDigit = 0;

        for (let d = 0; d < 10; d++) {
          const cy = startY + d * digitPitch;
          let sum = 0, count = 0;
          for (let dy = -2; dy <= 2; dy++) {
            for (let dx = -2; dx <= 2; dx++) {
              const px = Math.round(cx + dx);
              const py = Math.round(cy + dy);
              if (px >= 0 && px < w && py >= 0 && py < h) {
                sum += gray[py * w + px];
                count++;
              }
            }
          }
          const mean = count > 0 ? sum / count : 255;
          if (mean < minMean) {
            minMean = mean;
            bestDigit = d;
          }
        }
        digits.push(bestDigit);
      }
      return digits.join('');
    } catch {
      return null;
    }
  }

  /**
   * Intelligently sample circles using true interior disc sampling
   * - Immune to black circle boundary ring (never touches hollow ring)
   * - Compares relative darkness against local row paper luminance
   * - Flags multiple filled options (strict rule -> 0 marks)
   */
  _detectBubbles(gray, w, h, geom, numQuestions) {
    const options = ['A', 'B', 'C', 'D'];
    const answers = new Array(numQuestions).fill(null);
    const confidence = new Array(numQuestions).fill(0);
    const bubbleDetails = [];
    const multiDetails = {};
    const rowPitch = geom.rowPitch;

    // Strict interior disc sampling pattern (immune to outer ring)
    // Radius <= 2.8px (21 pts) for 5-col; radius <= 2.2px (13 pts) for 6-col
    const intOffsets = [];
    const maxR2 = geom.layout === '5col' ? 8.0 : 5.0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (dx * dx + dy * dy <= maxR2) {
          intOffsets.push({ dx, dy });
        }
      }
    }
    const totalPts = intOffsets.length;

    for (const colDef of geom.columns) {
      for (let q = colDef.startQ; q <= colDef.endQ; q++) {
        const qIndex = q - 1;
        if (qIndex >= numQuestions) break;

        const rowIdx = colDef.startRow + (q - colDef.startQ);
        const cy = geom.topY + rowIdx * rowPitch;

        // Dynamic local row paper luminance (sampled in clear margin)
        const bgDist = colDef.cw ? colDef.cw * 0.12 : 18;
        const bgX = colDef.optX[0] - bgDist;
        let bgSum = 0, bgCount = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const px = Math.round(bgX + dx);
            const py = Math.round(cy + dy);
            if (px >= 0 && px < w && py >= 0 && py < h) {
              const v = gray[py * w + px];
              if (v > 130) { bgSum += v; bgCount++; }
            }
          }
        }
        const bgLum = bgCount > 0 ? (bgSum / bgCount) : 215;

        const optScores = [];
        const optMeans = [];
        const optCenters = [];
        const filledOptions = [];

        const darkLumThresh = geom.layout === '5col' ? (bgLum * 0.65) : (bgLum * 0.62);
        const minDarkRatio = geom.layout === '5col' ? 0.45 : 0.48;

        for (let opt = 0; opt < 4; opt++) {
          const cx = colDef.optX[opt];
          let sum = 0, darkPts = 0;

          for (let i = 0; i < totalPts; i++) {
            const px = Math.round(cx + intOffsets[i].dx);
            const py = Math.round(cy + intOffsets[i].dy);
            if (px >= 0 && px < w && py >= 0 && py < h) {
              const val = gray[py * w + px];
              sum += val;
              if (val < darkLumThresh) darkPts++;
            }
          }

          const meanVal = sum / totalPts;
          const fillRatio = Math.max(0, (bgLum - meanVal) / bgLum);
          const darkRatio = darkPts / totalPts;
          const score = fillRatio * 0.60 + darkRatio * 0.40;

          optScores.push(score);
          optMeans.push(meanVal);
          optCenters.push({ cx, cy, option: options[opt] });

          const is5Col = geom.layout === '5col';
          const isFilled = is5Col
            ? ((meanVal < darkLumThresh && darkRatio >= 0.40) || (score >= 0.25 && meanVal < bgLum * 0.75))
            : ((meanVal < darkLumThresh && darkRatio >= 0.48) || (score > 0.52 && darkRatio >= 0.40));

          if (isFilled) {
            filledOptions.push(options[opt]);
          }
        }

        let answer = null;
        let conf = 0;

        if (filledOptions.length === 1) {
          answer = filledOptions[0];
          conf = 0.95;
        } else if (filledOptions.length > 1) {
          // Strict rule: 2 or more options filled -> MULTIPLE (0 marks)
          answer = 'MULTIPLE';
          conf = 1.0;
          multiDetails[q] = filledOptions;
        } else {
          // Contrast fallback check for faint pencil marks
          let maxScore = -1, maxOpt = -1;
          for (let opt = 0; opt < 4; opt++) {
            if (optScores[opt] > maxScore) {
              maxScore = optScores[opt];
              maxOpt = opt;
            }
          }
          const sortedScores = [...optScores].sort((a, b) => b - a);
          const secondScore = sortedScores[1] || 0;
          const delta = maxScore - secondScore;

          if (maxScore > 0.38 && optMeans[maxOpt] < bgLum * 0.70 && delta > 0.18) {
            answer = options[maxOpt];
            conf = Math.min(1.0, Math.max(0.70, delta * 2 + maxScore * 0.3));
          }
        }

        answers[qIndex] = answer;
        confidence[qIndex] = conf;

        bubbleDetails.push({
          q, qIndex, answer, confidence: conf,
          filledOptions,
          optSamples: optCenters.map((c, i) => ({
            ...c, score: optScores[i], mean: optMeans[i]
          }))
        });
      }
    }

    return { answers, confidence, bubbleDetails, multiDetails };
  }

  /**
   * Draw high-contrast visual debug overlay on canvas
   * Highlights circles with real-time Answer Key comparison:
   * - Emerald Green (✓) for correct answers
   * - Crimson Red (✗) for incorrect student answers
   * - Indigo dashed ring for expected Answer Key option if missed
   * - Red warning badge for double-bubbled questions (0 marks strict rule)
   * - Cyan ring for unattempted/empty bubbles
   */
  _drawDebug(ctx, canvas, w, h, geom, bubbleDetails, answers, rollNumber, answerKey = null) {
    this.debugCanvas.width = w;
    this.debugCanvas.height = h;
    const dCtx = this.debugCanvas.getContext('2d');

    // Draw background image
    dCtx.drawImage(canvas, 0, 0);

    // Subtle dark tint to make detected circles pop
    dCtx.fillStyle = 'rgba(15, 23, 42, 0.25)';
    dCtx.fillRect(0, 0, w, h);

    const r = geom.bubbleRadius || 7;

    for (const b of bubbleDetails) {
      const qAns = answers[b.qIndex];
      const isMulti = qAns === 'MULTIPLE';
      const keyAns = (answerKey && answerKey[b.qIndex]) ? answerKey[b.qIndex] : null;

      for (const opt of b.optSamples) {
        const isThisOptFilled = b.filledOptions.includes(opt.option);
        const isStudentChoice = qAns === opt.option;
        const isKeyOption = keyAns === opt.option;

        dCtx.beginPath();
        dCtx.arc(opt.cx, opt.cy, r, 0, 2 * Math.PI);

        if (isMulti && isThisOptFilled) {
          // Double-bubbled options: Red warning outline & fill
          dCtx.fillStyle = 'rgba(239, 68, 68, 0.70)';
          dCtx.fill();
          dCtx.strokeStyle = '#ef4444';
          dCtx.lineWidth = 2.5;
          dCtx.stroke();

          dCtx.fillStyle = '#ffffff';
          dCtx.font = 'bold 9px sans-serif';
          dCtx.textAlign = 'center';
          dCtx.textBaseline = 'middle';
          dCtx.fillText(opt.option, opt.cx, opt.cy);

        } else if (isStudentChoice) {
          // Check if key is provided and matches
          const isCorrect = keyAns ? (qAns === keyAns) : true;

          if (isCorrect) {
            // Correct answer: Emerald Green
            dCtx.fillStyle = 'rgba(16, 185, 129, 0.75)';
            dCtx.fill();
            dCtx.strokeStyle = '#10b981';
            dCtx.lineWidth = 2.5;
            dCtx.stroke();

            dCtx.fillStyle = '#ffffff';
            dCtx.font = 'bold 9px sans-serif';
            dCtx.textAlign = 'center';
            dCtx.textBaseline = 'middle';
            dCtx.fillText(keyAns ? '✓' : opt.option, opt.cx, opt.cy);
          } else {
            // Wrong answer: Crimson Red
            dCtx.fillStyle = 'rgba(239, 68, 68, 0.75)';
            dCtx.fill();
            dCtx.strokeStyle = '#ef4444';
            dCtx.lineWidth = 2.5;
            dCtx.stroke();

            dCtx.fillStyle = '#ffffff';
            dCtx.font = 'bold 9px sans-serif';
            dCtx.textAlign = 'center';
            dCtx.textBaseline = 'middle';
            dCtx.fillText('✗', opt.cx, opt.cy);
          }

        } else if (isKeyOption && qAns !== keyAns) {
          // Expected correct answer that student missed: Indigo dashed ring
          dCtx.fillStyle = 'rgba(99, 102, 241, 0.20)';
          dCtx.fill();
          dCtx.strokeStyle = '#6366f1';
          dCtx.lineWidth = 2.0;
          dCtx.setLineDash([3, 3]);
          dCtx.stroke();
          dCtx.setLineDash([]);

          dCtx.fillStyle = '#818cf8';
          dCtx.font = 'bold 8px sans-serif';
          dCtx.textAlign = 'center';
          dCtx.textBaseline = 'middle';
          dCtx.fillText('KEY', opt.cx, opt.cy);

        } else {
          // Empty bubble: Gentle cyan outline targeting the circle
          dCtx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
          dCtx.lineWidth = 1.0;
          dCtx.stroke();
        }
      }

      if (isMulti) {
        // Draw MULTIPLE tag next to question
        const firstOpt = b.optSamples[0];
        dCtx.fillStyle = '#ef4444';
        dCtx.font = 'bold 9px sans-serif';
        dCtx.textAlign = 'right';
        dCtx.fillText('⚠️ 2 FILLED (0)', firstOpt.cx - 8, firstOpt.cy + 3);
      }
    }
  }
}

// Singleton scanner instance
const omrScanner = new OMRScanner();
