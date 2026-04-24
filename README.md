# Tool Silhouette Tracer

Static web app. Upload top-down photo of tools on backlit 17" × 12" 1-inch grid → click 4 grid corners → get a JPG of scaled outlines.

## Usage

1. Open `index.html` (or the hosted GitHub Pages URL).
2. Upload photo.
3. Set grid size (default 17 × 12 in) and output px/inch (default 50 → 850×600 px).
4. Click grid corners in order: **TL, TR, BR, BL**.
5. Click **Process**. Tweak sliders:
   - **Blur radius** — Gaussian kernel (odd). Higher = smoother outlines.
   - **Threshold** — gray level 0–255.
   - **Invert threshold** — on for backlit (tools dark on bright grid).
   - **Edge margin** — discard contours touching border within N px.
   - **Min area** — skip small noise blobs (px²).
   - **Show original** — overlay warped photo under outlines (toggle).
   - **Show grid** — draw the 1" grid lines.
6. Click **Download JPG**.

All processing is client-side via OpenCV.js — no upload leaves your browser.

## Host on GitHub Pages

```bash
cd tool-silhouette-web
git init && git add . && git commit -m "init"
gh repo create tool-silhouette-web --public --source=. --push
gh api repos/:owner/tool-silhouette-web/pages -X POST -f source.branch=main -f source.path=/
```

Or: push to GitHub → Settings → Pages → Source: main / root.

## Files
- `index.html` — UI
- `styles.css` — dark theme
- `app.js` — pipeline (perspective warp → threshold → contours → draw)
