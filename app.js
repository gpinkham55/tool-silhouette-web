// Tool Silhouette Tracer — client-side OpenCV.js pipeline.
// Mirrors the Python reference pipeline: warp → Otsu → morph open/close → CHAIN_APPROX_NONE.
// SVG export uses mm units + <polygon> tags to match CAM-ready reference format.

const MM_PER_INCH = 25.4;

const els = {
  file: document.getElementById('fileInput'),
  gridW: document.getElementById('gridW'),
  gridH: document.getElementById('gridH'),
  ppi: document.getElementById('ppi'),
  srcCanvas: document.getElementById('srcCanvas'),
  outCanvas: document.getElementById('outCanvas'),
  reset: document.getElementById('resetCorners'),
  blur: document.getElementById('blur'),
  threshOff: document.getElementById('threshOff'),
  margin: document.getElementById('margin'),
  minArea: document.getElementById('minArea'),
  morphOpen: document.getElementById('morphOpen'),
  morphClose: document.getElementById('morphClose'),
  offsetMm: document.getElementById('offsetMm'),
  invert: document.getElementById('invert'),
  includeBorder: document.getElementById('includeBorder'),
  showOrig: document.getElementById('showOrig'),
  showGrid: document.getElementById('showGrid'),
  processBtn: document.getElementById('processBtn'),
  downloadJpgBtn: document.getElementById('downloadJpgBtn'),
  downloadSvgBtn: document.getElementById('downloadSvgBtn'),
  cvStatus: document.getElementById('cvStatus'),
  countHud: document.getElementById('countHud'),
  blurV: document.getElementById('blurV'),
  threshOffV: document.getElementById('threshOffV'),
  marginV: document.getElementById('marginV'),
  minAreaV: document.getElementById('minAreaV'),
  morphOpenV: document.getElementById('morphOpenV'),
  morphCloseV: document.getElementById('morphCloseV'),
  offsetMmV: document.getElementById('offsetMmV'),
};

const state = {
  img: null,
  srcMat: null,
  corners: [],
  warped: null,
  polygons: [],   // Array<Array<{x,y}>> dense pixel points in warped frame
  cvReady: false,
};

window.onOpenCvReady = () => {
  const check = setInterval(() => {
    if (window.cv && cv.Mat) {
      clearInterval(check);
      state.cvReady = true;
      els.cvStatus.textContent = 'ready';
      updateProcessBtn();
    }
  }, 50);
};

for (const k of ['blur','threshOff','margin','minArea','morphOpen','morphClose','offsetMm']) {
  els[k].addEventListener('input', () => { els[k + 'V'].textContent = els[k].value; });
}

els.file.addEventListener('change', (e) => {
  const f = e.target.files[0];
  if (!f) return;
  const img = new Image();
  img.onload = () => {
    state.img = img;
    state.corners = [];
    if (state.srcMat) { state.srcMat.delete(); state.srcMat = null; }
    drawSource();
    updateProcessBtn();
  };
  img.src = URL.createObjectURL(f);
});

els.reset.addEventListener('click', () => {
  state.corners = [];
  drawSource();
  updateProcessBtn();
});

els.srcCanvas.addEventListener('click', (e) => {
  if (!state.img || state.corners.length >= 4) return;
  const rect = els.srcCanvas.getBoundingClientRect();
  const scaleX = state.img.naturalWidth / rect.width;
  const scaleY = state.img.naturalHeight / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;
  state.corners.push({ x, y });
  drawSource();
  updateProcessBtn();
});

function drawSource() {
  if (!state.img) return;
  const c = els.srcCanvas;
  const maxW = Math.min(1200, window.innerWidth - 80);
  const scale = Math.min(1, maxW / state.img.naturalWidth);
  c.width = state.img.naturalWidth;
  c.height = state.img.naturalHeight;
  c.style.width = (state.img.naturalWidth * scale) + 'px';
  c.style.height = (state.img.naturalHeight * scale) + 'px';
  const ctx = c.getContext('2d');
  ctx.drawImage(state.img, 0, 0);
  ctx.strokeStyle = '#0f0';
  ctx.fillStyle = 'rgba(0,255,0,0.3)';
  ctx.lineWidth = Math.max(2, state.img.naturalWidth / 500);
  if (state.corners.length > 1) {
    ctx.beginPath();
    ctx.moveTo(state.corners[0].x, state.corners[0].y);
    for (let i = 1; i < state.corners.length; i++) ctx.lineTo(state.corners[i].x, state.corners[i].y);
    if (state.corners.length === 4) ctx.closePath();
    ctx.stroke();
    if (state.corners.length === 4) ctx.fill();
  }
  const r = Math.max(6, state.img.naturalWidth / 200);
  const labels = ['TL','TR','BR','BL'];
  ctx.fillStyle = '#0f0';
  ctx.font = `${Math.max(16, state.img.naturalWidth/70)}px sans-serif`;
  state.corners.forEach((p, i) => {
    ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#000'; ctx.fillText(labels[i], p.x + r + 2, p.y - r);
    ctx.fillStyle = '#0f0';
  });
}

function updateProcessBtn() {
  els.processBtn.disabled = !(state.cvReady && state.img && state.corners.length === 4);
}

els.processBtn.addEventListener('click', processImage);
['invert','includeBorder','showOrig','showGrid'].forEach(id => {
  els[id].addEventListener('change', () => { if (state.warped) detect(); });
});
['blur','threshOff','margin','minArea','morphOpen','morphClose','offsetMm'].forEach(id => {
  els[id].addEventListener('input', debounce(() => { if (state.warped) detect(); }, 150));
});

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function odd(n) { n = n | 0; return Math.max(1, n | 1); }

function processImage() {
  const tmp = document.createElement('canvas');
  tmp.width = state.img.naturalWidth; tmp.height = state.img.naturalHeight;
  tmp.getContext('2d').drawImage(state.img, 0, 0);
  if (state.srcMat) state.srcMat.delete();
  state.srcMat = cv.imread(tmp);

  const gridW = parseFloat(els.gridW.value);
  const gridH = parseFloat(els.gridH.value);
  const ppi = parseInt(els.ppi.value, 10);
  const outW = Math.round(gridW * ppi);
  const outH = Math.round(gridH * ppi);

  const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2,
    [].concat(...state.corners.map(p => [p.x, p.y])));
  const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2,
    [0,0, outW,0, outW,outH, 0,outH]);
  const M = cv.getPerspectiveTransform(srcPts, dstPts);
  if (state.warped) state.warped.delete();
  state.warped = new cv.Mat();
  cv.warpPerspective(state.srcMat, state.warped, M, new cv.Size(outW, outH), cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());
  srcPts.delete(); dstPts.delete(); M.delete();

  detect();
  els.downloadJpgBtn.disabled = false;
  els.downloadSvgBtn.disabled = false;
}

function detect() {
  const W = state.warped.cols;
  const H = state.warped.rows;
  const blurK = odd(parseInt(els.blur.value, 10));
  const threshOffset = parseInt(els.threshOff.value, 10);
  const margin = parseInt(els.margin.value, 10);
  const minArea = parseInt(els.minArea.value, 10);
  const openK = parseInt(els.morphOpen.value, 10);
  const closeK = parseInt(els.morphClose.value, 10);
  const invert = els.invert.checked;

  const gray = new cv.Mat();
  cv.cvtColor(state.warped, gray, cv.COLOR_RGBA2GRAY);
  const blurred = new cv.Mat();
  cv.GaussianBlur(gray, blurred, new cv.Size(blurK, blurK), 0);

  // Otsu finds optimal threshold, then offset.
  const otsuMat = new cv.Mat();
  const otsuVal = cv.threshold(blurred, otsuMat, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
  otsuMat.delete();
  const thrVal = Math.max(0, Math.min(255, Math.round(otsuVal + threshOffset)));

  const bin = new cv.Mat();
  cv.threshold(blurred, bin, thrVal, 255, invert ? cv.THRESH_BINARY_INV : cv.THRESH_BINARY);

  // Morph open: kills thin grid lines + speckle.
  if (openK > 0) {
    const ks = odd(openK);
    const k = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(ks, ks));
    cv.morphologyEx(bin, bin, cv.MORPH_OPEN, k);
    k.delete();
  }
  // Morph close: fills holes inside tools.
  if (closeK > 0) {
    const ks = odd(closeK);
    const k = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(ks, ks));
    cv.morphologyEx(bin, bin, cv.MORPH_CLOSE, k);
    k.delete();
  }

  // Outward offset (kerf + clearance) in mm → dilate binary by exact px amount.
  // px_per_mm = W / (gridW_in * 25.4). Kernel radius = offset_mm * px_per_mm.
  const offsetMm = parseFloat(els.offsetMm.value);
  if (offsetMm > 0) {
    const gridW_in = parseFloat(els.gridW.value);
    const pxPerMm = W / (gridW_in * MM_PER_INCH);
    const radiusPx = Math.max(1, Math.round(offsetMm * pxPerMm));
    const ks = odd(2 * radiusPx + 1);
    const k = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(ks, ks));
    cv.dilate(bin, bin, k);
    k.delete();
  }

  const contours = new cv.MatVector();
  const hier = new cv.Mat();
  // CHAIN_APPROX_NONE: dense points matching reference SVG.
  cv.findContours(bin, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_NONE);

  const polys = [];
  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    if (cv.contourArea(cnt) < minArea) { cnt.delete(); continue; }
    const r = cv.boundingRect(cnt);
    if (r.x <= margin || r.y <= margin ||
        r.x + r.width >= W - margin || r.y + r.height >= H - margin) {
      cnt.delete(); continue;
    }
    const data = cnt.data32S;
    const pts = new Array(cnt.rows);
    for (let k = 0; k < cnt.rows; k++) pts[k] = { x: data[k*2], y: data[k*2+1] };
    polys.push(pts);
    cnt.delete();
  }
  gray.delete(); blurred.delete(); bin.delete(); contours.delete(); hier.delete();

  state.polygons = polys;
  els.countHud.textContent = `${polys.length} outlines · thr=${thrVal} · +${parseFloat(els.offsetMm.value).toFixed(2)}mm`;
  renderPreview();
}

function renderPreview() {
  const gridW = parseFloat(els.gridW.value);
  const gridH = parseFloat(els.gridH.value);
  const ppi = parseInt(els.ppi.value, 10);
  const W = state.warped.cols;
  const H = state.warped.rows;
  const out = els.outCanvas;
  out.width = W; out.height = H;
  const maxW = Math.min(1200, window.innerWidth - 80);
  const scale = Math.min(1, maxW / W);
  out.style.width = (W * scale) + 'px';
  out.style.height = (H * scale) + 'px';
  const ctx = out.getContext('2d');

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);

  if (els.showOrig.checked) {
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    cv.imshow(tmp, state.warped);
    ctx.globalAlpha = 0.5;
    ctx.drawImage(tmp, 0, 0);
    ctx.globalAlpha = 1;
  }

  if (els.showGrid.checked) {
    ctx.strokeStyle = '#d6e9ff';
    ctx.lineWidth = 1;
    for (let i = 1; i < gridW; i++) {
      const x = i * ppi;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let j = 1; j < gridH; j++) {
      const y = j * ppi;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

  drawOutlines(ctx, state.polygons, { border: els.includeBorder.checked, W, H });
}

function drawOutlines(ctx, polys, opts) {
  ctx.strokeStyle = '#000';
  ctx.fillStyle = 'transparent';
  if (opts.border) {
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, opts.W, opts.H);
  }
  ctx.lineWidth = 1.2;
  for (const pts of polys) {
    if (pts.length < 2) continue;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
    ctx.closePath();
    ctx.stroke();
  }
}

function renderExportCanvas() {
  const W = state.warped.cols;
  const H = state.warped.rows;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  drawOutlines(ctx, state.polygons, { border: els.includeBorder.checked, W, H });
  return c;
}

// Build SVG in mm units matching reference: <rect> + <g stroke><polygon/></g>.
function buildSVG() {
  const gridW_in = parseFloat(els.gridW.value);
  const gridH_in = parseFloat(els.gridH.value);
  const gridW_mm = gridW_in * MM_PER_INCH;
  const gridH_mm = gridH_in * MM_PER_INCH;
  const W = state.warped.cols;
  const H = state.warped.rows;
  const sx = gridW_mm / W;
  const sy = gridH_mm / H;

  const lines = [];
  lines.push('<?xml version="1.0" encoding="UTF-8"?>');
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${gridW_mm}mm" height="${gridH_mm}mm" viewBox="0 0 ${gridW_mm} ${gridH_mm}">`);
  if (els.includeBorder.checked) {
    lines.push(`  <rect x="0" y="0" width="${gridW_mm}" height="${gridH_mm}" fill="none" stroke="black" stroke-width="0.5"/>`);
  }
  lines.push(`  <g fill="none" stroke="black" stroke-width="0.3">`);
  for (const pts of state.polygons) {
    if (pts.length < 2) continue;
    const coords = pts.map(p => `${(p.x * sx).toFixed(3)},${(p.y * sy).toFixed(3)}`).join(' ');
    lines.push(`  <polygon points="${coords}"/>`);
  }
  lines.push(`  </g>`);
  lines.push(`</svg>`);
  return lines.join('\n');
}

els.downloadJpgBtn.addEventListener('click', () => {
  const c = renderExportCanvas();
  const a = document.createElement('a');
  a.href = c.toDataURL('image/jpeg', 0.95);
  a.download = 'tool-silhouettes.jpg';
  a.click();
});

els.downloadSvgBtn.addEventListener('click', () => {
  const svg = buildSVG();
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tool-silhouettes.svg';
  a.click();
});
