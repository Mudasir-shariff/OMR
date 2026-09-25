# OMR System Rules & Guidelines

- **Zero External Heavy Dependencies**: Keep `scanner.js` running purely on native HTML5 Canvas 2D API. Do not inject OpenCV.js, Tesseract.js, or heavy external CDNs for core scanning.
- **Dual Layout Awareness**: Always preserve both the 5-Column Grid Layout (40x5 = 200 questions) and the 6-Column Track Layout (26, 26, 37, 37, 37, 37 = 200 questions + 6-digit roll number).
- **Bubble Interior Sampling Rule**: When calculating bubble darkness, only sample the inner 70% of the circle radius. Never include outer border ring pixels.
- **Scoring Rules**:
  - CET mode: Correct +1, Wrong 0, Blank 0, Multiple 0.
  - NEET mode: Correct +4, Wrong -1, Blank 0, Multiple -1.
- **Theme Support**: Whenever styling new UI components or modals in `index.html` or `style.css`, always utilize CSS variables (`var(--bg-primary)`, `var(--text-primary)`, `var(--border-subtle)`, etc.) to support both Dark and Light modes seamlessly.
