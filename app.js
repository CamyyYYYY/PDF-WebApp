/* global pdfjsLib, PDFLib */

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const $ = (id) => document.getElementById(id);
const els = {
  fileInput: $('fileInput'), openBtn: $('openBtn'), chooseBtn: $('chooseBtn'), exportBtn: $('exportBtn'),
  emptyState: $('emptyState'), editor: $('editor'), dropZone: $('dropZone'), thumbs: $('thumbs'), pageCount: $('pageCount'),
  pdfCanvas: $('pdfCanvas'), overlayCanvas: $('overlayCanvas'), pageStage: $('pageStage'), documentArea: $('documentArea'),
  fileName: $('fileName'), pageStatus: $('pageStatus'), zoomLabel: $('zoomLabel'), zoomIn: $('zoomIn'), zoomOut: $('zoomOut'),
  fontSize: $('fontSize'), colorPicker: $('colorPicker'), undoBtn: $('undoBtn'), rotateBtn: $('rotateBtn'), deleteBtn: $('deleteBtn'),
  textDialog: $('textDialog'), textForm: $('textForm'), textInput: $('textInput'), cancelText: $('cancelText'), toast: $('toast')
};

const state = {
  bytes: null,
  pdf: null,
  filename: 'edited.pdf',
  page: 1,
  zoom: 1,
  baseScale: 1.35,
  tool: 'select',
  pageStates: [],
  pendingTextPoint: null,
  drawing: false,
  currentStroke: null,
  renderToken: 0
};

const pdfCtx = els.pdfCanvas.getContext('2d');
const overlayCtx = els.overlayCanvas.getContext('2d');

// ---------- IndexedDB recovery autosave ----------
// Keeps ONE revolving recovery record on the user's device. It never uploads
// recovery data to GitHub and it never creates a growing series of PDF copies.
const RECOVERY_DB_NAME = 'SimplePDFEditorRecovery';
const RECOVERY_DB_VERSION = 1;
const RECOVERY_STORE = 'drafts';
const RECOVERY_KEY = 'current';
const RECOVERY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
let recoveryTimer = null;
let recoveryDbPromise = null;

function openRecoveryDb() {
  if (!('indexedDB' in window)) return Promise.resolve(null);
  if (recoveryDbPromise) return recoveryDbPromise;

  recoveryDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(RECOVERY_DB_NAME, RECOVERY_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(RECOVERY_STORE)) {
        db.createObjectStore(RECOVERY_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    console.warn('Recovery storage unavailable:', error);
    return null;
  });

  return recoveryDbPromise;
}

async function putRecovery(record) {
  const db = await openRecoveryDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(RECOVERY_STORE, 'readwrite');
      tx.objectStore(RECOVERY_STORE).put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => {
        console.warn('Recovery autosave failed:', tx.error);
        resolve(false);
      };
      tx.onabort = () => resolve(false);
    } catch (error) {
      console.warn('Recovery autosave failed:', error);
      resolve(false);
    }
  });
}

async function getRecovery() {
  const db = await openRecoveryDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(RECOVERY_STORE, 'readonly');
      const request = tx.objectStore(RECOVERY_STORE).get(RECOVERY_KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    } catch (error) {
      resolve(null);
    }
  });
}

async function clearRecovery() {
  clearTimeout(recoveryTimer);
  recoveryTimer = null;
  const db = await openRecoveryDb();
  if (!db) return;
  await new Promise((resolve) => {
    try {
      const tx = db.transaction(RECOVERY_STORE, 'readwrite');
      tx.objectStore(RECOVERY_STORE).delete(RECOVERY_KEY);
      tx.oncomplete = resolve;
      tx.onerror = resolve;
      tx.onabort = resolve;
    } catch (error) {
      resolve();
    }
  });
}

async function cleanupStaleRecovery() {
  const draft = await getRecovery();
  if (!draft) return;
  if (!draft.savedAt || Date.now() - draft.savedAt > RECOVERY_MAX_AGE_MS) {
    await clearRecovery();
  }
}

async function saveRecoveryNow() {
  if (!state.bytes || !state.pdf) return;
  const record = {
    id: RECOVERY_KEY,
    savedAt: Date.now(),
    sourceName: els.fileName.textContent || state.filename,
    filename: state.filename,
    page: state.page,
    zoom: state.zoom,
    baseScale: state.baseScale,
    pageStates: state.pageStates,
    // Store one copy of the imported PDF bytes plus the editor state.
    // The next autosave REPLACES this same record.
    bytes: state.bytes.slice().buffer
  };
  await putRecovery(record);
}

function scheduleRecoveryAutosave(delay = 700) {
  if (!state.bytes || !state.pdf) return;
  clearTimeout(recoveryTimer);
  recoveryTimer = setTimeout(() => saveRecoveryNow(), delay);
}

async function restoreRecoveryIfAvailable() {
  await cleanupStaleRecovery();
  const draft = await getRecovery();
  if (!draft?.bytes) return;

  const saved = draft.savedAt ? new Date(draft.savedAt).toLocaleString() : 'recently';
  const sourceName = draft.sourceName || 'unsaved PDF';
  const shouldRestore = window.confirm(`Recover unsaved PDF?\n\n${sourceName}\nLast autosaved: ${saved}\n\nPress OK to restore it, or Cancel to discard the recovery copy.`);
  if (!shouldRestore) {
    await clearRecovery();
    return;
  }

  try {
    state.bytes = new Uint8Array(draft.bytes);
    state.pdf = await pdfjsLib.getDocument({ data: state.bytes.slice() }).promise;
    state.filename = draft.filename || 'recovered-edited.pdf';
    state.pageStates = Array.isArray(draft.pageStates) && draft.pageStates.length === state.pdf.numPages
      ? draft.pageStates
      : Array.from({ length: state.pdf.numPages }, () => ({ rotation: 0, deleted: false, annotations: [] }));
    state.page = clamp(Number(draft.page) || 1, 1, state.pdf.numPages);
    state.zoom = clamp(Number(draft.zoom) || 1, 0.5, 2.5);
    state.baseScale = Number(draft.baseScale) || state.baseScale;

    els.fileName.textContent = sourceName;
    els.pageCount.textContent = state.pdf.numPages;
    els.emptyState.classList.add('hidden');
    els.editor.classList.remove('hidden');
    els.exportBtn.disabled = false;

    await renderThumbnails();
    await renderPage();
    toast('Recovery draft restored.');
  } catch (error) {
    console.error('Could not restore recovery draft:', error);
    await clearRecovery();
    toast('Recovery draft could not be restored.');
  }
}

async function requestPersistentRecoveryStorage() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch (error) {
    // Persistence is optional; normal IndexedDB recovery still works without it.
  }
}


function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.add('hidden'), 2200);
}

function currentPageState() { return state.pageStates[state.page - 1]; }
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

function hexToRgb01(hex) {
  const clean = hex.replace('#', '');
  const value = parseInt(clean, 16);
  return {
    r: ((value >> 16) & 255) / 255,
    g: ((value >> 8) & 255) / 255,
    b: (value & 255) / 255
  };
}

async function loadPdf(file) {
  if (!file || file.type !== 'application/pdf') {
    toast('Please choose a PDF file.');
    return;
  }

  try {
    const buffer = await file.arrayBuffer();
    state.bytes = new Uint8Array(buffer);
    state.pdf = await pdfjsLib.getDocument({ data: state.bytes.slice() }).promise;
    state.filename = file.name.replace(/\.pdf$/i, '') + '-edited.pdf';
    state.page = 1;
    state.zoom = 1;
    state.pageStates = Array.from({ length: state.pdf.numPages }, () => ({ rotation: 0, deleted: false, annotations: [] }));

    els.fileName.textContent = file.name;
    els.pageCount.textContent = state.pdf.numPages;
    els.emptyState.classList.add('hidden');
    els.editor.classList.remove('hidden');
    els.exportBtn.disabled = false;

    await renderThumbnails();
    await renderPage();
    await requestPersistentRecoveryStorage();
    scheduleRecoveryAutosave(0);
    toast('PDF loaded locally. Recovery autosave is on.');
  } catch (error) {
    console.error(error);
    toast('Could not open that PDF.');
  }
}

async function renderPage() {
  if (!state.pdf) return;
  const token = ++state.renderToken;
  const pageState = currentPageState();
  if (pageState.deleted) {
    const next = state.pageStates.findIndex((p) => !p.deleted);
    if (next < 0) return;
    state.page = next + 1;
  }

  const page = await state.pdf.getPage(state.page);
  if (token !== state.renderToken) return;
  const rotation = currentPageState().rotation;
  const scale = state.baseScale * state.zoom;
  const viewport = page.getViewport({ scale, rotation });
  const outputScale = window.devicePixelRatio || 1;

  els.pdfCanvas.width = Math.floor(viewport.width * outputScale);
  els.pdfCanvas.height = Math.floor(viewport.height * outputScale);
  els.pdfCanvas.style.width = `${viewport.width}px`;
  els.pdfCanvas.style.height = `${viewport.height}px`;
  els.overlayCanvas.width = Math.floor(viewport.width * outputScale);
  els.overlayCanvas.height = Math.floor(viewport.height * outputScale);
  els.overlayCanvas.style.width = `${viewport.width}px`;
  els.overlayCanvas.style.height = `${viewport.height}px`;
  els.pageStage.style.width = `${viewport.width}px`;
  els.pageStage.style.height = `${viewport.height}px`;

  await page.render({
    canvasContext: pdfCtx,
    viewport,
    transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null
  }).promise;

  drawOverlay();
  refreshUI();
}

function drawOverlay() {
  const dpr = window.devicePixelRatio || 1;
  const cssW = els.overlayCanvas.width / dpr;
  const cssH = els.overlayCanvas.height / dpr;
  overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  overlayCtx.clearRect(0, 0, cssW, cssH);

  const pageState = currentPageState();
  if (!pageState) return;
  const visualScale = state.baseScale * state.zoom;

  for (const ann of pageState.annotations) {
    if (ann.type === 'text') {
      overlayCtx.save();
      overlayCtx.fillStyle = ann.color;
      overlayCtx.font = `${ann.size * visualScale}px Inter, Arial, sans-serif`;
      overlayCtx.textBaseline = 'top';
      const lines = ann.text.split('\n');
      lines.forEach((line, i) => overlayCtx.fillText(line, ann.x * visualScale, (ann.y + i * ann.size * 1.2) * visualScale));
      overlayCtx.restore();
    } else if (ann.type === 'draw') {
      overlayCtx.save();
      overlayCtx.strokeStyle = ann.color;
      overlayCtx.lineWidth = ann.width * visualScale;
      overlayCtx.lineCap = 'round';
      overlayCtx.lineJoin = 'round';
      overlayCtx.beginPath();
      ann.points.forEach((p, i) => {
        const x = p.x * visualScale;
        const y = p.y * visualScale;
        if (i === 0) overlayCtx.moveTo(x, y); else overlayCtx.lineTo(x, y);
      });
      overlayCtx.stroke();
      overlayCtx.restore();
    }
  }
}

async function renderThumbnails() {
  els.thumbs.innerHTML = '';
  for (let i = 1; i <= state.pdf.numPages; i++) {
    const pageState = state.pageStates[i - 1];
    const wrapper = document.createElement('button');
    wrapper.className = `thumb${i === state.page ? ' active' : ''}${pageState.deleted ? ' deleted' : ''}`;
    wrapper.type = 'button';
    wrapper.dataset.page = i;
    wrapper.innerHTML = `<canvas></canvas><div class="thumb-label"><span>Page ${i}</span><span>${pageState.deleted ? 'Deleted' : ''}</span></div>`;
    wrapper.addEventListener('click', async () => {
      if (pageState.deleted) return;
      state.page = i;
      await renderPage();
      updateThumbSelection();
    });
    els.thumbs.appendChild(wrapper);

    const pdfPage = await state.pdf.getPage(i);
    const viewport = pdfPage.getViewport({ scale: 0.22, rotation: pageState.rotation });
    const canvas = wrapper.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    await pdfPage.render({ canvasContext: ctx, viewport }).promise;
  }
}

function updateThumbSelection() {
  [...els.thumbs.children].forEach((thumb) => thumb.classList.toggle('active', Number(thumb.dataset.page) === state.page));
}

function refreshUI() {
  const alive = state.pageStates.filter((p) => !p.deleted).length;
  els.pageStatus.textContent = `Page ${state.page} of ${state.pdf?.numPages || 0} • ${alive} kept`;
  els.zoomLabel.textContent = `${Math.round(state.zoom * 100)}%`;
  els.undoBtn.disabled = !currentPageState()?.annotations.length;
  updateThumbSelection();
}

function pointOnOverlay(evt) {
  const rect = els.overlayCanvas.getBoundingClientRect();
  const xCss = clamp(evt.clientX - rect.left, 0, rect.width);
  const yCss = clamp(evt.clientY - rect.top, 0, rect.height);
  const visualScale = state.baseScale * state.zoom;
  return { x: xCss / visualScale, y: yCss / visualScale };
}

function setTool(tool) {
  state.tool = tool;
  document.querySelectorAll('[data-tool]').forEach((btn) => btn.classList.toggle('active', btn.dataset.tool === tool));
  els.overlayCanvas.style.cursor = tool === 'text' ? 'text' : tool === 'draw' ? 'crosshair' : 'default';
}

document.querySelectorAll('[data-tool]').forEach((btn) => btn.addEventListener('click', () => setTool(btn.dataset.tool)));

els.overlayCanvas.addEventListener('pointerdown', (evt) => {
  if (!state.pdf || currentPageState().deleted) return;
  if (state.tool === 'text') {
    state.pendingTextPoint = pointOnOverlay(evt);
    els.textDialog.classList.remove('hidden');
    els.textInput.value = '';
    setTimeout(() => els.textInput.focus(), 0);
    return;
  }
  if (state.tool === 'draw') {
    state.drawing = true;
    els.overlayCanvas.setPointerCapture(evt.pointerId);
    const p = pointOnOverlay(evt);
    state.currentStroke = {
      type: 'draw',
      points: [p],
      color: els.colorPicker.value,
      width: 2.2 / state.baseScale
    };
    currentPageState().annotations.push(state.currentStroke);
    drawOverlay();
  }
});

els.overlayCanvas.addEventListener('pointermove', (evt) => {
  if (!state.drawing || state.tool !== 'draw' || !state.currentStroke) return;
  state.currentStroke.points.push(pointOnOverlay(evt));
  drawOverlay();
});

function endStroke() {
  if (!state.drawing) return;
  state.drawing = false;
  if (state.currentStroke && state.currentStroke.points.length < 2) currentPageState().annotations.pop();
  state.currentStroke = null;
  refreshUI();
  scheduleRecoveryAutosave();
}
els.overlayCanvas.addEventListener('pointerup', endStroke);
els.overlayCanvas.addEventListener('pointercancel', endStroke);

els.textForm.addEventListener('submit', (evt) => {
  evt.preventDefault();
  const text = els.textInput.value.trim();
  if (text && state.pendingTextPoint) {
    currentPageState().annotations.push({
      type: 'text', text, x: state.pendingTextPoint.x, y: state.pendingTextPoint.y,
      size: clamp(Number(els.fontSize.value) || 20, 8, 96) / state.baseScale,
      color: els.colorPicker.value
    });
    drawOverlay();
    refreshUI();
    scheduleRecoveryAutosave();
  }
  state.pendingTextPoint = null;
  els.textDialog.classList.add('hidden');
});
els.cancelText.addEventListener('click', () => { state.pendingTextPoint = null; els.textDialog.classList.add('hidden'); });
els.textDialog.addEventListener('click', (evt) => { if (evt.target === els.textDialog) els.cancelText.click(); });

els.undoBtn.addEventListener('click', () => {
  currentPageState()?.annotations.pop();
  drawOverlay();
  refreshUI();
  scheduleRecoveryAutosave();
});

els.rotateBtn.addEventListener('click', async () => {
  const ps = currentPageState();
  ps.rotation = (ps.rotation + 90) % 360;
  await renderPage();
  await renderThumbnails();
  scheduleRecoveryAutosave();
});

els.deleteBtn.addEventListener('click', async () => {
  const kept = state.pageStates.filter((p) => !p.deleted).length;
  if (kept <= 1) { toast('A PDF needs at least one page.'); return; }
  currentPageState().deleted = true;
  const next = state.pageStates.findIndex((p, idx) => idx >= state.page && !p.deleted);
  const fallback = state.pageStates.map((p, idx) => ({ p, idx })).reverse().find(({ p, idx }) => idx < state.page - 1 && !p.deleted);
  state.page = next >= 0 ? next + 1 : (fallback ? fallback.idx + 1 : 1);
  await renderThumbnails();
  await renderPage();
  scheduleRecoveryAutosave();
});

els.zoomIn.addEventListener('click', async () => { state.zoom = clamp(state.zoom + 0.15, 0.5, 2.5); await renderPage(); scheduleRecoveryAutosave(); });
els.zoomOut.addEventListener('click', async () => { state.zoom = clamp(state.zoom - 0.15, 0.5, 2.5); await renderPage(); scheduleRecoveryAutosave(); });

async function exportPdf() {
  if (!state.bytes) return;
  els.exportBtn.disabled = true;
  els.exportBtn.textContent = 'Exporting…';
  try {
    const { PDFDocument, StandardFonts, rgb, degrees } = PDFLib;
    const source = await PDFDocument.load(state.bytes.slice());
    const out = await PDFDocument.create();
    const font = await out.embedFont(StandardFonts.Helvetica);

    for (let i = 0; i < source.getPageCount(); i++) {
      const ps = state.pageStates[i];
      if (ps.deleted) continue;

      const [copied] = await out.copyPages(source, [i]);
      out.addPage(copied);
      const outPage = out.getPage(out.getPageCount() - 1);
      const pdfJsPage = await state.pdf.getPage(i + 1);
      const viewport = pdfJsPage.getViewport({ scale: 1, rotation: ps.rotation });

      for (const ann of ps.annotations) {
        const c = hexToRgb01(ann.color);
        const color = rgb(c.r, c.g, c.b);
        if (ann.type === 'text') {
          const lines = ann.text.split('\n');
          lines.forEach((line, lineIndex) => {
            const visualX = ann.x;
            const visualTopY = ann.y + lineIndex * ann.size * 1.2;
            // PDF.js maps display points back into the original page coordinate system.
            const [px, pyTop] = viewport.convertToPdfPoint(visualX, visualTopY);
            const [px2, pyBottom] = viewport.convertToPdfPoint(visualX, visualTopY + ann.size);
            const y = Math.min(pyTop, pyBottom);
            outPage.drawText(line || ' ', {
              x: px,
              y,
              size: ann.size,
              font,
              color
            });
          });
        } else if (ann.type === 'draw' && ann.points.length > 1) {
          for (let p = 1; p < ann.points.length; p++) {
            const a = viewport.convertToPdfPoint(ann.points[p - 1].x, ann.points[p - 1].y);
            const b = viewport.convertToPdfPoint(ann.points[p].x, ann.points[p].y);
            outPage.drawLine({
              start: { x: a[0], y: a[1] },
              end: { x: b[0], y: b[1] },
              thickness: ann.width,
              color,
              opacity: 1
            });
          }
        }
      }

      outPage.setRotation(degrees(ps.rotation));
    }

    const result = await out.save();
    const blob = new Blob([result], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = state.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    await clearRecovery();
    toast('Edited PDF exported. Recovery copy cleared.');
  } catch (error) {
    console.error(error);
    toast('Export failed. Try another PDF.');
  } finally {
    els.exportBtn.disabled = false;
    els.exportBtn.textContent = 'Export PDF';
  }
}

els.exportBtn.addEventListener('click', exportPdf);
const openPicker = () => els.fileInput.click();
els.openBtn.addEventListener('click', openPicker);
els.chooseBtn.addEventListener('click', openPicker);
els.fileInput.addEventListener('change', (evt) => loadPdf(evt.target.files[0]));

['dragenter', 'dragover'].forEach((name) => els.dropZone.addEventListener(name, (evt) => {
  evt.preventDefault(); els.dropZone.classList.add('dragging');
}));
['dragleave', 'drop'].forEach((name) => els.dropZone.addEventListener(name, (evt) => {
  evt.preventDefault(); els.dropZone.classList.remove('dragging');
}));
els.dropZone.addEventListener('drop', (evt) => loadPdf(evt.dataTransfer.files[0]));

window.addEventListener('keydown', (evt) => {
  if ((evt.ctrlKey || evt.metaKey) && evt.key.toLowerCase() === 'z' && !els.editor.classList.contains('hidden')) {
    evt.preventDefault(); els.undoBtn.click();
  }
  if (evt.key === 'Escape' && !els.textDialog.classList.contains('hidden')) els.cancelText.click();
});


// Check for a recoverable editing session when the app opens.
window.addEventListener('DOMContentLoaded', () => {
  restoreRecoveryIfAvailable();
});
