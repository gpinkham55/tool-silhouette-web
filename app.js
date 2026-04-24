// Tool Silhouette Tracer — client-side OpenCV.js pipeline.

const els = {
  file: document.getElementById('fileInput'),
  gridW: document.getElementById('gridW'),
  gridH: document.getElementById('gridH'),
  ppi: document.getElementById('ppi'),
  srcCanvas: document.getElementById('srcCanvas'),
  outCanvas: document.getElementById('outCanvas'),
  reset: document.getElementById('resetCorners'),
  blur: document.getElementById('blur'),
  thresh: document.getElementById('thresh'),
  margin: document.getElementById('margin'),
  minArea: document.getElementById('minArea'),
  invert: document.getElementById('invert'),
  showOrig: document.getElementById('showOrig'),
  showGrid: document.getElementById('showGrid'),
  processBtn: document.getElementById('processBtn'),
  downloadBtn: document.getElementById('downloadBtn'),
  cvStatus: document.getElementById('cvStatus'),
  blurV: document.getElementById('blurV'),
  threshV: document.getElementById('threshV'),
  marginV: document.getElementById('marginV'),
  minAreaV: document.getElementById('minAreaV'),
};

const state = {
  img: null,        // HTMLImageElement
  srcMat: null,     // cv.Mat of uploaded image (RGBA)
  corners: [],      // [{x,y}] in image coords, max 4: TL,TR,BR,BL
  warped: null,     // cv.Mat of perspective-corrected image
  lastOut: null,    // last output canvas data URL
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

// --- Slider live labels
for (const k of ['blur', 'thresh', 'margin', 'minArea']) {
  els[k].addEventListener('input', () => { els[k + 'V'].textContent = els[k].value; });
}

// --- File load
els.file.addEventListener('change', async (e) => {
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

// --- Click corners
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
  // draw corner markers + polygon
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

// --- Process
els.processBtn.addEventListener('click', processImage);
['blur','thresh','margin','minArea','invert','showOrig','showGrid'].forEach(id => {
  els[id].addEventListener('change', () => { if (state.warped) render(); });
});
els.blur.addEventListener('input', debounce(() => { if (state.warped) render(); }, 150));
els.thresh.addEventListener('input', debounce(() => { if (state.warped) render(); }, 150));
els.margin.addEventListener('input', debounce(() => { if (state.warped) render(); }, 150));
els.minArea.addEventListener('input', debounce(() => { if (state.warped) render(); }, 150));

function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

function processImage() {
  // build srcMat
  const tmp = document.createElement('canvas');
  tmp.width = state.img.naturalWidth; tmp.height = state.img.naturalHeight;
  tmp.getContext('2d').drawImage(state.img, 0, 0);
  if (state.srcMat) state.srcMat.delete();
  state.srcMat = cv.imread(tmp);

  // perspective warp to gridW*ppi x gridH*ppi
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

  render();
  els.downloadBtn.disabled = false;
}

function render() {
  const gridW = parseFloat(els.gridW.value);
  const gridH = parseFloat(els.gridH.value);
  const ppi = parseInt(els.ppi.value, 10);
  const W = state.warped.cols;
  const H = state.warped.rows;

  let blur = parseInt(els.blur.value, 10);
  if (blur % 2 === 0) blur += 1;
  const thresh = parseInt(els.thresh.value, 10);
  const margin = parseInt(els.margin.value, 10);
  const minArea = parseInt(els.minArea.value, 10);
  const invert = els.invert.checked;

  // gray + blur + threshold
  const gray = new cv.Mat();
  cv.cvtColor(state.warped, gray, cv.COLOR_RGBA2GRAY);
  const blurred = new cv.Mat();
  cv.GaussianBlur(gray, blurred, new cv.Size(blur, blur), 0);
  const bin = new cv.Mat();
  const tType = invert ? cv.THRESH_BINARY_INV : cv.THRESH_BINARY;
  cv.threshold(blurred, bin, thresh, 255, tType);

  // find contours
  const contours = new cv.MatVector();
  const hier = new cv.Mat();
  cv.findContours(bin, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

  // prepare output canvas
  const out = els.outCanvas;
  out.width = W; out.height = H;
  const maxW = Math.min(1200, window.innerWidth - 80);
  const scale = Math.min(1, maxW / W);
  out.style.width = (W * scale) + 'px';
  out.style.height = (H * scale) + 'px';
  const ctx = out.getContext('2d');

  // background
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);

  if (els.showOrig.checked) {
    // render warped original beneath
    const tmp = document.createElement('canvas');
    tmp.width = W; tmp.height = H;
    cv.imshow(tmp, state.warped);
    ctx.globalAlpha = 0.55;
    ctx.drawImage(tmp, 0, 0);
    ctx.globalAlpha = 1;
  }

  if (els.showGrid.checked) {
    ctx.strokeStyle = '#cfe8ff';
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

  // outer border (17x12 rectangle)
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, W, H);

  // outlines
  ctx.strokeStyle = '#000';
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 2;
  let kept = 0;
  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const area = cv.contourArea(cnt);
    if (area < minArea) { cnt.delete(); continue; }
    const rect = cv.boundingRect(cnt);
    // edge margin filter: skip contours touching/near border
    if (rect.x < margin || rect.y < margin ||
        rect.x + rect.width > W - margin || rect.y + rect.height > H - margin) {
      cnt.delete(); continue;
    }
    // draw polygon
    ctx.beginPath();
    const data = cnt.data32S;
    for (let k = 0; k < cnt.rows; k++) {
      const x = data[k*2], y = data[k*2+1];
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    kept++;
    cnt.delete();
  }

  // HUD
  ctx.fillStyle = '#333';
  ctx.font = '14px sans-serif';
  ctx.fillText(`${gridW}" × ${gridH}"   ${kept} outlines   ${ppi} px/in`, 8, H - 8);

  // store jpg
  state.lastOut = out.toDataURL('image/jpeg', 0.92);

  gray.delete(); blurred.delete(); bin.delete(); contours.delete(); hier.delete();
}

els.downloadBtn.addEventListener('click', () => {
  if (!state.lastOut) return;
  const a = document.createElement('a');
  a.href = state.lastOut;
  a.download = 'tool-silhouettes.jpg';
  a.click();
});
