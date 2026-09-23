/* =============================================
   OMR Dot Scanner — Precision Universal Engine
   - Pure Canvas API (Zero external dependencies)
   - Dual Layout Support:
     1. 5-Column Grid Layout (Master table: 40 questions/col × 5 columns = 200 Qs)
     2. 6-Column Track Layout (26 + 26 + 37 + 37 + 37 + 37 = 200 Qs + 6-digit Roll Number)
   - Strict Multi-Bubble Detection (Flags 2+ options filled -> 0 marks)
   - High-contrast visual debug overlay (Inspects ONLY the circle centers)
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
  _processImage(img, numQuestions, answerKey = null) {
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
   * Universal Layout Classifier:
   * 5-Column Grid Sheet has a solid horizontal table border at the top (y: 4%..15% of height).
   * 6-Column Track Sheet has vertical timing tracks of black squares and no top table border.
   */
  _calibrate(gray, w, h) {
    let maxDarkLine = 0;
    for (let y = Math.round(h * 0.04); y < Math.round(h * 0.15); y++) {
      let dark = 0;
      for (let x = Math.round(w * 0.05); x < Math.round(w * 0.95); x++) {
        if (gray[y * w + x] < 140) dark++;
      }
      if (dark > maxDarkLine) maxDarkLine = dark;
    }

    const is5Col = maxDarkLine > 400;

    if (is5Col) {
      return this._calibrate5Col(gray, w, h);
    } else {
      return this._calibrate6Col(gray, w, h);
    }
  }

  /**
   * 5-Column Grid Master Layout (Dynamic Boundary Calibration):
   * Dynamically locates table top line, bottom line, and vertical column dividers
   * Col 1: Q1..40, Col 2: Q41..80, Col 3: Q81..120, Col 4: Q121..160, Col 5: Q161..200
   */
  _calibrate5Col(gray, w, h) {
    // 1. Detect top horizontal table border line
    let bestTopDark = 0, topY = Math.round(h * 0.0713);
    for (let y = Math.round(h * 0.03); y < Math.round(h * 0.20); y++) {
      let dark = 0;
      for (let x = Math.round(w * 0.08); x < Math.round(w * 0.92); x++) {
        if (gray[y * w + x] < 140) dark++;
      }
      if (dark > bestTopDark) {
        bestTopDark = dark;
        topY = y;
      }
    }

    // 2. Detect bottom horizontal table border line
    let bestBotDark = 0, botY = Math.round(h * 0.8076);
    for (let y = Math.round(h * 0.70); y < Math.round(h * 0.95); y++) {
      let dark = 0;
      for (let x = Math.round(w * 0.08); x < Math.round(w * 0.92); x++) {
        if (gray[y * w + x] < 140) dark++;
      }
      if (dark > bestBotDark) {
        bestBotDark = dark;
        botY = y;
      }
    }

    const tableH = botY - topY;
    const startY = topY + tableH * (27.5 / 754.0);
    const rowPitch = tableH * (18.3205 / 754.0);

    // 3. Detect vertical column dividing lines in middle 80% of table
    const midT = Math.round(topY + tableH * 0.1);
    const midB = Math.round(topY + tableH * 0.9);
    const vp = new Uint32Array(w);
    for (let y = midT; y < midB; y++) {
      const rowOffset = y * w;
      for (let x = 0; x < w; x++) {
        if (gray[rowOffset + x] < 140) vp[x]++;
      }
    }

    const thresh = (midB - midT) * 0.60;
    const vLines = [];
    for (let x = 1; x < w - 1; x++) {
      if (vp[x] > thresh && vp[x] >= vp[x - 1] && vp[x] >= vp[x + 1]) {
        if (vLines.length === 0 || x - vLines[vLines.length - 1] > 30) {
          vLines.push(x);
        } else if (vp[x] > vp[vLines[vLines.length - 1]]) {
          vLines[vLines.length - 1] = x;
        }
      }
    }

    let colBounds;
    if (vLines.length === 6) {
      colBounds = [
        [vLines[0], vLines[1]],
        [vLines[1], vLines[2]],
        [vLines[2], vLines[3]],
        [vLines[3], vLines[4]],
        [vLines[4], vLines[5]]
      ];
    } else {
      // Fallback calibrated bounds for 1000w
      colBounds = [
        [Math.round(w * 0.017), Math.round(w * 0.223)],
        [Math.round(w * 0.223), Math.round(w * 0.413)],
        [Math.round(w * 0.413), Math.round(w * 0.598)],
        [Math.round(w * 0.598), Math.round(w * 0.783)],
        [Math.round(w * 0.783), Math.round(w * 0.983)]
      ];
    }

    const colFractions = [
      [0.366, 0.543, 0.720, 0.898],
      [0.372, 0.536, 0.701, 0.865],
      [0.379, 0.548, 0.717, 0.886],
      [0.392, 0.561, 0.730, 0.900],
      [0.405, 0.568, 0.734, 0.900]
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
        optX
      });
    }

    return {
      layout: '5col',
      columns,
      topY: startY,
      rowPitch,
      bubbleRadius: Math.max(5, Math.round(w * 0.007))
    };
  }

  /**
   * 6-Column Track Layout:
   * Calibrates via black timing tracks T0, T1, T2, T3
   */
  _calibrate6Col(gray, w, h) {
    const squares = this._findSquares(gray, w, h);
    const tracks = this._clusterTracks(squares, w);

    const pickBest = (minR, maxR) => {
      const candidates = tracks.filter(t => {
        const r = t.meanX / w;
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

    const t0X = bestT0 ? bestT0.meanX : w * 0.129;
    const t1X = bestT1 ? bestT1.meanX : w * 0.380;
    const t2X = bestT2 ? bestT2.meanX : w * 0.576;
    const t3X = bestT3 ? bestT3.meanX : w * 0.792;

    let topY = h * 0.198;
    let botY = h * 0.613;

    const refTrack = bestT1 || bestT3;
    if (refTrack) {
      topY = refTrack.minY + 35 * (h / 1000);
      botY = refTrack.maxY - 36 * (h / 1000);
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

  _findSquares(gray, w, h) {
    const binary = new Uint8Array(w * h);
    for (let y = Math.round(h * 0.12); y < Math.round(h * 0.72); y++) {
      for (let x = 0; x < w; x++) {
        if (gray[y * w + x] < 75) binary[y * w + x] = 1;
      }
    }

    const visited = new Uint8Array(w * h);
    const squares = [];
    const minS = Math.round(w * 0.004);
    const maxS = Math.round(w * 0.022);

    for (let y = Math.round(h * 0.12); y < Math.round(h * 0.72); y++) {
      for (let x = 0; x < w; x++) {
        if (binary[y * w + x] && !visited[y * w + x]) {
          let q = [x, y];
          visited[y * w + x] = 1;
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
              if (nx >= 0 && nx < w && ny >= Math.round(h * 0.12) && ny < Math.round(h * 0.72) && binary[ny * w + nx] && !visited[ny * w + nx]) {
                visited[ny * w + nx] = 1;
                q.push(nx, ny);
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
      const startY = geom.topY - 42.2 * (h / 1333);
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
   * Intelligently sample circles only and classify answers
   * Flags multiple filled options (strict rule -> 0 marks)
   */
  _detectBubbles(gray, w, h, geom, numQuestions) {
    const options = ['A', 'B', 'C', 'D'];
    const answers = new Array(numQuestions).fill(null);
    const confidence = new Array(numQuestions).fill(0);
    const bubbleDetails = [];
    const multiDetails = {};
    const rowPitch = geom.rowPitch;

    for (const colDef of geom.columns) {
      for (let q = colDef.startQ; q <= colDef.endQ; q++) {
        const qIndex = q - 1;
        if (qIndex >= numQuestions) break;

        const rowIdx = colDef.startRow + (q - colDef.startQ);
        const cy = geom.topY + rowIdx * rowPitch;

        // Background paper luminance (sampled safely in the clear margin)
        const bgX = colDef.optX[0] - 22;
        let bgSum = 0, bgCount = 0;
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const px = Math.round(bgX + dx);
            const py = Math.round(cy + dy);
            if (px >= 0 && px < w && py >= 0 && py < h) {
              const v = gray[py * w + px];
              if (v > 140) { bgSum += v; bgCount++; }
            }
          }
        }
        const bgLum = bgCount > 0 ? bgSum / bgCount : 200;

        // Sample each of the 4 options strictly at circle centers
        const optScores = [];
        const optMeans = [];
        const optCenters = [];
        const filledOptions = [];

        for (let opt = 0; opt < 4; opt++) {
          const expectedX = colDef.optX[opt];
          let bestMean = 255;
          let bestDark = 0;
          let bestCx = expectedX, bestCy = cy;

          if (geom.layout === '5col') {
            // Strictly sample 3x3 core at circle center (never touches circumference ring of empty circles)
            let sum = 0, dark = 0;
            for (let sy = -1; sy <= 1; sy++) {
              for (let sx = -1; sx <= 1; sx++) {
                const px = Math.round(expectedX + sx);
                const py = Math.round(cy + sy);
                if (px >= 0 && px < w && py >= 0 && py < h) {
                  const val = gray[py * w + px];
                  sum += val;
                  if (val < bgLum * 0.55) dark++;
                }
              }
            }
            bestMean = sum / 9;
            bestDark = dark;
          } else {
            // 6-col track layout: +-2px micro-search
            for (let dy = -2; dy <= 2; dy++) {
              for (let dx = -2; dx <= 2; dx++) {
                let sum = 0, dark = 0;
                for (let sy = -2; sy <= 2; sy++) {
                  for (let sx = -2; sx <= 2; sx++) {
                    const px = Math.round(expectedX + dx + sx);
                    const py = Math.round(cy + dy + sy);
                    if (px >= 0 && px < w && py >= 0 && py < h) {
                      const val = gray[py * w + px];
                      sum += val;
                      if (val < bgLum * 0.55) dark++;
                    }
                  }
                }
                const mean = sum / 25;
                if (mean < bestMean) {
                  bestMean = mean;
                  bestDark = dark;
                  bestCx = expectedX + dx;
                  bestCy = cy + dy;
                }
              }
            }
          }

          const fillRatio = Math.max(0, (bgLum - bestMean) / bgLum);
          const darkRatio = bestDark / (geom.layout === '5col' ? 9 : 25);
          const score = fillRatio * 0.65 + darkRatio * 0.35;

          optScores.push(score);
          optMeans.push(bestMean);
          optCenters.push({ cx: bestCx, cy: bestCy, option: options[opt] });

          if (bestMean < bgLum * 0.65) {
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
          // Empty bubble fallback
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

          if (maxScore > 0.38 && optMeans[maxOpt] < bgLum * 0.68) {
            if (delta > 0.12 || maxScore / Math.max(0.01, secondScore) > 1.6) {
              answer = options[maxOpt];
              conf = Math.min(1.0, Math.max(0.70, delta * 2 + maxScore * 0.3));
            }
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
   * - Indigo ring for expected Answer Key option if missed
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
