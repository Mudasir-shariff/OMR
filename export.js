/* =============================================
   OMR Dot Scanner — Institutional Excel Export Module
   BGS Group of Institutions — Chickballapur Division
   Uses SheetJS (xlsx) for .xlsx generation
   ============================================= */

class ExcelExporter {
  /**
   * Check if SheetJS is loaded
   */
  isReady() {
    return typeof XLSX !== 'undefined';
  }

  /**
   * Export test results to an Excel file (.xlsx)
   * @param {Object} test - Test object from storage
   * @param {Array} students - Array of student objects
   * @param {boolean} [autoDownload=true] - Trigger immediate browser download
   * @returns {Object} { filename, wb, rowCount }
   */
  exportResults(test, students, autoDownload = true) {
    if (!this.isReady()) {
      throw new Error('SheetJS (xlsx) library not loaded');
    }

    const wb = XLSX.utils.book_new();

    // ===== Sheet 1: Institutional Award Roll & Summary =====
    const summaryData = this._buildSummarySheet(test, students);
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
    this._styleSummarySheet(summaryWs, summaryData);
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Institutional Summary');

    // ===== Sheet 2: Detailed Question Diagnostic Matrix =====
    const detailData = this._buildDetailSheet(test, students);
    const detailWs = XLSX.utils.aoa_to_sheet(detailData);
    this._styleDetailSheet(detailWs, detailData, test);
    XLSX.utils.book_append_sheet(wb, detailWs, 'Question Diagnostic Matrix');

    // ===== Sheet 3: Official Master Answer Key =====
    const keyData = this._buildAnswerKeySheet(test);
    const keyWs = XLSX.utils.aoa_to_sheet(keyData);
    this._styleAnswerKeySheet(keyWs, keyData);
    XLSX.utils.book_append_sheet(wb, keyWs, 'Master Answer Key');

    // Generate filename conforming to college administrative records
    const safeName = (test.name || 'Exam').replace(/[^a-zA-Z0-9]/g, '_');
    const mode = test.examMode || 'CET';
    const dateStr = new Date(test.date || Date.now()).toISOString().split('T')[0];
    const filename = `BGS_${safeName}_${mode}_Results_${dateStr}.xlsx`;

    if (autoDownload) {
      XLSX.writeFile(wb, filename);
    }

    return {
      filename,
      wb,
      rowCount: students.length
    };
  }

  /**
   * Build Institutional Summary & Award Roll data
   */
  _buildSummarySheet(test, students) {
    const rows = [];
    const mode = test.examMode || 'CET';

    // Institutional Header
    rows.push(['SRI ADICHUNCHANAGIRI SHIKSHANA TRUST®']);
    rows.push(['BGS GROUP OF INSTITUTIONS — CHICKBALLAPUR DIVISION']);
    rows.push(['PRE-UNIVERSITY & ENTRANCE EXAMINATION ASSESSMENT CELL (CET / NEET)']);
    rows.push(['Official OMR Evaluation & Tabulation Sheet']);
    rows.push([]);

    // Examination Metadata Block
    rows.push(['Examination Details', '']);
    rows.push(['Institution:', 'BGS Group of Institutions, Chickballapur Division']);
    rows.push(['Examination Name:', test.name]);
    rows.push(['Date of Exam:', new Date(test.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })]);
    rows.push(['Evaluation Stream / Mode:', mode === 'NEET' ? 'NEET / Medical Entrance (Negative Marking)' : 'Karnataka CET / Engineering Standard']);
    rows.push(['Marking Scheme:', mode === 'NEET' ? '+4 Correct • -1 Wrong • 0 Blank • 0 Double-Bubbled (Strict Rule)' : '+1 Correct • 0 Wrong • 0 Blank • 0 Double-Bubbled (Strict Rule)']);
    rows.push(['Total Questions:', test.numQuestions || 200]);
    rows.push(['Max Marks Possible:', mode === 'NEET' ? (test.numQuestions * 4) : (test.numQuestions * 1)]);
    rows.push(['Total Students Evaluated:', students.length]);
    rows.push([]);

    if (students.length > 0) {
      // Statistical Analysis
      const scores = students.map(s => s.score);
      const percentages = students.map(s => s.percentage);
      const avgScore = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10;
      const avgPct = Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length);
      const highest = Math.max(...scores);
      const lowest = Math.min(...scores);
      const maxMarks = students[0].maxMarks || (mode === 'NEET' ? test.numQuestions * 4 : test.numQuestions);
      const passed = students.filter(s => s.percentage >= 40).length;
      const totalMultiBubbled = students.reduce((sum, s) => sum + (s.multiCount || 0), 0);

      rows.push(['Class Performance Statistics', '']);
      rows.push(['Class Average Marks:', `${avgScore} / ${maxMarks} (${avgPct}%)`]);
      rows.push(['Highest Score Achieved:', `${highest} / ${maxMarks} (${Math.round((highest / maxMarks) * 100)}%)`]);
      rows.push(['Lowest Score:', `${lowest} / ${maxMarks} (${Math.round((lowest / maxMarks) * 100)}%)`]);
      rows.push(['Benchmark Pass Rate (≥ 40%):', `${passed} of ${students.length} (${Math.round((passed / students.length) * 100)}%)`]);
      rows.push(['Total Double-Bubbled Violations (0 Marks):', totalMultiBubbled]);
      rows.push([]);

      // Student Award Roll Header
      rows.push([
        'Rank',
        'Student ID / Roll No',
        'Student Name',
        'Stream',
        'Marks Obtained',
        'Max Marks',
        'Correct (+)',
        'Wrong (-)',
        'Blank (0)',
        '2+ Filled (0)',
        'Percentage',
        'Grade',
        'Result Status'
      ]);

      // Sort by score descending for formal merit ranking
      const ranked = [...students].sort((a, b) => b.score - a.score);
      ranked.forEach((s, i) => {
        // Extract roll number if present in name or ID
        const rollMatch = s.name.match(/\b(Roll[:\s]*|ID[:\s]*)([A-Za-z0-9]+)\b/i);
        const rollNo = rollMatch ? rollMatch[2] : `BGS-${String(i + 1).padStart(3, '0')}`;
        const cleanName = s.name.replace(/\(Roll:[^\)]+\)/i, '').trim();

        rows.push([
          i + 1,
          rollNo,
          cleanName,
          s.examMode || mode,
          s.score,
          s.maxMarks || maxMarks,
          s.correctCount || 0,
          s.wrongCount || 0,
          s.blankCount || 0,
          s.multiCount || 0,
          `${s.percentage}%`,
          this._getGrade(s.percentage),
          s.percentage >= 40 ? 'ELIGIBLE' : 'NEEDS ATTENTION'
        ]);
      });
    } else {
      rows.push(['No student sheets scanned yet for this test.']);
    }

    return rows;
  }

  /**
   * Build Detailed Results sheet (with individual question answers compared to key)
   */
  _buildDetailSheet(test, students) {
    const rows = [];
    const numQ = test.numQuestions || 200;

    // Header block
    rows.push(['BGS GROUP OF INSTITUTIONS — CHICKBALLAPUR DIVISION']);
    rows.push(['QUESTION-BY-QUESTION DIAGNOSTIC EVALUATION MATRIX']);
    rows.push(['Test:', test.name, 'Mode:', test.examMode || 'CET', 'Date:', new Date(test.date).toLocaleDateString()]);
    rows.push([]);

    // Question header row
    const header = ['Student Name', 'Marks', 'Percentage'];
    for (let i = 1; i <= numQ; i++) {
      header.push(`Q${i}`);
    }
    rows.push(header);

    // Official Answer Key row
    const keyRow = ['OFFICIAL ANSWER KEY', '', ''];
    for (let i = 0; i < numQ; i++) {
      keyRow.push(test.answerKey[i] || '—');
    }
    rows.push(keyRow);

    // Student rows
    const sorted = [...students].sort((a, b) => a.name.localeCompare(b.name));
    sorted.forEach(student => {
      const row = [student.name, student.score, `${student.percentage}%`];
      for (let i = 0; i < numQ; i++) {
        const studentAns = student.answers[i];
        const correctAns = test.answerKey[i];

        if (studentAns === 'MULTIPLE' || (Array.isArray(studentAns) && studentAns.length > 1)) {
          row.push('⚠️ MULTI (0)');
        } else if (!studentAns) {
          row.push('—');
        } else if (correctAns) {
          if (studentAns === correctAns) {
            row.push(`${studentAns} ✓`);
          } else {
            row.push(`${studentAns} ✗ [${correctAns}]`);
          }
        } else {
          row.push(studentAns);
        }
      }
      rows.push(row);
    });

    return rows;
  }

  /**
   * Build Answer Key sheet
   */
  _buildAnswerKeySheet(test) {
    const rows = [];
    const numQ = test.numQuestions || 200;
    const mode = test.examMode || 'CET';

    rows.push(['BGS GROUP OF INSTITUTIONS — CHICKBALLAPUR DIVISION']);
    rows.push(['OFFICIAL MASTER ANSWER KEY']);
    rows.push(['Exam:', test.name, 'Mode:', mode]);
    rows.push([]);

    rows.push(['Question No', 'Subject Section', 'Official Key Option', 'Marks Allotted']);

    for (let i = 0; i < numQ; i++) {
      const qNum = i + 1;
      let section = 'Section 1';
      if (qNum <= 40) section = 'Section 1 (Physics)';
      else if (qNum <= 80) section = 'Section 2 (Chemistry)';
      else if (qNum <= 120) section = 'Section 3 (Mathematics / Biology)';
      else if (qNum <= 160) section = 'Section 4 (Advanced Part I)';
      else section = 'Section 5 (Advanced Part II)';

      const key = test.answerKey[i] || '—';
      const markScheme = mode === 'NEET' ? '+4 (Wrong: -1)' : '+1 (Wrong: 0)';
      rows.push([qNum, section, key, markScheme]);
    }

    return rows;
  }

  /**
   * Style the summary worksheet
   */
  _styleSummarySheet(ws, data) {
    ws['!cols'] = [
      { wch: 8 },  // Rank
      { wch: 22 }, // Roll No
      { wch: 28 }, // Name
      { wch: 10 }, // Stream
      { wch: 15 }, // Marks
      { wch: 12 }, // Max
      { wch: 12 }, // Correct
      { wch: 12 }, // Wrong
      { wch: 12 }, // Blank
      { wch: 14 }, // Multi
      { wch: 12 }, // %
      { wch: 10 }, // Grade
      { wch: 18 }  // Status
    ];

    ws['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } },
      { s: { r: 3, c: 0 }, e: { r: 3, c: 6 } }
    ];
  }

  /**
   * Style the detailed results worksheet
   */
  _styleDetailSheet(ws, data, test) {
    const cols = [
      { wch: 28 }, // Student name
      { wch: 10 }, // Score
      { wch: 12 }, // Percentage
    ];
    const numQ = test.numQuestions || 200;
    for (let i = 0; i < numQ; i++) {
      cols.push({ wch: 12 });
    }
    ws['!cols'] = cols;
    ws['!freeze'] = { xSplit: 3, ySplit: 5 };
  }

  /**
   * Style Master Answer Key worksheet
   */
  _styleAnswerKeySheet(ws, data) {
    ws['!cols'] = [
      { wch: 14 }, // Question No
      { wch: 32 }, // Subject Section
      { wch: 20 }, // Key Option
      { wch: 20 }  // Marks Allotted
    ];
  }

  /**
   * Letter grade from percentage conforming to Karnataka Pre-University evaluation
   */
  _getGrade(pct) {
    if (pct >= 85) return 'Distinction (A+)';
    if (pct >= 75) return 'First Class (A)';
    if (pct >= 60) return 'Second Class (B+)';
    if (pct >= 50) return 'Pass Class (B)';
    if (pct >= 40) return 'Third Class (C)';
    return 'Fail (F)';
  }
}

// Singleton
const excelExporter = new ExcelExporter();
