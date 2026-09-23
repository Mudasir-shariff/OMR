# OMR Dot Scanner — Universal Optical Mark Recognition System
### BGS Group of Institutions — Chickballapur Division
*Sri Adichunchanagiri Shikshana Trust®*

A web-based, pure-canvas Optical Mark Recognition (OMR) valuation system designed for **Karnataka CET** and **NEET** Pre-University examination assessment.

---

## Key Features

- **Advanced Computer Vision (Pure Canvas API)**:
  - Dynamic table grid border detection (`tableTop`, `tableBottom`, and vertical column dividers).
  - Adaptive circle-interior sampling (3×3 patch sampled strictly at circle centers without touching printed outer borders).
  - Dual layout support:
    - **5-Column Grid Sheet** (40 questions/col × 5 columns = 200 Questions).
    - **6-Column Track Sheet** (26 + 26 + 37 + 37 + 37 + 37 = 200 Questions + 6-digit Roll Number).
- **Strict Scoring Rule**:
  - Automatically flags double-bubbled / multiple filled questions (`MULTIPLE`).
  - Strictly awards **0 marks** for any multi-bubbled question.
- **Exam Modes & Marking Schemes**:
  - **CET Mode**: Correct = `+1`, Wrong = `0`, Blank = `0`, Multi-fill = `0` (Max Marks: 200).
  - **NEET Mode**: Correct = `+4`, Wrong = `-1`, Blank = `0`, Multi-fill = `0` (Max Marks: 800).
- **Real-Time Answer Key Comparison**:
  - Live color-coded overlay: Emerald Green (`?`) for correct, Crimson Red (`?`) for incorrect, Dotted Indigo for missed key option, and Red Warning for double-bubbled options.
- **Institutional Excel (`.xlsx`) Auto-Sync**:
  - Generates institutional workbooks on save with:
    - **Sheet 1 (`Institutional Summary`)**: Exam metadata, class analytics (Average, Highest, Lowest, Pass Rate = 40%), and Student Award Roll.
    - **Sheet 2 (`Question Diagnostic Matrix`)**: Complete `Q1` to `Q200` matrix comparing each student choice against the official answer key (`A ?`, `C ? [Key: A]`, `?? MULTI (0)`, `—`).
    - **Sheet 3 (`Master Answer Key`)**: Subject section mapping and official key.
- **Zero External Runtime Dependencies**:
  - Pure Vanilla JavaScript, HTML5 Canvas, and Vanilla CSS with SheetJS (`xlsx`) for spreadsheet generation.

---

## File Structure

```text
+-- index.html       # Single-page application structure & UI views
+-- style.css        # Clean responsive theme & 1280px container layout
+-- app.js           # SPA router, view logic, and event orchestration
+-- scanner.js       # Universal computer vision OMR detection engine
+-- storage.js       # IndexedDB persistence & scoring calculation layer
+-- export.js        # Institutional SheetJS Excel (.xlsx) generator
+-- manifest.json    # Progressive Web App (PWA) manifest
+-- sw.js            # Service worker for offline capability
+-- README.md        # Project documentation
```

---

## Getting Started

1. Clone the repository:
   ```bash
   git clone git@github.com:Mudasir-shariff/OMR.git
   ```
2. Run a local web server (e.g. using `http-server` or VS Code Live Server):
   ```bash
   npx http-server -p 8080 -c-1
   ```
3. Open `http://localhost:8080` in your web browser.
