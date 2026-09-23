/* =============================================
   OMR Dot Scanner — IndexedDB Storage Layer
   Stores tests, answer keys, and student results
   ============================================= */

const DB_NAME = 'omr_scanner_db';
const DB_VERSION = 1;

class AppStorage {
  constructor() {
    this.db = null;
  }

  /**
   * Initialize the database. Must be called before any operations.
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        // Tests store: { id, name, date, numQuestions, answerKey[] }
        if (!db.objectStoreNames.contains('tests')) {
          db.createObjectStore('tests', { keyPath: 'id' });
        }

        // Students store: { id, testId, name, answers[], score, total, percentage, date }
        if (!db.objectStoreNames.contains('students')) {
          const store = db.createObjectStore('students', { keyPath: 'id' });
          store.createIndex('testId', 'testId', { unique: false });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve();
      };

      request.onerror = (e) => {
        reject(new Error('Failed to open database: ' + e.target.error));
      };
    });
  }

  /**
   * Generic transaction helper
   */
  _transaction(storeName, mode = 'readonly') {
    const tx = this.db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  }

  /**
   * Wrap an IDBRequest in a promise
   */
  _promisify(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ===== TESTS =====

  /**
   * Create a new test
   * @param {string} name - Test name
   * @param {number} numQuestions - Number of questions (default 200)
   * @returns {Object} The created test object
   */
  async createTest(name, numQuestions = 200, examMode = 'CET') {
    const test = {
      id: 'test_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      name: name.trim(),
      date: new Date().toISOString(),
      numQuestions,
      examMode: examMode === 'NEET' ? 'NEET' : 'CET',
      answerKey: new Array(numQuestions).fill(null),
      isKeySet: false
    };

    const store = this._transaction('tests', 'readwrite');
    await this._promisify(store.put(test));
    return test;
  }

  /**
   * Get a test by ID
   */
  async getTest(testId) {
    const store = this._transaction('tests');
    return this._promisify(store.get(testId));
  }

  /**
   * Get all tests, sorted by date descending
   */
  async getAllTests() {
    const store = this._transaction('tests');
    const tests = await this._promisify(store.getAll());
    return tests.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  /**
   * Update the answer key and exam mode for a test
   * @param {string} testId
   * @param {Array} answerKey - Array of answers (e.g., ['A','C','B',...])
   * @param {string} [examMode] - 'CET' or 'NEET'
   */
  async updateAnswerKey(testId, answerKey, examMode = null) {
    const test = await this.getTest(testId);
    if (!test) throw new Error('Test not found');

    test.answerKey = answerKey;
    test.isKeySet = answerKey.some(a => a !== null);
    if (examMode) {
      test.examMode = examMode === 'NEET' ? 'NEET' : 'CET';
    }

    const store = this._transaction('tests', 'readwrite');
    await this._promisify(store.put(test));
    return test;
  }

  /**
   * Update exam mode for a test
   */
  async updateTestExamMode(testId, examMode) {
    const test = await this.getTest(testId);
    if (!test) throw new Error('Test not found');

    test.examMode = examMode === 'NEET' ? 'NEET' : 'CET';
    const store = this._transaction('tests', 'readwrite');
    await this._promisify(store.put(test));
    return test;
  }

  /**
   * Delete a test and all its students
   */
  async deleteTest(testId) {
    // Delete students first
    const students = await this.getStudentsByTest(testId);
    const studentStore = this._transaction('students', 'readwrite');
    for (const student of students) {
      studentStore.delete(student.id);
    }

    // Delete test
    const testStore = this._transaction('tests', 'readwrite');
    await this._promisify(testStore.delete(testId));
  }

  // ===== STUDENTS =====

  /**
   * Calculate marks according to strict exam mode rules:
   * - CET: Correct +1, Wrong 0, Blank 0, Multiple 0
   * - NEET: Correct +4, Wrong -1, Blank 0, Multiple 0
   */
  _calculateScore(answers, answerKey, numQuestions, examMode = 'CET') {
    let correctCount = 0;
    let wrongCount = 0;
    let blankCount = 0;
    let multiCount = 0;

    const totalQ = numQuestions || answerKey.length || 200;

    for (let i = 0; i < totalQ; i++) {
      const studentAns = answers[i];
      const keyAns = answerKey[i];

      // Strict rule: if question is filled with 2 or more options, 0 marks
      if (studentAns === 'MULTIPLE' || (Array.isArray(studentAns) && studentAns.length > 1)) {
        multiCount++;
      } else if (!studentAns) {
        blankCount++;
      } else if (keyAns !== null && studentAns === keyAns) {
        correctCount++;
      } else if (keyAns !== null && studentAns !== keyAns) {
        wrongCount++;
      } else {
        blankCount++;
      }
    }

    let marks = 0;
    let maxMarks = 0;

    if (examMode === 'NEET') {
      marks = (correctCount * 4) + (wrongCount * -1) + (blankCount * 0) + (multiCount * 0);
      maxMarks = totalQ * 4;
    } else {
      // Default: CET
      marks = (correctCount * 1) + (wrongCount * 0) + (blankCount * 0) + (multiCount * 0);
      maxMarks = totalQ * 1;
    }

    const percentage = maxMarks > 0 ? Math.max(0, Math.round((marks / maxMarks) * 100)) : 0;

    return {
      marks,
      maxMarks,
      percentage,
      correctCount,
      wrongCount,
      blankCount,
      multiCount,
      examMode: examMode === 'NEET' ? 'NEET' : 'CET'
    };
  }

  /**
   * Save a student's scanned results
   * @param {string} testId
   * @param {string} name - Student name
   * @param {Array} answers - Detected answers
   * @param {Array} answerKey - Answer key for comparison
   * @param {string} [overrideExamMode] - Optional exam mode override
   * @returns {Object} The student record with calculated score
   */
  async saveStudent(testId, name, answers, answerKey, overrideExamMode = null) {
    const test = await this.getTest(testId);
    const numQ = test ? test.numQuestions : answerKey.length;
    const mode = overrideExamMode || (test ? test.examMode : 'CET') || 'CET';

    const scored = this._calculateScore(answers, answerKey, numQ, mode);

    const student = {
      id: 'student_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
      testId,
      name: name.trim(),
      answers,
      score: scored.marks,
      total: scored.maxMarks,
      maxMarks: scored.maxMarks,
      percentage: scored.percentage,
      correctCount: scored.correctCount,
      wrongCount: scored.wrongCount,
      blankCount: scored.blankCount,
      multiCount: scored.multiCount,
      examMode: scored.examMode,
      date: new Date().toISOString()
    };

    const store = this._transaction('students', 'readwrite');
    await this._promisify(store.put(student));
    return student;
  }

  /**
   * Get all students for a test, sorted by name
   */
  async getStudentsByTest(testId) {
    const store = this._transaction('students');
    const index = store.index('testId');
    const students = await this._promisify(index.getAll(testId));
    return students.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Get a single student by ID
   */
  async getStudent(studentId) {
    const store = this._transaction('students');
    return this._promisify(store.get(studentId));
  }

  /**
   * Delete a student record
   */
  async deleteStudent(studentId) {
    const store = this._transaction('students', 'readwrite');
    await this._promisify(store.delete(studentId));
  }

  /**
   * Update a student's answers and recalculate score
   */
  async updateStudentAnswers(studentId, answers, answerKey) {
    const student = await this.getStudent(studentId);
    if (!student) throw new Error('Student not found');

    const test = await this.getTest(student.testId);
    const numQ = test ? test.numQuestions : answerKey.length;
    const mode = student.examMode || (test ? test.examMode : 'CET') || 'CET';

    const scored = this._calculateScore(answers, answerKey, numQ, mode);

    student.answers = answers;
    student.score = scored.marks;
    student.total = scored.maxMarks;
    student.maxMarks = scored.maxMarks;
    student.percentage = scored.percentage;
    student.correctCount = scored.correctCount;
    student.wrongCount = scored.wrongCount;
    student.blankCount = scored.blankCount;
    student.multiCount = scored.multiCount;

    const store = this._transaction('students', 'readwrite');
    await this._promisify(store.put(student));
    return student;
  }

  /**
   * Get statistics for a test
   */
  async getTestStats(testId) {
    const students = await this.getStudentsByTest(testId);
    if (students.length === 0) {
      return { count: 0, avgScore: 0, avgPercentage: 0, highest: 0, lowest: 0, passRate: 0 };
    }

    const scores = students.map(s => s.score);
    const percentages = students.map(s => s.percentage);

    return {
      count: students.length,
      avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
      avgPercentage: Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length),
      highest: Math.max(...percentages),
      lowest: Math.min(...percentages),
      passRate: Math.round((students.filter(s => s.percentage >= 40).length / students.length) * 100)
    };
  }
}

// Singleton instance
const storage = new AppStorage();
