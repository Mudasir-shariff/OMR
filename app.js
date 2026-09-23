/* =============================================
   OMR Dot Scanner — Main Application Logic
   SPA router, view management, and UI interactions
   ============================================= */

const App = {
  currentView: 'home',
  currentTest: null,
  currentAnswers: [],
  currentStudentName: '',

  // ===== INIT =====
  async init() {
    try {
      await storage.init();
      this.bindEvents();
      this.navigateTo('home');
      this.registerSW();
      console.log('[App] Initialized');
    } catch (err) {
      console.error('[App] Init error:', err);
      this.toast('Failed to initialize app', 'error');
    }
  },

  registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('[App] Service Worker registered'))
        .catch(err => console.warn('[App] SW registration failed:', err));
    }
  },

  // ===== NAVIGATION =====
  navigateTo(viewName, data = {}) {
    // Hide all views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

    // Show target view
    const view = document.getElementById(`view-${viewName}`);
    if (view) {
      view.classList.add('active');
      this.currentView = viewName;
    }

    // Update header
    this.updateHeader(viewName, data);

    // View-specific initialization
    switch (viewName) {
      case 'home':
        this.loadHomeView();
        break;
      case 'create':
        this.loadCreateView();
        break;
      case 'answer-key':
        this.loadAnswerKeyView(data.testId);
        break;
      case 'scanner':
        this.loadScannerView(data.testId);
        break;
      case 'manual-entry':
        this.loadManualEntryView();
        break;
      case 'review':
        this.loadReviewView(data);
        break;
      case 'results':
        this.loadResultsView(data.testId);
        break;
    }

    // Scroll to top
    window.scrollTo(0, 0);
  },

  updateHeader(viewName, data) {
    const backBtn = document.getElementById('btn-back');
    const title = document.getElementById('header-title');
    const subtitle = document.getElementById('header-subtitle');

    subtitle.textContent = '';

    switch (viewName) {
      case 'home':
        backBtn.classList.add('hidden');
        title.textContent = 'OMR Scanner';
        break;
      case 'create':
        backBtn.classList.remove('hidden');
        title.textContent = 'Create Test';
        break;
      case 'answer-key':
        backBtn.classList.remove('hidden');
        title.textContent = 'Answer Key';
        if (this.currentTest) subtitle.textContent = this.currentTest.name;
        break;
      case 'scanner':
        backBtn.classList.remove('hidden');
        title.textContent = 'Scan Sheet';
        if (this.currentTest) subtitle.textContent = this.currentTest.name;
        break;
      case 'manual-entry':
        backBtn.classList.remove('hidden');
        title.textContent = 'Enter Answers';
        if (this.currentStudentName) subtitle.textContent = this.currentStudentName;
        break;
      case 'review':
        backBtn.classList.remove('hidden');
        title.textContent = 'Review Answers';
        break;
      case 'results':
        backBtn.classList.remove('hidden');
        title.textContent = 'Results';
        if (this.currentTest) subtitle.textContent = this.currentTest.name;
        break;
    }
  },

  goBack() {
    switch (this.currentView) {
      case 'create':
        this.navigateTo('home');
        break;
      case 'answer-key':
        this.navigateTo('home');
        break;
      case 'scanner':
        this.navigateTo('results', { testId: this.currentTest?.id });
        break;
      case 'manual-entry':
        this.navigateTo('scanner', { testId: this.currentTest?.id });
        break;
      case 'review':
        this.navigateTo('scanner', { testId: this.currentTest?.id });
        break;
      case 'results':
        this.navigateTo('home');
        break;
      default:
        this.navigateTo('home');
    }
  },

  // ===== EVENT BINDING =====
  bindEvents() {
    // Back button
    document.getElementById('btn-back').addEventListener('click', () => this.goBack());

    // Home
    document.getElementById('btn-create-test').addEventListener('click', () => this.navigateTo('create'));

    // Create Test
    document.getElementById('btn-create-continue').addEventListener('click', () => this.createTest());

    // Answer Key tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
    });

    // Answer Key save
    document.getElementById('btn-save-key').addEventListener('click', () => this.saveAnswerKey());

    // Answer Key scan
    document.getElementById('key-scan-input').addEventListener('change', (e) => this.scanAnswerKey(e));

    // Scanner
    document.getElementById('scan-file-input').addEventListener('change', (e) => this.scanStudentSheet(e));

    // Review save
    document.getElementById('btn-save-student').addEventListener('click', () => this.saveStudentResult());

    // Results export
    document.getElementById('btn-export').addEventListener('click', () => this.exportResults());

    // Results scan more
    document.getElementById('btn-scan-more').addEventListener('click', () => {
      this.navigateTo('scanner', { testId: this.currentTest?.id });
    });

    // Enter key on inputs
    document.getElementById('input-test-name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.createTest();
    });

    document.getElementById('input-student-name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('scan-file-input').click();
    });

    // Jump to question (answer key)
    document.getElementById('key-search').addEventListener('input', (e) => {
      const q = parseInt(e.target.value);
      if (q >= 1 && q <= (this.currentTest?.numQuestions || 200)) {
        const row = document.getElementById(`answer-row-${q}`);
        if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    // Jump to question (manual entry)
    document.getElementById('manual-search').addEventListener('input', (e) => {
      const q = parseInt(e.target.value);
      if (q >= 1 && q <= (this.currentTest?.numQuestions || 200)) {
        const row = document.getElementById(`manual-row-${q}`);
        if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });

    // Manual entry submit
    document.getElementById('btn-submit-manual').addEventListener('click', () => this.submitManualEntry());
  },

  // ===== HOME VIEW =====
  async loadHomeView() {
    const tests = await storage.getAllTests();
    const list = document.getElementById('tests-list');

    if (tests.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <div class="empty-title">No Tests Yet</div>
          <div class="empty-text">Create your first test to start scanning OMR answer sheets</div>
        </div>
      `;
      return;
    }

    let html = '<div class="section-title">Your Tests</div>';

    for (const test of tests) {
      const students = await storage.getStudentsByTest(test.id);
      html += `
        <div class="glass-card clickable test-card" data-test-id="${test.id}" onclick="App.openTest('${test.id}')">
          <div class="test-icon">📝</div>
          <div class="test-info">
            <div class="test-name">${this.escapeHtml(test.name)}</div>
            <div class="test-meta">
              <span>${test.numQuestions} Qs</span>
              <span>${students.length} student${students.length !== 1 ? 's' : ''}</span>
              <span>${new Date(test.date).toLocaleDateString()}</span>
            </div>
          </div>
          <button class="delete-btn" onclick="event.stopPropagation(); App.deleteTest('${test.id}')" title="Delete test">🗑️</button>
          <div class="test-arrow">›</div>
        </div>
      `;
    }

    list.innerHTML = html;
  },

  async openTest(testId) {
    this.currentTest = await storage.getTest(testId);
    if (!this.currentTest) {
      this.toast('Test not found', 'error');
      return;
    }

    if (!this.currentTest.isKeySet) {
      this.navigateTo('answer-key', { testId });
    } else {
      this.navigateTo('results', { testId });
    }
  },

  async deleteTest(testId) {
    if (!confirm('Delete this test and all student results?')) return;
    await storage.deleteTest(testId);
    this.toast('Test deleted', 'info');
    this.loadHomeView();
  },

  createExamMode: 'CET',
  answerKeyExamMode: 'CET',

  // ===== CREATE TEST VIEW =====
  loadCreateView() {
    document.getElementById('input-test-name').value = '';
    document.getElementById('input-num-questions').value = '200';
    this.setCreateExamMode('CET');
    setTimeout(() => document.getElementById('input-test-name').focus(), 300);
  },

  setCreateExamMode(mode) {
    this.createExamMode = mode === 'NEET' ? 'NEET' : 'CET';
    document.querySelectorAll('#view-create .mode-option-card').forEach(c => c.classList.remove('active'));
    const el = document.getElementById(`create-card-${this.createExamMode.toLowerCase()}`);
    if (el) el.classList.add('active');
  },

  async createTest() {
    const name = document.getElementById('input-test-name').value.trim();
    const numQ = parseInt(document.getElementById('input-num-questions').value) || 200;

    if (!name) {
      this.toast('Please enter a test name', 'warning');
      document.getElementById('input-test-name').focus();
      return;
    }

    if (numQ < 1 || numQ > 300) {
      this.toast('Number of questions must be between 1 and 300', 'warning');
      return;
    }

    try {
      this.currentTest = await storage.createTest(name, numQ, this.createExamMode || 'CET');
      this.toast(`Test "${name}" created (${this.currentTest.examMode} mode)`, 'success');
      this.navigateTo('answer-key', { testId: this.currentTest.id });
    } catch (err) {
      this.toast('Failed to create test', 'error');
      console.error(err);
    }
  },

  // ===== ANSWER KEY VIEW =====
  setAnswerKeyMode(mode) {
    this.answerKeyExamMode = mode === 'NEET' ? 'NEET' : 'CET';
    if (this.currentTest) this.currentTest.examMode = this.answerKeyExamMode;

    document.querySelectorAll('.mode-pill-btn').forEach(btn => btn.classList.remove('active'));
    const btn = document.getElementById(`pill-mode-${this.answerKeyExamMode.toLowerCase()}`);
    if (btn) btn.classList.add('active');

    const badge = document.getElementById('current-mode-badge');
    if (badge) {
      if (this.answerKeyExamMode === 'NEET') {
        badge.className = 'mode-badge neet';
        badge.textContent = 'NEET (+4 / -1)';
      } else {
        badge.className = 'mode-badge cet';
        badge.textContent = 'CET (+1 / 0)';
      }
    }
  },

  async loadAnswerKeyView(testId) {
    if (testId && (!this.currentTest || this.currentTest.id !== testId)) {
      this.currentTest = await storage.getTest(testId);
    }

    if (!this.currentTest) {
      this.toast('Test not found', 'error');
      this.navigateTo('home');
      return;
    }

    this.setAnswerKeyMode(this.currentTest.examMode || 'CET');
    this.renderAnswerKeyGrid();
    this.updateKeyProgress();
    this.switchTab('manual');
  },

  renderAnswerKeyGrid() {
    const grid = document.getElementById('answer-key-grid');
    const numQ = this.currentTest.numQuestions;
    const key = this.currentTest.answerKey;
    const options = ['A', 'B', 'C', 'D'];

    let html = '<div class="answer-columns">';
    const perCol = 50;
    const numCols = Math.ceil(numQ / perCol);

    for (let c = 0; c < numCols; c++) {
      const startQ = c * perCol + 1;
      const endQ = Math.min((c + 1) * perCol, numQ);
      html += `
        <div class="answer-grid">
          <div class="answer-column-header">
            <span>Questions ${startQ} – ${endQ}</span>
            <span class="text-xs text-muted">Part ${c + 1}</span>
          </div>
      `;

      for (let q = startQ; q <= endQ; q++) {
        const i = q - 1;
        const ans = key[i];
        const answered = ans !== null;
        const isMulti = ans === 'MULTIPLE';
        const multiOpts = (this.keyMultiDetails && this.keyMultiDetails[q]) || [];
        const multiBadge = isMulti
          ? `<span class="badge-multi-key" title="Double filled: strict rule gives 0 marks" style="font-size:10px; font-weight:700; color:#ef4444; background:rgba(239,68,68,0.12); padding:2px 5px; border-radius:4px; margin-left:4px;">⚠️ MULTI</span>`
          : '';

        html += `
          <div class="answer-row ${isMulti ? 'multi-row-highlight' : ''}" id="answer-row-${q}">
            <span class="q-num ${answered ? (isMulti ? 'multi-num' : 'answered') : ''}">${q}</span>
            ${multiBadge}
            <div class="answer-bubbles">
              ${options.map(opt => {
                let cls = 'bubble';
                if (ans === opt) {
                  cls += ' selected';
                } else if (isMulti && multiOpts.includes(opt)) {
                  cls += ' multi';
                }
                return `
                  <button class="${cls}"
                          data-q="${i}" data-opt="${opt}"
                          title="${isMulti && multiOpts.includes(opt) ? `Option ${opt} detected as filled (tap to set as single key)` : `Option ${opt}`}"
                          onclick="App.selectKeyAnswer(${i}, '${opt}')">
                    ${opt}
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }
      html += '</div>';
    }

    html += '</div>';
    grid.innerHTML = html;
  },

  selectKeyAnswer(qIndex, option) {
    const q = qIndex + 1;
    if (this.keyMultiDetails && this.keyMultiDetails[q]) {
      delete this.keyMultiDetails[q];
    }
    // Update the data
    this.currentTest.answerKey[qIndex] = option;

    // Re-render row
    this.renderAnswerKeyGrid();
    this.updateKeyProgress();
  },

  updateKeyProgress() {
    const answered = this.currentTest.answerKey.filter(a => a !== null).length;
    const total = this.currentTest.numQuestions;
    const pct = Math.round((answered / total) * 100);

    document.getElementById('key-progress-fill').style.width = `${pct}%`;
    document.getElementById('key-progress-text').textContent = `${answered} / ${total} answered`;

    // Enable/disable save button
    const saveBtn = document.getElementById('btn-save-key');
    saveBtn.disabled = answered === 0;
  },

  switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    document.getElementById(`tab-${tabName}`).classList.add('active');
  },

  async scanAnswerKey(e) {
    const file = e.target.files[0];
    if (!file) return;

    // Show preview
    const preview = document.getElementById('key-scan-preview');
    const previewImg = document.getElementById('key-scan-img');
    previewImg.src = URL.createObjectURL(file);
    preview.classList.remove('hidden');

    this.showLoading('Scanning answer key sheet...');

    try {
      const debugCanvas = document.getElementById('key-debug-canvas');
      omrScanner.setDebugCanvas(debugCanvas);

      const result = await omrScanner.processFile(file, this.currentTest.numQuestions);
      this.keyMultiDetails = result.multiDetails || {};

      // Apply detected answers to the key
      let singleDetected = 0;
      let multiDetected = 0;
      for (let i = 0; i < result.answers.length; i++) {
        if (result.answers[i]) {
          this.currentTest.answerKey[i] = result.answers[i];
          if (result.answers[i] === 'MULTIPLE') multiDetected++;
          else singleDetected++;
        }
      }

      // Re-render the grid to show detected answers
      this.renderAnswerKeyGrid();
      this.updateKeyProgress();
      this.switchTab('manual'); // Switch to manual tab to review

      const total = this.currentTest.numQuestions;
      const blank = total - singleDetected - multiDetected;
      if (multiDetected > 0) {
        this.toast(`Scanned ${total} questions: ${singleDetected} single, ⚠️ ${multiDetected} question(s) with 2 options filled, ${blank} blank.`, 'warning');
      } else if (blank > 0) {
        this.toast(`Scanned ${total} questions: ${singleDetected} detected, ${blank} blank on sheet.`, 'info');
      } else {
        this.toast(`Scanned all ${total}/${total} answers successfully!`, 'success');
      }

      document.getElementById('key-debug-wrap').classList.remove('hidden');
    } catch (err) {
      console.error('[App] Scan error:', err);
      this.toast('Scan failed: ' + err.message, 'error');
    } finally {
      this.hideLoading();
      e.target.value = '';
    }
  },

  async saveAnswerKey() {
    const answered = this.currentTest.answerKey.filter(a => a !== null).length;
    if (answered === 0) {
      this.toast('Please mark at least one answer', 'warning');
      return;
    }

    try {
      const mode = this.answerKeyExamMode || this.currentTest.examMode || 'CET';
      await storage.updateAnswerKey(this.currentTest.id, this.currentTest.answerKey, mode);
      this.toast(`Answer key saved (${answered} answers, ${mode} Mode)`, 'success');
      this.navigateTo('scanner', { testId: this.currentTest.id });
    } catch (err) {
      this.toast('Failed to save answer key', 'error');
      console.error(err);
    }
  },

  // ===== SCANNER VIEW =====
  async loadScannerView(testId) {
    if (testId && (!this.currentTest || this.currentTest.id !== testId)) {
      this.currentTest = await storage.getTest(testId);
    }

    document.getElementById('input-student-name').value = '';
    document.getElementById('scan-preview').classList.add('hidden');
    document.getElementById('scan-debug-wrap').classList.add('hidden');

    // Scanner is always ready (pure Canvas — no external deps)
    const statusEl = document.getElementById('cv-status');
    if (statusEl) {
      statusEl.innerHTML = '<span class="text-success">● Ready</span>';
    }

    setTimeout(() => document.getElementById('input-student-name').focus(), 300);
  },

  // Manual entry for student answers
  startManualEntry() {
    const studentName = document.getElementById('input-student-name').value.trim();
    if (!studentName) {
      this.toast('Please enter the student name first', 'warning');
      document.getElementById('input-student-name').focus();
      return;
    }
    this.currentStudentName = studentName;
    this.currentAnswers = new Array(this.currentTest.numQuestions).fill(null);
    this.navigateTo('manual-entry');
  },

  loadManualEntryView() {
    const grid = document.getElementById('manual-entry-grid');
    const numQ = this.currentTest.numQuestions;
    const options = ['A', 'B', 'C', 'D'];

    let html = '<div class="answer-columns">';
    const perCol = 50;
    const numCols = Math.ceil(numQ / perCol);

    for (let c = 0; c < numCols; c++) {
      const startQ = c * perCol + 1;
      const endQ = Math.min((c + 1) * perCol, numQ);
      html += `
        <div class="answer-grid">
          <div class="answer-column-header">
            <span>Questions ${startQ} – ${endQ}</span>
            <span class="text-xs text-muted">Part ${c + 1}</span>
          </div>
      `;

      for (let q = startQ; q <= endQ; q++) {
        const i = q - 1;
        const ans = this.currentAnswers[i];
        html += `
          <div class="answer-row" id="manual-row-${q}">
            <span class="q-num ${ans ? 'answered' : ''}">${q}</span>
            <div class="answer-bubbles">
              ${options.map(opt => `
                <button class="bubble ${ans === opt ? 'selected' : ''}"
                        data-q="${i}" data-opt="${opt}"
                        onclick="App.selectManualAnswer(${i}, '${opt}')">
                  ${opt}
                </button>
              `).join('')}
            </div>
          </div>
        `;
      }
      html += '</div>';
    }

    html += '</div>';
    grid.innerHTML = html;
    this.updateManualProgress();
  },

  selectManualAnswer(qIndex, option) {
    if (this.currentAnswers[qIndex] === option) {
      this.currentAnswers[qIndex] = null;
    } else {
      this.currentAnswers[qIndex] = option;
    }

    const row = document.getElementById(`manual-row-${qIndex + 1}`);
    row.querySelectorAll('.bubble').forEach(b => b.classList.remove('selected'));
    if (this.currentAnswers[qIndex]) {
      row.querySelector(`[data-opt="${option}"]`).classList.add('selected');
      row.querySelector('.q-num').classList.add('answered');
    } else {
      row.querySelector('.q-num').classList.remove('answered');
    }
    this.updateManualProgress();
  },

  updateManualProgress() {
    const answered = this.currentAnswers.filter(a => a !== null).length;
    const total = this.currentTest.numQuestions;
    const pct = Math.round((answered / total) * 100);

    document.getElementById('manual-progress-fill').style.width = `${pct}%`;
    document.getElementById('manual-progress-text').textContent = `${answered} / ${total} answered`;
  },

  submitManualEntry() {
    const answered = this.currentAnswers.filter(a => a !== null).length;
    if (answered === 0) {
      this.toast('Please mark at least one answer', 'warning');
      return;
    }

    this.navigateTo('review', {
      answers: this.currentAnswers,
      studentName: this.currentStudentName
    });
  },

  async scanStudentSheet(e) {
    const file = e.target.files[0];
    if (!file) return;

    const studentName = document.getElementById('input-student-name').value.trim();
    if (!studentName) {
      this.toast('Please enter the student name first', 'warning');
      document.getElementById('input-student-name').focus();
      e.target.value = '';
      return;
    }

    // Show preview
    const preview = document.getElementById('scan-preview');
    const previewImg = document.getElementById('scan-img');
    previewImg.src = URL.createObjectURL(file);
    preview.classList.remove('hidden');

    this.showLoading('Scanning answer sheet...');
    this.currentStudentName = studentName;

    try {
      const debugCanvas = document.getElementById('scan-debug-canvas');
      omrScanner.setDebugCanvas(debugCanvas);

      // Pass official Answer Key to scanner for immediate real-time comparison overlay
      const result = await omrScanner.processFile(
        file,
        this.currentTest.numQuestions,
        this.currentTest.answerKey
      );
      this.currentAnswers = result.answers;
      this.currentConfidence = result.confidence || [];

      document.getElementById('scan-debug-wrap').classList.remove('hidden');

      let displayName = this.currentStudentName;
      if (result.rollNumber) {
        if (!displayName || displayName.toLowerCase().startsWith('student')) {
          displayName = `Roll ${result.rollNumber}`;
          this.currentStudentName = displayName;
        }
      }

      // Show feedback with multi-bubble count
      const singleAnswered = result.answers.filter(a => a !== null && a !== 'MULTIPLE').length;
      const multiCount = result.answers.filter(a => a === 'MULTIPLE').length;
      const total = this.currentTest.numQuestions;
      const blank = total - singleAnswered - multiCount;

      let msg = `Scanned ${total} Qs: ${singleAnswered} answered, ${blank} blank`;
      if (multiCount > 0) {
        msg += `, ⚠️ ${multiCount} double-bubbled (0 marks)`;
      }
      this.toast(msg + '.', 'success');

      // Navigate to review
      this.navigateTo('review', {
        answers: result.answers,
        confidence: result.confidence,
        studentName: displayName,
        rollNumber: result.rollNumber
      });

    } catch (err) {
      console.error('[App] Scan error:', err);
      this.toast('Scan failed: ' + err.message, 'error');
    } finally {
      this.hideLoading();
      e.target.value = '';
    }
  },

  // ===== REVIEW VIEW =====
  loadReviewView(data) {
    const answers = data.answers || this.currentAnswers;
    const confidence = data.confidence || this.currentConfidence || [];
    const key = this.currentTest.answerKey;
    const numQ = this.currentTest.numQuestions;
    const options = ['A', 'B', 'C', 'D'];
    const mode = this.currentTest.examMode || 'CET';

    // Calculate score using strict rules
    const scored = storage._calculateScore(answers, key, numQ, mode);

    const circumference = 2 * Math.PI * 70; // radius=70
    const offset = circumference - (scored.percentage / 100) * circumference;

    document.getElementById('review-score-value').textContent = `${scored.percentage}%`;
    const scoreLabel = `${scored.marks} / ${scored.maxMarks} marks (${scored.examMode} Mode)`;
    document.getElementById('review-score-label').textContent = scoreLabel;

    // Detailed breakdown chips
    const chipsEl = document.getElementById('review-breakdown-chips');
    if (chipsEl) {
      const correctMarks = scored.correctCount * (scored.examMode === 'NEET' ? 4 : 1);
      const wrongMarks = scored.examMode === 'NEET' ? `-${scored.wrongCount}` : '0';
      chipsEl.innerHTML = `
        <span class="chip-item chip-correct">✓ Correct: <strong>${scored.correctCount}</strong> (+${correctMarks})</span>
        <span class="chip-item chip-wrong">✗ Wrong: <strong>${scored.wrongCount}</strong> (${wrongMarks})</span>
        <span class="chip-item chip-blank">– Blank: <strong>${scored.blankCount}</strong> (0)</span>
        <span class="chip-item chip-multi ${scored.multiCount > 0 ? 'highlight' : ''}">⚠️ 2 Options: <strong>${scored.multiCount}</strong> (0 marks)</span>
      `;
    }

    const breakdownEl = document.getElementById('review-breakdown-text');
    if (breakdownEl) {
      breakdownEl.innerHTML = `<strong>${scored.examMode} Marking:</strong> Correct: ${scored.examMode === 'NEET' ? '+4' : '+1'} • Wrong: ${scored.examMode === 'NEET' ? '-1' : '0'} • Blank: 0 • Double-bubbled: 0<br><span style="font-size: 11px; opacity: 0.85;">Tap any bubble below to adjust or clear an answer</span>`;
    }

    let studentHeader = data.studentName || this.currentStudentName;
    if (data.rollNumber && !studentHeader.includes(data.rollNumber)) {
      studentHeader += ` (Roll: ${data.rollNumber})`;
    }
    document.getElementById('review-student-name').textContent = studentHeader;

    const progressCircle = document.getElementById('review-score-progress');
    if (progressCircle) {
      progressCircle.style.strokeDasharray = circumference;
      progressCircle.style.strokeDashoffset = circumference;
      setTimeout(() => {
        progressCircle.style.strokeDashoffset = offset;
      }, 100);
    }

    // Render answer review grid
    const grid = document.getElementById('review-grid');
    let html = '<div class="answer-columns">';
    const perCol = 50;
    const numCols = Math.ceil(numQ / perCol);

    for (let c = 0; c < numCols; c++) {
      const startQ = c * perCol + 1;
      const endQ = Math.min((c + 1) * perCol, numQ);
      html += `
        <div class="answer-grid">
          <div class="answer-column-header">
            <span>Questions ${startQ} – ${endQ}</span>
            <span class="text-xs text-muted">Part ${c + 1}</span>
          </div>
      `;

      for (let q = startQ; q <= endQ; q++) {
        const i = q - 1;
        const studentAns = answers[i];
        const correctAns = key[i];
        const conf = confidence[i] || 0;
        const isLowConf = studentAns && studentAns !== 'MULTIPLE' && conf > 0 && conf < 0.75;
        const isMulti = studentAns === 'MULTIPLE';
        const isCorrect = !isMulti && studentAns && correctAns && studentAns === correctAns;
        const isWrong = !isMulti && studentAns && correctAns && studentAns !== correctAns;
        const isUnanswered = !studentAns && correctAns;

        const keyBadge = correctAns ? `<span class="row-key-tag">Key: ${correctAns}</span>` : '';

        let statusIcon = '';
        if (isMulti) {
          statusIcon = '<span class="status-icon text-error" title="Double filled: strict rule gives 0 marks">⚠️ 2 Options (0)</span>';
        } else if (isCorrect) {
          statusIcon = `<span class="status-icon text-success">✓ Correct (+${mode === 'NEET' ? 4 : 1})</span>`;
        } else if (isWrong) {
          statusIcon = `<span class="status-icon text-error">✗ Wrong (${mode === 'NEET' ? -1 : 0})</span>`;
        } else if (isUnanswered) {
          statusIcon = '<span class="status-icon text-muted">— Blank (0)</span>';
        }

        const lowConfBadge = isLowConf
          ? '<span title="Low confidence — please verify" style="font-size: 10px; color: var(--warning); margin-left: 2px;">⚠️</span>'
          : '';

        const rowBg = isMulti
          ? 'background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 8px;'
          : (isLowConf ? 'background: rgba(245, 158, 11, 0.08); border-radius: 8px;' : '');

        html += `
          <div class="answer-row" id="review-row-${q}" style="${rowBg}">
            <span class="q-num ${isCorrect ? 'answered' : (isMulti ? 'multi-num' : '')}">${q}${lowConfBadge}</span>
            ${keyBadge}
            <div class="answer-bubbles">
              ${options.map(opt => {
                let cls = 'bubble';
                if (isMulti) {
                  cls += ' multi';
                } else if (opt === studentAns && isCorrect) {
                  cls += ' correct';
                } else if (opt === studentAns && isWrong) {
                  cls += ' wrong';
                } else if (opt === correctAns && isWrong) {
                  cls += ' missed';
                } else if (opt === studentAns) {
                  cls += ' selected';
                }
                return `
                  <button class="${cls}"
                          data-q="${i}" data-opt="${opt}"
                          onclick="App.correctAnswer(${i}, '${opt}')">
                    ${opt}
                  </button>
                `;
              }).join('')}
            </div>
            ${statusIcon}
          </div>
        `;
      }
      html += '</div>';
    }

    html += '</div>';
    grid.innerHTML = html;
  },

  correctAnswer(qIndex, option) {
    if (this.currentAnswers[qIndex] === option) {
      this.currentAnswers[qIndex] = null;
    } else {
      this.currentAnswers[qIndex] = option;
    }

    if (this.currentConfidence) {
      this.currentConfidence[qIndex] = 1.0;
    }

    this.loadReviewView({
      answers: this.currentAnswers,
      confidence: this.currentConfidence,
      studentName: this.currentStudentName
    });
  },

  /**
   * Save student record and immediately auto-store/sync to Excel (.xlsx) file
   */
  async saveStudentResult(forceDownload = false) {
    if (!this.currentStudentName) {
      this.toast('Student name is missing', 'error');
      return;
    }

    try {
      const student = await storage.saveStudent(
        this.currentTest.id,
        this.currentStudentName,
        this.currentAnswers,
        this.currentTest.answerKey,
        this.currentTest.examMode || 'CET'
      );

      // Fetch all students evaluated for this test to build updated master sheet
      const allStudents = await storage.getStudentsByTest(this.currentTest.id);

      // Check auto-export toggle in UI (defaults to true)
      const chkAuto = document.getElementById('chk-auto-export');
      const shouldDownload = (chkAuto ? chkAuto.checked : true) || forceDownload;

      let exportInfo = null;
      try {
        exportInfo = excelExporter.exportResults(this.currentTest, allStudents, shouldDownload);
      } catch (expErr) {
        console.warn('[Excel Export Error]', expErr);
      }

      const syncNote = (exportInfo && shouldDownload)
        ? ` • Synced & Downloaded ${exportInfo.filename} 📥`
        : ' • Stored in examination database';

      this.toast(`✅ Saved: ${student.name} (${student.score}/${student.maxMarks})${syncNote}`, 'success');

      this.currentAnswers = [];
      this.currentStudentName = '';
      this.navigateTo('scanner', { testId: this.currentTest.id });
    } catch (err) {
      this.toast('Failed to save result: ' + err.message, 'error');
      console.error(err);
    }
  },

  /**
   * Quick export of current test's students to Excel (.xlsx)
   */
  async exportCurrentResults() {
    try {
      if (!this.currentTest) return;
      const allStudents = await storage.getStudentsByTest(this.currentTest.id);
      if (allStudents.length === 0) {
        this.toast('No student records to export yet', 'warning');
        return;
      }
      const res = excelExporter.exportResults(this.currentTest, allStudents, true);
      this.toast(`Downloaded: ${res.filename}`, 'success');
    } catch (err) {
      this.toast('Export failed: ' + err.message, 'error');
    }
  },

  // ===== RESULTS VIEW =====
  async loadResultsView(testId) {
    if (testId && (!this.currentTest || this.currentTest.id !== testId)) {
      this.currentTest = await storage.getTest(testId);
    }

    if (!this.currentTest) {
      this.navigateTo('home');
      return;
    }

    const students = await storage.getStudentsByTest(this.currentTest.id);
    const stats = await storage.getTestStats(this.currentTest.id);

    // Render stats
    document.getElementById('stat-students').textContent = stats.count;
    document.getElementById('stat-average').textContent = stats.count > 0 ? `${stats.avgScore} marks` : '—';
    document.getElementById('stat-highest').textContent = stats.count > 0 ? `${stats.highest}%` : '—';
    document.getElementById('stat-pass-rate').textContent = stats.count > 0 ? `${stats.passRate}%` : '—';

    // Render table
    const tbody = document.getElementById('results-tbody');

    if (students.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 32px; color: var(--text-muted);">
            No students scanned yet. Tap "Scan Student" to begin.
          </td>
        </tr>
      `;
      document.getElementById('btn-export').disabled = true;
      return;
    }

    document.getElementById('btn-export').disabled = false;

    // Sort by name
    const sorted = [...students].sort((a, b) => a.name.localeCompare(b.name));
    let html = '';

    sorted.forEach((s, i) => {
      const badgeClass = s.percentage >= 70 ? 'high' : (s.percentage >= 40 ? 'medium' : 'low');
      const modeClass = (s.examMode || 'CET').toLowerCase();
      html += `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${this.escapeHtml(s.name)}</strong></td>
          <td><span class="mode-badge ${modeClass}">${s.examMode || 'CET'}</span></td>
          <td><strong>${s.score}</strong> / ${s.maxMarks || s.total}</td>
          <td><span class="text-xs text-secondary">✓${s.correctCount || 0} • ✗${s.wrongCount || 0} ${s.multiCount ? `• ⚠️${s.multiCount}` : ''}</span></td>
          <td><span class="score-badge ${badgeClass}">${s.percentage}%</span></td>
          <td>
            <button class="delete-btn" onclick="App.deleteStudent('${s.id}')" title="Delete">🗑️</button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  },

  async deleteStudent(studentId) {
    if (!confirm('Delete this student record?')) return;
    await storage.deleteStudent(studentId);
    this.toast('Student deleted', 'info');
    this.loadResultsView(this.currentTest.id);
  },

  async exportResults() {
    try {
      const students = await storage.getStudentsByTest(this.currentTest.id);
      if (students.length === 0) {
        this.toast('No students to export', 'warning');
        return;
      }

      const filename = excelExporter.exportResults(this.currentTest, students);
      this.toast(`Downloaded: ${filename}`, 'success');
    } catch (err) {
      this.toast('Export failed: ' + err.message, 'error');
      console.error(err);
    }
  },

  // ===== UTILITIES =====
  showLoading(text = 'Processing...') {
    const overlay = document.getElementById('loading-overlay');
    document.getElementById('loading-text').textContent = text;
    overlay.classList.remove('hidden');
  },

  hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
  },

  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${icons[type]}</span>
      <span>${this.escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    // Auto-remove after 3.5s
    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

// Start app when DOM is ready
document.addEventListener('DOMContentLoaded', () => App.init());

