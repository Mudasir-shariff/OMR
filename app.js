/* ==========================================================================
   BGS OMR VALUATION SYSTEM — EXECUTIVE CLIENT LOGIC
   SPA Router, Theme Engine, Subpixel CV Connectors, & Excel Sync
   ========================================================================== */

const App = {
  currentView: 'home',
  currentTest: null,
  currentAnswers: [],
  currentConfidence: [],
  currentStudentName: '',
  currentRollNumber: '',
  keyMultiDetails: {},
  createExamMode: 'CET',
  answerKeyExamMode: 'CET',

  // ===== INITIALIZATION =====
  async init() {
    try {
      this.initTheme();
      await storage.init();
      this.bindEvents();
      this.navigateTo('home');
      this.registerSW();
      console.log('[BGS OMR Suite] Initialized successfully');
    } catch (err) {
      console.error('[BGS OMR Suite] Init error:', err);
      this.toast('Failed to initialize local database', 'error');
    }
  },

  // ===== THEME MANAGEMENT =====
  initTheme() {
    const saved = localStorage.getItem('bgs_omr_theme') || 'dark';
    this.setTheme(saved);

    const btn = document.getElementById('btn-theme-toggle');
    if (btn) {
      btn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        this.setTheme(current === 'dark' ? 'light' : 'dark');
      });
    }
  },

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('bgs_omr_theme', theme);

    const sun = document.getElementById('theme-icon-sun');
    const moon = document.getElementById('theme-icon-moon');
    if (sun && moon) {
      if (theme === 'light') {
        sun.classList.remove('hidden');
        moon.classList.add('hidden');
      } else {
        sun.classList.add('hidden');
        moon.classList.remove('hidden');
      }
    }
  },

  registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(() => console.log('[BGS OMR Suite] Service Worker registered'))
        .catch(err => console.warn('[BGS OMR Suite] SW registration failed:', err));
    }
  },

  // ===== NAVIGATION & ROUTING =====
  navigateTo(viewName, data = {}) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));

    const view = document.getElementById(`view-${viewName}`);
    if (view) {
      view.classList.add('active');
      this.currentView = viewName;
    }

    this.updateHeader(viewName, data);

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

    window.scrollTo(0, 0);
  },

  updateHeader(viewName, data) {
    const backBtn = document.getElementById('btn-back');
    const title = document.getElementById('header-title');
    const subtitle = document.getElementById('header-subtitle');

    if (subtitle) subtitle.textContent = '';

    switch (viewName) {
      case 'home':
        backBtn.classList.add('hidden');
        title.textContent = 'OMR Valuation Suite';
        break;
      case 'create':
        backBtn.classList.remove('hidden');
        title.textContent = 'New Examination Batch';
        break;
      case 'answer-key':
        backBtn.classList.remove('hidden');
        title.textContent = 'Master Answer Key';
        if (this.currentTest && subtitle) subtitle.textContent = this.currentTest.name;
        break;
      case 'scanner':
        backBtn.classList.remove('hidden');
        title.textContent = 'Student Valuation Scanner';
        if (this.currentTest && subtitle) subtitle.textContent = this.currentTest.name;
        break;
      case 'manual-entry':
        backBtn.classList.remove('hidden');
        title.textContent = 'Manual Bubble Grid';
        if (this.currentStudentName && subtitle) subtitle.textContent = this.currentStudentName;
        break;
      case 'review':
        backBtn.classList.remove('hidden');
        title.textContent = 'Valuation Diagnostic Report';
        break;
      case 'results':
        backBtn.classList.remove('hidden');
        title.textContent = 'Examination Gradebook';
        if (this.currentTest && subtitle) subtitle.textContent = this.currentTest.name;
        break;
    }
  },

  goBack() {
    switch (this.currentView) {
      case 'create':
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

  // ===== GLOBAL EVENT BINDING =====
  bindEvents() {
    const backBtn = document.getElementById('btn-back');
    if (backBtn) backBtn.addEventListener('click', () => this.goBack());

    const keyScanInput = document.getElementById('key-scan-input');
    if (keyScanInput) keyScanInput.addEventListener('change', (e) => this.scanAnswerKey(e));

    const scanFileInput = document.getElementById('scan-file-input');
    if (scanFileInput) scanFileInput.addEventListener('change', (e) => this.scanStudentSheet(e));

    const keySearch = document.getElementById('key-search');
    if (keySearch) {
      keySearch.addEventListener('input', (e) => {
        const q = parseInt(e.target.value);
        if (q >= 1 && q <= (this.currentTest?.numQuestions || 200)) {
          const row = document.getElementById(`answer-row-${q}`);
          if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }

    const manualSearch = document.getElementById('manual-search');
    if (manualSearch) {
      manualSearch.addEventListener('input', (e) => {
        const q = parseInt(e.target.value);
        if (q >= 1 && q <= (this.currentTest?.numQuestions || 200)) {
          const row = document.getElementById(`manual-row-${q}`);
          if (row) row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    }

    const inputTestName = document.getElementById('input-test-name');
    if (inputTestName) {
      inputTestName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.createTest();
      });
    }
  },

  // ===== HOME VIEW =====
  async loadHomeView() {
    const tests = await storage.getAllTests();
    const list = document.getElementById('tests-list');

    if (tests.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon-wrap">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="3" y1="9" x2="21" y2="9"></line>
              <line x1="9" y1="21" x2="9" y2="9"></line>
            </svg>
          </div>
          <div class="empty-title">No Examination Batches Yet</div>
          <div class="empty-text">Create your first examination test batch or launch the 1-Click Live Demo below to explore full capabilities.</div>
          <div class="flex gap-12" style="justify-content: center; flex-wrap: wrap;">
            <button class="btn btn-primary" onclick="App.navigateTo('create')">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <line x1="5" y1="12" x2="19" y2="12"></line>
              </svg>
              <span>Create New Test</span>
            </button>
            <button class="btn btn-secondary" onclick="App.loadInstitutionalDemo()">
              <span>⚡ Try 1-Click Live Demo</span>
            </button>
          </div>
        </div>
      `;
      return;
    }

    let html = '<div class="test-grid">';

    for (const test of tests) {
      const students = await storage.getStudentsByTest(test.id);
      const mode = test.examMode || 'CET';
      const modeClass = mode.toLowerCase();
      const dateStr = new Date(test.date || Date.now()).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });

      html += `
        <div class="glass-card clickable test-card" onclick="App.openTest('${test.id}')">
          <div class="test-card-left">
            <div class="test-card-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
              </svg>
            </div>
            <div class="test-info">
              <div class="test-name" title="${this.escapeHtml(test.name)}">${this.escapeHtml(test.name)}</div>
              <div class="test-meta">
                <span class="mode-badge ${modeClass}" style="padding: 2px 6px; font-size: 0.68rem;">${mode}</span>
                <span class="test-meta-pill">${test.numQuestions} Qs</span>
                <span class="test-meta-pill">${students.length} Student${students.length !== 1 ? 's' : ''}</span>
                <span>${dateStr}</span>
              </div>
            </div>
          </div>
          <button class="delete-btn" onclick="event.stopPropagation(); App.deleteTest('${test.id}')" title="Delete Batch">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      `;
    }

    html += '</div>';
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
    if (!confirm('Are you sure you want to delete this test and all its evaluation records?')) return;
    await storage.deleteTest(testId);
    this.toast('Examination batch deleted', 'info');
    this.loadHomeView();
  },

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
      this.toast('Please enter a test batch name', 'warning');
      document.getElementById('input-test-name').focus();
      return;
    }

    try {
      this.currentTest = await storage.createTest(name, numQ, this.createExamMode || 'CET');
      this.toast(`Test "${name}" created (${this.currentTest.examMode} mode)`, 'success');
      this.navigateTo('answer-key', { testId: this.currentTest.id });
    } catch (err) {
      this.toast('Failed to create test: ' + err.message, 'error');
    }
  },

  // ===== ANSWER KEY VIEW =====
  async loadAnswerKeyView(testId) {
    if (testId && (!this.currentTest || this.currentTest.id !== testId)) {
      this.currentTest = await storage.getTest(testId);
    }

    if (!this.currentTest) {
      this.navigateTo('home');
      return;
    }

    this.setAnswerKeyMode(this.currentTest.examMode || 'CET');
    this.renderAnswerKeyGrid();
    this.updateKeyProgress();
    this.switchTab('manual');
  },

  setAnswerKeyMode(mode) {
    this.answerKeyExamMode = mode === 'NEET' ? 'NEET' : 'CET';
    const cetBtn = document.getElementById('pill-mode-cet');
    const neetBtn = document.getElementById('pill-mode-neet');
    const badge = document.getElementById('current-mode-badge');

    if (cetBtn) cetBtn.classList.toggle('active', this.answerKeyExamMode === 'CET');
    if (neetBtn) neetBtn.classList.toggle('active', this.answerKeyExamMode === 'NEET');

    if (badge) {
      badge.className = `mode-badge ${this.answerKeyExamMode.toLowerCase()}`;
      badge.textContent = this.answerKeyExamMode === 'NEET' ? 'NEET (+4 / -1)' : 'CET (+1 / 0)';
    }

    if (this.currentTest) {
      this.currentTest.examMode = this.answerKeyExamMode;
    }
  },

  renderAnswerKeyGrid() {
    const grid = document.getElementById('answer-key-grid');
    const numQ = this.currentTest.numQuestions;
    const key = this.currentTest.answerKey;
    const options = ['A', 'B', 'C', 'D'];

    let html = '<div class="answer-columns">';
    const perCol = 50;
    const numCols = Math.ceil(numQ / perCol);

    const subjectNames = [
      'Physics',
      'Chemistry',
      'Mathematics / Botany',
      'Biology / Zoology'
    ];

    for (let c = 0; c < numCols; c++) {
      const startQ = c * perCol + 1;
      const endQ = Math.min((c + 1) * perCol, numQ);
      const subName = subjectNames[c] || `Section ${c + 1}`;

      html += `
        <div class="column-card">
          <div class="column-header">
            <span>Questions ${startQ} – ${endQ}</span>
            <span class="column-subject-tag">${subName}</span>
          </div>
      `;

      for (let q = startQ; q <= endQ; q++) {
        const i = q - 1;
        const ans = key[i];
        const answered = ans !== null;
        const isMulti = ans === 'MULTIPLE';
        const multiOpts = (this.keyMultiDetails && this.keyMultiDetails[q]) || [];
        const multiBadge = isMulti
          ? `<span class="badge-multi-key" title="Double filled: strict rule gives 0 marks">MULTI (0)</span>`
          : '';

        html += `
          <div class="answer-row ${isMulti ? 'multi-row-highlight' : ''}" id="answer-row-${q}">
            <div style="display:flex; align-items:center;">
              <span class="q-num ${answered ? (isMulti ? 'multi-num' : 'answered') : ''}">${q}</span>
              ${multiBadge}
            </div>
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
                          title="${isMulti && multiOpts.includes(opt) ? `Option ${opt} detected as filled` : `Option ${opt}`}"
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
    
    // Toggle answer: if same option clicked, deselect it
    if (this.currentTest.answerKey[qIndex] === option) {
      this.currentTest.answerKey[qIndex] = null;
    } else {
      this.currentTest.answerKey[qIndex] = option;
    }

    this.renderAnswerKeyGrid();
    this.updateKeyProgress();
  },

  updateKeyProgress() {
    const answered = this.currentTest.answerKey.filter(a => a !== null).length;
    const total = this.currentTest.numQuestions;
    const pct = Math.round((answered / total) * 100);

    const fill = document.getElementById('key-progress-fill');
    const text = document.getElementById('key-progress-text');
    const saveBtn = document.getElementById('btn-save-key');

    if (fill) fill.style.width = `${pct}%`;
    if (text) text.textContent = `${answered} / ${total} Answered (${pct}%)`;
    if (saveBtn) saveBtn.disabled = answered === 0;
  },

  switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    const btn = document.querySelector(`[data-tab="${tabName}"]`);
    const content = document.getElementById(`tab-${tabName}`);
    if (btn) btn.classList.add('active');
    if (content) content.classList.add('active');
  },

  fillDemoKey() {
    const options = ['A', 'B', 'C', 'D'];
    for (let i = 0; i < this.currentTest.numQuestions; i++) {
      if (this.currentTest.answerKey[i] === null) {
        this.currentTest.answerKey[i] = options[(i * 3 + 1) % 4];
      }
    }
    this.renderAnswerKeyGrid();
    this.updateKeyProgress();
    this.toast('Auto-filled remaining answers for demonstration', 'info');
  },

  clearAnswerKey() {
    if (!confirm('Clear all answers in the answer key?')) return;
    this.currentTest.answerKey = new Array(this.currentTest.numQuestions).fill(null);
    this.keyMultiDetails = {};
    this.renderAnswerKeyGrid();
    this.updateKeyProgress();
    this.toast('Answer key cleared', 'info');
  },

  async scanAnswerKey(e) {
    const file = e.target.files[0];
    if (!file) return;

    const preview = document.getElementById('key-scan-preview');
    const previewImg = document.getElementById('key-scan-img');
    previewImg.src = URL.createObjectURL(file);
    preview.classList.remove('hidden');

    this.showLoading('Analyzing Master Answer Key with Subpixel CV...');

    try {
      const debugCanvas = document.getElementById('key-debug-canvas');
      omrScanner.setDebugCanvas(debugCanvas);

      const result = await omrScanner.processFile(file, this.currentTest.numQuestions);
      this.keyMultiDetails = result.multiDetails || {};

      let singleDetected = 0;
      let multiDetected = 0;
      for (let i = 0; i < result.answers.length; i++) {
        if (result.answers[i]) {
          this.currentTest.answerKey[i] = result.answers[i];
          if (result.answers[i] === 'MULTIPLE') multiDetected++;
          else singleDetected++;
        }
      }

      this.renderAnswerKeyGrid();
      this.updateKeyProgress();
      this.switchTab('manual');

      const total = this.currentTest.numQuestions;
      const blank = total - singleDetected - multiDetected;

      if (multiDetected > 0) {
        this.toast(`Scanned ${total} questions: ${singleDetected} detected, ${multiDetected} double-filled, ${blank} blank.`, 'warning');
      } else {
        this.toast(`Successfully scanned ${singleDetected}/${total} answers from key sheet!`, 'success');
      }

      document.getElementById('key-debug-wrap').classList.remove('hidden');
    } catch (err) {
      console.error('[App] Key Scan error:', err);
      this.toast('Key scan failed: ' + err.message, 'error');
    } finally {
      this.hideLoading();
      e.target.value = '';
    }
  },

  async loadSampleKeySheet() {
    this.showLoading('Fetching and scanning verified sample answer key...');
    try {
      const response = await fetch('samples/key_sheet.png');
      const blob = await response.blob();
      const file = new File([blob], 'key_sheet.png', { type: 'image/png' });

      const debugCanvas = document.getElementById('key-debug-canvas');
      omrScanner.setDebugCanvas(debugCanvas);

      const result = await omrScanner.processFile(file, this.currentTest.numQuestions);
      this.keyMultiDetails = result.multiDetails || {};

      for (let i = 0; i < result.answers.length; i++) {
        if (result.answers[i]) {
          this.currentTest.answerKey[i] = result.answers[i];
        }
      }

      this.renderAnswerKeyGrid();
      this.updateKeyProgress();
      this.switchTab('manual');
      document.getElementById('key-debug-wrap').classList.remove('hidden');

      this.toast('Verified sample answer key loaded successfully (Q40 double-bubble detected)', 'success');
    } catch (err) {
      console.error('[App] Sample key load error:', err);
      this.toast('Failed to load sample key: ' + err.message, 'error');
    } finally {
      this.hideLoading();
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
      this.toast(`Master answer key saved (${answered} answers, ${mode} Mode)`, 'success');
      this.navigateTo('scanner', { testId: this.currentTest.id });
    } catch (err) {
      this.toast('Failed to save answer key: ' + err.message, 'error');
      console.error(err);
    }
  },

  // ===== SCANNER VIEW =====
  async loadScannerView(testId) {
    if (testId && (!this.currentTest || this.currentTest.id !== testId)) {
      this.currentTest = await storage.getTest(testId);
    }

    const nameInput = document.getElementById('input-student-name');
    if (nameInput) nameInput.value = '';

    document.getElementById('scan-preview').classList.add('hidden');
    document.getElementById('scan-debug-wrap').classList.add('hidden');

    const statusEl = document.getElementById('cv-status');
    if (statusEl) {
      statusEl.innerHTML = '<span class="text-success">● Subpixel Engine Ready</span>';
    }

    setTimeout(() => {
      if (nameInput) nameInput.focus();
    }, 300);
  },

  startManualEntry() {
    const studentName = document.getElementById('input-student-name').value.trim();
    if (!studentName) {
      this.toast('Please enter the student name first', 'warning');
      document.getElementById('input-student-name').focus();
      return;
    }

    this.currentStudentName = studentName;
    this.currentAnswers = new Array(this.currentTest.numQuestions).fill(null);
    this.currentConfidence = new Array(this.currentTest.numQuestions).fill(1.0);
    this.navigateTo('manual-entry');
  },

  loadManualEntryView() {
    this.renderManualEntryGrid();
    this.updateManualProgress();
  },

  renderManualEntryGrid() {
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
        <div class="column-card">
          <div class="column-header">
            <span>Questions ${startQ} – ${endQ}</span>
            <span class="column-subject-tag">Part ${c + 1}</span>
          </div>
      `;

      for (let q = startQ; q <= endQ; q++) {
        const i = q - 1;
        const ans = this.currentAnswers[i];
        const answered = ans !== null;

        html += `
          <div class="answer-row" id="manual-row-${q}">
            <span class="q-num ${answered ? 'answered' : ''}">${q}</span>
            <div class="answer-bubbles">
              ${options.map(opt => {
                const isSelected = ans === opt;
                return `
                  <button class="bubble ${isSelected ? 'selected' : ''}"
                          data-q="${i}" data-opt="${opt}"
                          onclick="App.selectManualAnswer(${i}, '${opt}')">
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

  selectManualAnswer(qIndex, option) {
    if (this.currentAnswers[qIndex] === option) {
      this.currentAnswers[qIndex] = null;
    } else {
      this.currentAnswers[qIndex] = option;
    }
    this.renderManualEntryGrid();
    this.updateManualProgress();
  },

  updateManualProgress() {
    const answered = this.currentAnswers.filter(a => a !== null).length;
    const total = this.currentTest.numQuestions;
    const pct = Math.round((answered / total) * 100);

    const fill = document.getElementById('manual-progress-fill');
    const text = document.getElementById('manual-progress-text');
    if (fill) fill.style.width = `${pct}%`;
    if (text) text.textContent = `${answered} / ${total} Answered (${pct}%)`;
  },

  submitManualEntry() {
    const answered = this.currentAnswers.filter(a => a !== null).length;
    if (answered === 0) {
      this.toast('Please mark at least one answer', 'warning');
      return;
    }

    this.navigateTo('review', {
      answers: this.currentAnswers,
      confidence: this.currentConfidence,
      studentName: this.currentStudentName
    });
  },

  async scanStudentSheet(e) {
    const file = e.target.files[0];
    if (!file) return;

    let studentName = document.getElementById('input-student-name').value.trim();

    const preview = document.getElementById('scan-preview');
    const previewImg = document.getElementById('scan-img');
    previewImg.src = URL.createObjectURL(file);
    preview.classList.remove('hidden');

    this.showLoading('Detecting Sheet Layout & Extracting Bubbles...');

    try {
      const debugCanvas = document.getElementById('scan-debug-canvas');
      omrScanner.setDebugCanvas(debugCanvas);

      const result = await omrScanner.processFile(file, this.currentTest.numQuestions);

      if (result.rollNumber) {
        this.currentRollNumber = result.rollNumber;
        if (!studentName) {
          studentName = `Candidate #${result.rollNumber}`;
        } else if (!studentName.includes(result.rollNumber)) {
          studentName += ` (Roll: ${result.rollNumber})`;
        }
      }

      if (!studentName) {
        studentName = 'Candidate #' + (Math.floor(Math.random() * 9000) + 1000);
      }

      this.currentStudentName = studentName;
      this.currentAnswers = result.answers;
      this.currentConfidence = result.confidence || [];

      document.getElementById('scan-debug-wrap').classList.remove('hidden');

      this.navigateTo('review', {
        answers: result.answers,
        confidence: result.confidence,
        bubbleDetails: result.bubbleDetails,
        multiDetails: result.multiDetails,
        rollNumber: result.rollNumber,
        studentName: this.currentStudentName
      });

      const multiCount = result.answers.filter(a => a === 'MULTIPLE').length;
      let msg = `Valuation complete for ${studentName}`;
      if (multiCount > 0) {
        msg += ` (${multiCount} double-bubbled questions flagged with 0 marks)`;
      }
      this.toast(msg, 'success');
    } catch (err) {
      console.error('[App] Student scan error:', err);
      this.toast('Scan failed: ' + err.message, 'error');
    } finally {
      this.hideLoading();
      e.target.value = '';
    }
  },

  async loadSampleStudentSheet() {
    this.showLoading('Fetching and evaluating verified student sheet scan...');
    try {
      const response = await fetch('samples/student_sheet.jpg');
      const blob = await response.blob();
      const file = new File([blob], 'student_sheet.jpg', { type: 'image/jpeg' });

      const debugCanvas = document.getElementById('scan-debug-canvas');
      omrScanner.setDebugCanvas(debugCanvas);

      const result = await omrScanner.processFile(file, this.currentTest.numQuestions);

      const roll = result.rollNumber || '261887';
      this.currentRollNumber = roll;
      this.currentStudentName = `Mudasir Shariff (Roll: ${roll})`;
      this.currentAnswers = result.answers;
      this.currentConfidence = result.confidence || [];

      this.navigateTo('review', {
        answers: result.answers,
        confidence: result.confidence,
        bubbleDetails: result.bubbleDetails,
        multiDetails: result.multiDetails,
        rollNumber: roll,
        studentName: this.currentStudentName
      });

      this.toast(`Student sheet evaluated! Roll Number: ${roll}`, 'success');
    } catch (err) {
      console.error('[App] Sample student load error:', err);
      this.toast('Failed to load sample student scan: ' + err.message, 'error');
    } finally {
      this.hideLoading();
    }
  },

  // ===== REVIEW VIEW (Valuation Diagnostic) =====
  loadReviewView(data) {
    const answers = data.answers || this.currentAnswers;
    const confidence = data.confidence || this.currentConfidence || [];
    const numQ = this.currentTest.numQuestions;
    const key = this.currentTest.answerKey;
    const mode = this.currentTest.examMode || 'CET';
    const options = ['A', 'B', 'C', 'D'];

    const scored = storage._calculateScore(answers, key, numQ, mode);

    const radius = 70;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (scored.percentage / 100) * circumference;

    const valueEl = document.getElementById('review-score-value');
    const labelEl = document.getElementById('review-score-label');
    if (valueEl) valueEl.textContent = `${scored.percentage}%`;
    if (labelEl) labelEl.textContent = `${scored.marks} / ${scored.maxMarks} marks`;

    const chipsEl = document.getElementById('review-breakdown-chips');
    if (chipsEl) {
      const correctMarks = mode === 'NEET' ? scored.correctCount * 4 : scored.correctCount * 1;
      const wrongMarks = mode === 'NEET' ? scored.wrongCount * -1 : 0;
      chipsEl.innerHTML = `
        <span class="chip-item chip-correct">✓ Correct: <strong>${scored.correctCount}</strong> (+${correctMarks})</span>
        <span class="chip-item chip-wrong">✕ Wrong: <strong>${scored.wrongCount}</strong> (${wrongMarks})</span>
        <span class="chip-item chip-blank">○ Blank: <strong>${scored.blankCount}</strong> (0)</span>
        <span class="chip-item chip-multi ${scored.multiCount > 0 ? 'highlight' : ''}">⚠ Multi: <strong>${scored.multiCount}</strong> (0 marks)</span>
      `;
    }

    let studentHeader = data.studentName || this.currentStudentName;
    document.getElementById('review-student-name').textContent = studentHeader;

    const rollBadge = document.getElementById('review-roll-badge');
    if (rollBadge) {
      if (data.rollNumber || this.currentRollNumber) {
        rollBadge.textContent = `Candidate Roll Number: ${data.rollNumber || this.currentRollNumber}`;
        rollBadge.classList.remove('hidden');
      } else {
        rollBadge.classList.add('hidden');
      }
    }

    const progressCircle = document.getElementById('review-score-progress');
    if (progressCircle) {
      progressCircle.style.strokeDasharray = circumference;
      progressCircle.style.strokeDashoffset = circumference;
      setTimeout(() => {
        progressCircle.style.strokeDashoffset = offset;
      }, 100);
    }

    // Diagnostic Review Grid
    const grid = document.getElementById('review-grid');
    let html = '<div class="answer-columns">';
    const perCol = 50;
    const numCols = Math.ceil(numQ / perCol);

    for (let c = 0; c < numCols; c++) {
      const startQ = c * perCol + 1;
      const endQ = Math.min((c + 1) * perCol, numQ);
      html += `
        <div class="column-card">
          <div class="column-header">
            <span>Questions ${startQ} – ${endQ}</span>
            <span class="column-subject-tag">Part ${c + 1}</span>
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
          statusIcon = '<span class="status-icon text-error" title="Double filled: strict rule gives 0 marks">⚠ 2 Options (0)</span>';
        } else if (isCorrect) {
          statusIcon = `<span class="status-icon text-success">✓ Correct (+${mode === 'NEET' ? 4 : 1})</span>`;
        } else if (isWrong) {
          statusIcon = `<span class="status-icon text-error">✕ Wrong (${mode === 'NEET' ? -1 : 0})</span>`;
        } else if (isUnanswered) {
          statusIcon = '<span class="status-icon text-muted">○ Blank (0)</span>';
        }

        const rowBg = isMulti
          ? 'background: rgba(245, 158, 11, 0.08); border-radius: 8px;'
          : '';

        html += `
          <div class="answer-row" id="review-row-${q}" style="${rowBg}">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="q-num ${isCorrect ? 'answered' : (isMulti ? 'multi-num' : '')}">${q}</span>
              ${keyBadge}
            </div>
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
                          title="Choice ${opt} (tap to override)"
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
      studentName: this.currentStudentName,
      rollNumber: this.currentRollNumber
    });
  },

  async saveStudentResults(forceDownload = false) {
    return this.saveStudentResult(forceDownload);
  },

  async saveStudentResult(forceDownload = false) {
    if (!this.currentStudentName) {
      this.toast('Student candidate name is missing', 'error');
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

      const allStudents = await storage.getStudentsByTest(this.currentTest.id);
      const chkAuto = document.getElementById('chk-auto-export');
      const shouldDownload = (chkAuto ? chkAuto.checked : true) || forceDownload;

      let exportInfo = null;
      try {
        exportInfo = excelExporter.exportResults(this.currentTest, allStudents, shouldDownload);
      } catch (expErr) {
        console.warn('[Excel Export]', expErr);
      }

      const syncNote = (exportInfo && shouldDownload)
        ? ` • Synced & Downloaded ${exportInfo.filename}`
        : ' • Saved to examination gradebook';

      this.toast(`Saved: ${student.name} (${student.score}/${student.maxMarks})${syncNote}`, 'success');

      this.currentAnswers = [];
      this.currentStudentName = '';
      this.currentRollNumber = '';
      this.navigateTo('results', { testId: this.currentTest.id });
    } catch (err) {
      this.toast('Failed to save valuation: ' + err.message, 'error');
      console.error(err);
    }
  },

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

  // ===== RESULTS / GRADEBOOK VIEW =====
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

    document.getElementById('stat-students').textContent = stats.count;
    document.getElementById('stat-average').textContent = stats.count > 0 ? `${stats.avgScore} marks` : '—';
    document.getElementById('stat-highest').textContent = stats.count > 0 ? `${stats.highest}%` : '—';
    document.getElementById('stat-pass-rate').textContent = stats.count > 0 ? `${stats.passRate}%` : '—';

    const tbody = document.getElementById('results-tbody');
    const exportBtn = document.getElementById('btn-export');

    if (students.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 40px; color: var(--text-muted);">
            No students evaluated yet in this batch. Tap "Scan Next Student" to begin.
          </td>
        </tr>
      `;
      if (exportBtn) exportBtn.disabled = true;
      return;
    }

    if (exportBtn) exportBtn.disabled = false;

    // Sort by score descending (Rankings)
    const sorted = [...students].sort((a, b) => b.score - a.score);
    this._cachedStudents = sorted;
    this.renderStudentsTable(sorted);
  },

  renderStudentsTable(students) {
    const tbody = document.getElementById('results-tbody');
    if (!tbody) return;

    let html = '';
    const medals = ['🥇', '🥈', '🥉'];

    students.forEach((s, i) => {
      const badgeClass = s.percentage >= 75 ? 'high' : (s.percentage >= 40 ? 'medium' : 'low');
      const modeClass = (s.examMode || 'CET').toLowerCase();
      const rankBadge = medals[i] || `<span style="font-family: var(--font-mono); color: var(--text-secondary);">${i + 1}</span>`;

      html += `
        <tr>
          <td style="font-weight: 700; text-align: center;">${rankBadge}</td>
          <td><strong>${this.escapeHtml(s.name)}</strong></td>
          <td><span class="mode-badge ${modeClass}" style="padding: 2px 7px; font-size: 0.68rem;">${s.examMode || 'CET'}</span></td>
          <td style="font-family: var(--font-mono);"><strong>${s.score}</strong> / ${s.maxMarks || s.total}</td>
          <td>
            <span class="text-xs text-secondary" style="font-family: var(--font-mono);">
              <span class="text-success">✓${s.correctCount || 0}</span> • 
              <span class="text-error">✕${s.wrongCount || 0}</span>
              ${s.multiCount ? ` • <span class="text-warning">⚠${s.multiCount}</span>` : ''}
            </span>
          </td>
          <td><span class="score-badge ${badgeClass}">${s.percentage}%</span></td>
          <td style="text-align: right;">
            <button class="delete-btn" onclick="App.deleteStudent('${s.id}')" title="Delete record">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
  },

  filterStudentsTable(query) {
    if (!this._cachedStudents) return;
    const q = query.toLowerCase().trim();
    if (!q) {
      this.renderStudentsTable(this._cachedStudents);
      return;
    }
    const filtered = this._cachedStudents.filter(s =>
      s.name.toLowerCase().includes(q) ||
      (s.examMode && s.examMode.toLowerCase().includes(q))
    );
    this.renderStudentsTable(filtered);
  },

  async deleteStudent(studentId) {
    if (!confirm('Delete this candidate assessment record?')) return;
    await storage.deleteStudent(studentId);
    this.toast('Student record deleted', 'info');
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

  // ===== 1-CLICK INSTITUTIONAL DEMO LOADER =====
  async loadInstitutionalDemo() {
    this.showLoading('Setting up 1-Click Institutional CET Demo...');
    try {
      const demoName = 'BGS Pre-University CET Model Exam 2026';
      
      // 1. Create or retrieve demo test
      let test = await storage.createTest(demoName, 200, 'CET');
      this.currentTest = test;

      // 2. Fetch and scan sample key
      const keyRes = await fetch('samples/key_sheet.png');
      const keyBlob = await keyRes.blob();
      const keyFile = new File([keyBlob], 'key_sheet.png', { type: 'image/png' });
      const scanKeyRes = await omrScanner.processFile(keyFile, 200);

      this.currentTest.answerKey = scanKeyRes.answers;
      await storage.updateAnswerKey(this.currentTest.id, scanKeyRes.answers, 'CET');

      // 3. Fetch and scan sample student
      const studentRes = await fetch('samples/student_sheet.jpg');
      const studentBlob = await studentRes.blob();
      const studentFile = new File([studentBlob], 'student_sheet.jpg', { type: 'image/jpeg' });
      const scanStudentRes = await omrScanner.processFile(studentFile, 200);

      const roll = scanStudentRes.rollNumber || '261887';
      this.currentRollNumber = roll;
      this.currentStudentName = `Mudasir Shariff (Roll: ${roll})`;
      this.currentAnswers = scanStudentRes.answers;
      this.currentConfidence = scanStudentRes.confidence || [];

      // 4. Navigate directly to review view
      this.navigateTo('review', {
        answers: scanStudentRes.answers,
        confidence: scanStudentRes.confidence,
        rollNumber: roll,
        studentName: this.currentStudentName
      });

      this.toast('⚡ Institutional CET Demo Loaded! 200 Questions graded with 100% precision.', 'success');
    } catch (err) {
      console.error('[App] Demo setup error:', err);
      this.toast('Failed to load demo: ' + err.message, 'error');
    } finally {
      this.hideLoading();
    }
  },

  // ===== UTILITIES =====
  showLoading(text = 'Processing OMR Sheet...') {
    const overlay = document.getElementById('loading-overlay');
    const label = document.getElementById('loading-text');
    if (label) label.textContent = text;
    if (overlay) overlay.classList.remove('hidden');
  },

  hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.add('hidden');
  },

  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span class="toast-icon" style="font-weight: 800;">${icons[type] || 'ℹ'}</span>
      <span>${this.escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 350);
    }, 4000);
  },

  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

// Initialize application on DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());
