# OMR Valuation System & Scanner — Agent Memory & Project Guide

## 1. Project Overview
- **Repository**: `Mudasir-shariff/OMR` (branch: `main`, remote: `git@github.com:Mudasir-shariff/OMR.git`)
- **Institution**: BGS Group of Institutions
- **Purpose**: High-speed, high-precision Optical Mark Recognition (OMR) scanner and examination valuation suite for CET and NEET tests (up to 200 questions).
- **Core Technology Stack**:
  - Pure HTML5 / Canvas API / Vanilla JavaScript (ES6+)
  - **Zero external CV dependencies** (No OpenCV, Python, or WASM required at runtime; all computer vision and image processing is implemented in pure JavaScript).
  - **IndexedDB** for fast client-side offline storage (`omr_scanner_db`).
  - Progressive Web App (PWA) enabled (`manifest.json`, `sw.js`).
  - Vanilla CSS design system with Dark/Light theme switching and mobile responsiveness.

---

## 2. File Structure & Responsibilities
- `index.html`: Main single-page application shell containing:
  - Header with institution branding, test selector, and theme toggler.
  - Navigation tabs: **Scanner** (`#tab-scan`), **Answer Key** (`#tab-key`), **Results & Analytics** (`#tab-results`), **Settings** (`#tab-settings`).
  - Camera viewport, batch upload area, manual edit modals, and 1-Click Live Demo trigger.
- `scanner.js`: Core CV & OMR detection engine (`OMRScanner` class):
  - Canvas-based image grayscale conversion & contrast normalization.
  - Desk/background paper boundary detection (`_findPaperBounds`).
  - Automatic dual-layout classification (`5col` grid vs `6col` timing track).
  - Circle interior disc sampling (avoids outer printed ring circumference).
  - Row-adaptive dynamic lighting normalization (immune to uneven shadows and camera gradients).
  - Strict multi-bubble detection (flags multiple filled options as invalid).
  - Visual debug canvas overlay (Green = correct/valid, Crimson = wrong, Amber/Red = multiple filled).
- `storage.js`: IndexedDB abstraction layer (`AppStorage` class):
  - Stores: `tests` (metadata, answer keys, examMode) and `students` (answers, marks, percentage, roll number, scan date).
  - Scoring engines for **CET** and **NEET** modes.
- `app.js`: Application controller (`App` singleton):
  - State management (active test, camera stream, current tab, batch queue).
  - Event listeners, camera capture loop, batch file processing, manual bubble override modal.
  - Live Demo mode generating realistic student sample data for instant testing.
- `export.js`: Reporting & Export engine:
  - Generates student printable scorecards, merit lists, CSV spreadsheets, and Excel-compatible tables.
- `style.css`: Modern executive UI stylesheet with CSS custom properties (`--bg-primary`, `--accent`, etc.), dark/light themes, card layouts, and responsive breakpoints.
- `sw.js` & `manifest.json`: Offline service worker and PWA manifest.
- Diagnostic scripts (`inspect_*.js`, `test_scanner_node.js`): Node.js diagnostic utilities to verify scanner accuracy against raw binary frame dumps (`scratch_*.bin`).

---

## 3. Supported OMR Sheet Layouts

### Layout A: 5-Column Grid Layout (`layout: '5col'`)
- **Structure**: 5 columns x 40 rows = 200 questions.
- **Identifier**: Solid horizontal table border line across the top of the grid (`maxDarkLine > pw * 0.40`).
- **Geometry**:
  - Detects top and bottom horizontal border lines.
  - Detects 6 vertical column dividers via vertical intensity projection.
  - Each column contains 40 rows with question number, bubbles (A, B, C, D), and gutters.

### Layout B: 6-Column Track Layout (`layout: '6col'`)
- **Structure**: 6 columns of varying question counts:
  - Col 1: 26 questions (Q1 - Q26)
  - Col 2: 26 questions (Q27 - Q52)
  - Col 3: 37 questions (Q53 - Q89)
  - Col 4: 37 questions (Q90 - Q126)
  - Col 5: 37 questions (Q127 - Q163)
  - Col 6: 37 questions (Q164 - Q200)
- **Identifier**: Vertical timing tracks of alternating black fiducial squares along column edges; lacks solid top border.
- **Roll Number Grid**: 6-digit roll number bubble grid (digits 0–9) positioned in the upper-left quadrant above columns 1 & 2.
- **Calibration Details**:
  - Timing Track 0 (left edge): Tightened search window (`0.005` to `0.05` width) to prevent bubble column false positives.
  - Timing Track 1 (center gutter): Mid-sheet timing reference.
  - Double-gutter calibration aligns bubble rows even with camera tilt or non-linear page warping.

---

## 4. Scoring Engine Rules

### CET Mode
- **Marks per Correct Answer**: `+1`
- **Marks per Incorrect Answer**: `0`
- **Unanswered / Blank**: `0`
- **Multi-fill**: Counted as invalid (`0` marks).
- **Total Marks**: 200 (or `numQuestions`).

### NEET Mode
- **Marks per Correct Answer**: `+4`
- **Marks per Incorrect Answer**: `-1` (Negative marking)
- **Unanswered / Blank**: `0`
- **Multi-fill**: Counted as incorrect (`-1` mark penalty).
- **Total Marks**: `numQuestions * 4` (e.g. 720 or 800 max).

---

## 5. Bubble Detection & Sensitivity Guidelines
- **Interior Disc Sampling**: Never sample pixels at radius `r` (printed line). Sample only within radius `0.2 * r` to `0.7 * r` from bubble center.
- **Fill Ratio Threshold**: Typically `0.38` - `0.45` relative to the row's local background paper luminance.
- **Multi-Fill Protection**: If two or more bubbles in the same question have fill ratios within `0.08` of each other or both exceed `0.42`, flag the question as `MULTI_FILL`.

---

## 6. Development & Workflow Conventions
- **Running Locally**:
  ```powershell
  # Using any static HTTP server (e.g. Python, http-server, or live-server)
  python -m http.server 8080
  # Or: npx -y http-server -p 8080 -c-1
  ```
- **Git Commit & Push**:
  - Primary branch: `main`
  - Push remote: `origin git@github.com:Mudasir-shariff/OMR.git`
  - Always verify git status before committing.
- **Zero-Dependency Mandate**: Do not import external image processing libraries (OpenCV, TensorFlow, etc.) into client bundles. Keep the engine lightweight, instant-loading, and completely local.
- **Regression Testing**: Use the Node-based test runners:
  ```powershell
  node test_scanner_node.js
  ```
