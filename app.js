(() => {
'use strict';

// Load PDF libraries lazily and with a fallback CDN. This prevents one failed
// CDN request from stopping the entire UI before button handlers are attached.
const PDFJS_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js'
];
const PDFJS_WORKERS = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js'
];
const PDFLIB_URLS = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
  'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'
];

let pdfJsLoadPromise = null;
let pdfLibLoadPromise = null;

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const existing = [...document.scripts].find(s => s.src === url);
    if (existing && existing.dataset.loaded === 'true') return resolve();
    const script = existing || document.createElement('script');
    const timer = setTimeout(() => reject(new Error(`Timed out loading ${url}`)), 12000);
    const done = () => { clearTimeout(timer); script.dataset.loaded = 'true'; resolve(); };
    const fail = () => { clearTimeout(timer); reject(new Error(`Failed loading ${url}`)); };
    script.addEventListener('load', done, {once:true});
    script.addEventListener('error', fail, {once:true});
    if (!existing) {
      script.src = url;
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

async function ensurePdfJs() {
  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKERS[0];
    return window.pdfjsLib;
  }
  if (!pdfJsLoadPromise) pdfJsLoadPromise = (async () => {
    let lastError;
    for (let i = 0; i < PDFJS_URLS.length; i++) {
      try {
        await loadScript(PDFJS_URLS[i]);
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKERS[i] || PDFJS_WORKERS[0];
          return window.pdfjsLib;
        }
      } catch (e) { lastError = e; }
    }
    throw lastError || new Error('PDF.js could not be loaded.');
  })();
  return pdfJsLoadPromise;
}

async function ensurePdfLib() {
  if (window.PDFLib) return window.PDFLib;
  if (!pdfLibLoadPromise) pdfLibLoadPromise = (async () => {
    let lastError;
    for (const url of PDFLIB_URLS) {
      try {
        await loadScript(url);
        if (window.PDFLib) return window.PDFLib;
      } catch (e) { lastError = e; }
    }
    throw lastError || new Error('pdf-lib could not be loaded.');
  })();
  return pdfLibLoadPromise;
}

function openDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}
function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}
const $ = (id) => document.getElementById(id);
const els = {
  newBtn:$('newBtn'), importBtn:$('importBtn'), saveBtn:$('saveBtn'), addPageBtn:$('addPageBtn'), delPageBtn:$('delPageBtn'), prevBtn:$('prevBtn'), nextBtn:$('nextBtn'), pageLabel:$('pageLabel'),
  imageBtn:$('imageBtn'), colorPicker:$('colorPicker'), undoBtn:$('undoBtn'), redoBtn:$('redoBtn'), deleteSelectedBtn:$('deleteSelectedBtn'), clearPageBtn:$('clearPageBtn'),
  penWidth:$('penWidth'), highlightWidth:$('highlightWidth'), eraserWidth:$('eraserWidth'), textSize:$('textSize'), zoomOutBtn:$('zoomOutBtn'), zoomInBtn:$('zoomInBtn'), zoomInput:$('zoomInput'), applyZoomBtn:$('applyZoomBtn'), fitBtn:$('fitBtn'), zoomLabel:$('zoomLabel'), toolLabel:$('toolLabel'),
  workspace:$('workspace'), emptyState:$('emptyState'), emptyNewBtn:$('emptyNewBtn'), emptyImportBtn:$('emptyImportBtn'), scrollArea:$('scrollArea'), pageStage:$('pageStage'), pdfCanvas:$('pdfCanvas'), overlayCanvas:$('overlayCanvas'),
  status:$('status'), selectionStatus:$('selectionStatus'), pdfInput:$('pdfInput'), imageInput:$('imageInput'), newDialog:$('newDialog'), newForm:$('newForm'), pageSizeSelect:$('pageSizeSelect'), createPdfBtn:$('createPdfBtn'), textDialog:$('textDialog'), textForm:$('textForm'), textDialogTitle:$('textDialogTitle'), textInput:$('textInput'), cancelTextBtn:$('cancelTextBtn'), toast:$('toast')
};
const pdfCtx = els.pdfCanvas.getContext('2d', {alpha:false});
const overlayCtx = els.overlayCanvas.getContext('2d');

const state = {
  sourceBytes:null, sourcePdf:null, pages:[], page:0, tool:'select', zoom:1, fitScale:1, filename:'edited.pdf',
  selected:[], clipboard:[], undo:[], redo:[], pointer:null, currentStroke:null, renderToken:0, imageCache:new Map(), pinch:null,
  recoveryTimer:null, lastFitKey:'', editingTextIndex:null, pendingTextPoint:null
};

const RECOVERY_DB='SimplePDFEditorRecovery', STORE='drafts', KEY='current', MAX_AGE=30*24*60*60*1000;
function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
function deepClone(v){return typeof structuredClone==='function'?structuredClone(v):JSON.parse(JSON.stringify(v));}
function page(){return state.pages[state.page] || null;}
function active(){return state.pages.length>0;}
function cssScale(){return state.zoom;}
function dpr(){return clamp(window.devicePixelRatio||1,1,3);}
function showToast(msg){els.toast.textContent=msg;els.toast.classList.remove('hidden');clearTimeout(showToast.t);showToast.t=setTimeout(()=>els.toast.classList.add('hidden'),2300);}
function setStatus(msg){els.status.textContent=msg;}
function isTypingTarget(t){return t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);}

function openDb(){return new Promise((resolve)=>{if(!('indexedDB'in window))return resolve(null);const r=indexedDB.open(RECOVERY_DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE,{keyPath:'id'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>resolve(null);});}
async function recoveryPut(){if(!active())return;const db=await openDb();if(!db)return;const rec={id:KEY,savedAt:Date.now(),filename:state.filename,page:state.page,zoom:state.zoom,pages:state.pages,sourceBytes:state.sourceBytes?state.sourceBytes.slice().buffer:null};await new Promise(res=>{try{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(rec);tx.oncomplete=tx.onerror=tx.onabort=()=>res();}catch{res();}});}
function scheduleRecovery(delay=700){clearTimeout(state.recoveryTimer);state.recoveryTimer=setTimeout(recoveryPut,delay);}
async function recoveryGet(){const db=await openDb();if(!db)return null;return new Promise(res=>{try{const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get(KEY);r.onsuccess=()=>res(r.result||null);r.onerror=()=>res(null);}catch{res(null);}});}
async function recoveryClear(){clearTimeout(state.recoveryTimer);const db=await openDb();if(!db)return;await new Promise(res=>{try{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(KEY);tx.oncomplete=tx.onerror=tx.onabort=()=>res();}catch{res();}});}
async function restoreRecovery(){const r=await recoveryGet();if(!r)return;if(!r.savedAt||Date.now()-r.savedAt>MAX_AGE){await recoveryClear();return;}if(!confirm(`Recover unsaved PDF?\n\n${r.filename||'Unsaved PDF'}\nLast recovery: ${new Date(r.savedAt).toLocaleString()}`)){await recoveryClear();return;}try{state.sourceBytes=r.sourceBytes?new Uint8Array(r.sourceBytes):null;const pdfjs = state.sourceBytes ? await ensurePdfJs() : null;state.sourcePdf=state.sourceBytes?await pdfjs.getDocument({data:state.sourceBytes.slice()}).promise:null;state.pages=Array.isArray(r.pages)?r.pages:[];state.page=clamp(r.page||0,0,Math.max(0,state.pages.length-1));state.zoom=Number(r.zoom)||1;state.filename=r.filename||'recovered.pdf';openEditor();await fitToWindow(true);showToast('Recovery restored.');}catch(e){console.error(e);await recoveryClear();}}

function snapshot(){state.undo.push({pages:deepClone(state.pages),page:state.page});if(state.undo.length>60)state.undo.shift();state.redo=[];}
function restoreSnap(s){state.pages=deepClone(s.pages);state.page=clamp(s.page,0,state.pages.length-1);state.selected=[];renderPage();refreshUI();scheduleRecovery();}
function undo(){if(!state.undo.length)return;state.redo.push({pages:deepClone(state.pages),page:state.page});restoreSnap(state.undo.pop());}
function redo(){if(!state.redo.length)return;state.undo.push({pages:deepClone(state.pages),page:state.page});restoreSnap(state.redo.pop());}

function openEditor(){els.emptyState.classList.add('hidden');els.scrollArea.classList.remove('hidden');refreshUI();}
function refreshUI(){const n=state.pages.length, p=active()?state.page+1:0;els.pageLabel.textContent=`Page ${p} / ${n}`;els.zoomLabel.textContent=`Zoom ${Math.round(state.zoom*100)}%`;els.zoomInput.value=Math.round(state.zoom*100);els.toolLabel.textContent=`Tool: ${state.tool[0].toUpperCase()+state.tool.slice(1)}`;const on=active();[els.saveBtn,els.addPageBtn,els.delPageBtn,els.imageBtn,els.zoomOutBtn,els.zoomInBtn,els.applyZoomBtn,els.fitBtn,els.clearPageBtn].forEach(b=>b.disabled=!on);els.prevBtn.disabled=!on||state.page<=0;els.nextBtn.disabled=!on||state.page>=n-1;els.undoBtn.disabled=!state.undo.length;els.redoBtn.disabled=!state.redo.length;els.deleteSelectedBtn.disabled=!state.selected.length;els.selectionStatus.textContent=state.selected.length?`${state.selected.length} selected`:'';document.querySelectorAll('.tool').forEach(b=>b.classList.toggle('active',b.dataset.tool===state.tool));}
function setTool(t){state.tool=t;state.pointer=null;state.currentStroke=null;els.overlayCanvas.style.cursor=t==='text'?'text':t==='pan'?'grab':t==='select'?'default':'crosshair';refreshUI();}

async function loadPdf(file){if(!file)return;if(!(file.type==='application/pdf'||/\.pdf$/i.test(file.name))){showToast('Choose a PDF file.');return;}try{setStatus(`Opening ${file.name}…`);const buf=await file.arrayBuffer();state.sourceBytes=new Uint8Array(buf);const pdfjs=await ensurePdfJs();state.sourcePdf=await pdfjs.getDocument({data:state.sourceBytes.slice()}).promise;state.pages=[];for(let i=1;i<=state.sourcePdf.numPages;i++){const p=await state.sourcePdf.getPage(i);const vp=p.getViewport({scale:1});state.pages.push({sourceIndex:i-1,width:vp.width,height:vp.height,annotations:[]});}state.page=0;state.undo=[];state.redo=[];state.selected=[];state.filename=file.name.replace(/\.pdf$/i,'')+'-edited.pdf';openEditor();await fitToWindow(true);scheduleRecovery(0);setStatus(`Imported ${file.name}. Recovery autosave is on.`);}catch(e){console.error('PDF open failed:',e);setStatus('Could not open that PDF.');showToast(e?.name==='PasswordException'?'This PDF is password protected.':(String(e?.message||'').includes('load')?'PDF engine could not load. Check your internet connection.':'Could not open that PDF.'));}}
function newPdf(sizeName){const sizes={'Letter - Portrait':[612,792],'Letter - Landscape':[792,612],'A4 - Portrait':[595,842],'A4 - Landscape':[842,595],'Square':[612,612]};const [w,h]=sizes[sizeName]||sizes['Letter - Portrait'];state.sourceBytes=null;state.sourcePdf=null;state.pages=[{sourceIndex:null,width:w,height:h,annotations:[]}];state.page=0;state.undo=[];state.redo=[];state.selected=[];state.filename='new_pdf.pdf';openEditor();fitToWindow(true);scheduleRecovery(0);setStatus('Created a new PDF. Recovery autosave is on.');}

async function renderPage(){
  if(!active())return;
  const tok=++state.renderToken;
  const p=page();
  const scale=state.zoom;
  const ratio=dpr();
  const cssW=Math.max(1,p.width*scale);
  const cssH=Math.max(1,p.height*scale);

  els.pageStage.style.width=`${cssW}px`;
  els.pageStage.style.height=`${cssH}px`;

  // Overlay uses CSS page coordinates, backed by a DPR-sized bitmap.
  els.overlayCanvas.style.width=`${cssW}px`;
  els.overlayCanvas.style.height=`${cssH}px`;
  els.overlayCanvas.width=Math.max(1,Math.round(cssW*ratio));
  els.overlayCanvas.height=Math.max(1,Math.round(cssH*ratio));

  try {
    if(p.sourceIndex!==null&&state.sourcePdf){
      const src=await state.sourcePdf.getPage(p.sourceIndex+1);
      if(tok!==state.renderToken)return;

      // Standard PDF.js HiDPI rendering: render directly at DPR resolution,
      // while CSS keeps the page at its logical on-screen size.
      const cssViewport=src.getViewport({scale});
      const renderViewport=src.getViewport({scale:scale*ratio});
      els.pdfCanvas.style.width=`${Math.max(1,cssViewport.width)}px`;
      els.pdfCanvas.style.height=`${Math.max(1,cssViewport.height)}px`;
      els.pdfCanvas.width=Math.max(1,Math.round(renderViewport.width));
      els.pdfCanvas.height=Math.max(1,Math.round(renderViewport.height));
      pdfCtx.setTransform(1,0,0,1,0,0);
      pdfCtx.clearRect(0,0,els.pdfCanvas.width,els.pdfCanvas.height);
      await src.render({canvasContext:pdfCtx,viewport:renderViewport}).promise;
    }else{
      els.pdfCanvas.style.width=`${cssW}px`;
      els.pdfCanvas.style.height=`${cssH}px`;
      els.pdfCanvas.width=Math.max(1,Math.round(cssW*ratio));
      els.pdfCanvas.height=Math.max(1,Math.round(cssH*ratio));
      pdfCtx.setTransform(ratio,0,0,ratio,0,0);
      pdfCtx.fillStyle='#fff';
      pdfCtx.fillRect(0,0,cssW,cssH);
      pdfCtx.setTransform(1,0,0,1,0,0);
    }
  }catch(err){
    console.error('PDF render failed:',err);
    setStatus('PDF render failed. Try re-importing the PDF.');
    showToast('Could not render this PDF.');
  }

  if(tok!==state.renderToken)return;
  drawOverlay();
  refreshUI();
}
function drawOverlay(){if(!active())return;const p=page(),scale=state.zoom,ratio=dpr();overlayCtx.setTransform(ratio,0,0,ratio,0,0);overlayCtx.clearRect(0,0,p.width*scale,p.height*scale);for(let i=0;i<p.annotations.length;i++)drawAnn(p.annotations[i],i,scale);drawSelection(scale);}
function drawAnn(a,i,s){overlayCtx.save();if(a.type==='stroke'||a.type==='highlight'){overlayCtx.globalAlpha=a.type==='highlight'?.35:1;overlayCtx.strokeStyle=a.color;overlayCtx.lineWidth=Math.max(1,a.width*s);overlayCtx.lineCap='round';overlayCtx.lineJoin='round';overlayCtx.beginPath();a.points.forEach((pt,k)=>k?overlayCtx.lineTo(pt.x*s,pt.y*s):overlayCtx.moveTo(pt.x*s,pt.y*s));overlayCtx.stroke();}else if(a.type==='text'){overlayCtx.translate(a.x*s,a.y*s);overlayCtx.rotate((a.rotation||0)*Math.PI/180);overlayCtx.fillStyle=a.color;overlayCtx.font=`${a.size*s}px Arial`;overlayCtx.textBaseline='top';a.text.split('\n').forEach((line,k)=>overlayCtx.fillText(line,0,k*a.size*1.2*s));}else if(a.type==='image'){const img=state.imageCache.get(a.dataUrl);if(img?.complete){overlayCtx.translate((a.x+a.w/2)*s,(a.y+a.h/2)*s);overlayCtx.rotate((a.rotation||0)*Math.PI/180);overlayCtx.drawImage(img,-a.w*s/2,-a.h*s/2,a.w*s,a.h*s);}else if(!img){const im=new Image();state.imageCache.set(a.dataUrl,im);im.onload=drawOverlay;im.src=a.dataUrl;}}overlayCtx.restore();}
function bbox(a){if(a.type==='stroke'||a.type==='highlight'){const xs=a.points.map(p=>p.x),ys=a.points.map(p=>p.y),pad=Math.max(5,a.width/2);return [Math.min(...xs)-pad,Math.min(...ys)-pad,Math.max(...xs)+pad,Math.max(...ys)+pad];}if(a.type==='text'){const lines=a.text.split('\n');const w=Math.max(28,...lines.map(x=>x.length*a.size*.58)),h=Math.max(a.size*1.25,lines.length*a.size*1.2);return[a.x,a.y,a.x+w,a.y+h];}if(a.type==='image')return[a.x,a.y,a.x+a.w,a.y+a.h];return null;}
function groupBox(indices=state.selected){const bs=indices.map(i=>bbox(page().annotations[i])).filter(Boolean);if(!bs.length)return null;return[Math.min(...bs.map(b=>b[0])),Math.min(...bs.map(b=>b[1])),Math.max(...bs.map(b=>b[2])),Math.max(...bs.map(b=>b[3]))];}
function drawSelection(s){const b=groupBox();if(!b)return;overlayCtx.save();overlayCtx.strokeStyle='#1683ff';overlayCtx.lineWidth=2;overlayCtx.setLineDash([5,4]);overlayCtx.strokeRect(b[0]*s,b[1]*s,(b[2]-b[0])*s,(b[3]-b[1])*s);overlayCtx.setLineDash([]);overlayCtx.fillStyle='#1683ff';overlayCtx.fillRect(b[2]*s-7,b[3]*s-7,14,14);const cx=(b[0]+b[2])/2*s,y=b[1]*s;overlayCtx.beginPath();overlayCtx.moveTo(cx,y);overlayCtx.lineTo(cx,y-28);overlayCtx.stroke();overlayCtx.fillStyle='#12a36d';overlayCtx.beginPath();overlayCtx.arc(cx,y-36,8,0,Math.PI*2);overlayCtx.fill();overlayCtx.restore();}
function point(evt){const r=els.overlayCanvas.getBoundingClientRect();return{x:clamp((evt.clientX-r.left)/state.zoom,0,page().width),y:clamp((evt.clientY-r.top)/state.zoom,0,page().height)};}
function hit(pt){const anns=page().annotations;for(let i=anns.length-1;i>=0;i--){const b=bbox(anns[i]);if(b&&pt.x>=b[0]&&pt.x<=b[2]&&pt.y>=b[1]&&pt.y<=b[3])return i;}return null;}
function nearResize(pt,b){const t=14/state.zoom;return Math.abs(pt.x-b[2])<t&&Math.abs(pt.y-b[3])<t;}
function nearRotate(pt,b){const t=16/state.zoom,cx=(b[0]+b[2])/2,cy=b[1]-36/state.zoom;return Math.hypot(pt.x-cx,pt.y-cy)<t;}
function translateAnn(a,dx,dy){if(a.type==='stroke'||a.type==='highlight')a.points=a.points.map(p=>({x:p.x+dx,y:p.y+dy}));else{a.x+=dx;a.y+=dy;}}
function scaleAnn(a,b,sx,sy){if(a.type==='stroke'||a.type==='highlight'){a.points=a.points.map(p=>({x:b[0]+(p.x-b[0])*sx,y:b[1]+(p.y-b[1])*sy}));a.width*=Math.max(.1,(sx+sy)/2);}else{a.x=b[0]+(a.x-b[0])*sx;a.y=b[1]+(a.y-b[1])*sy;if(a.type==='image'){a.w*=sx;a.h*=sy;}else if(a.type==='text')a.size*=sy;}}
function rotateAnn(a,cx,cy,deg){const rad=deg*Math.PI/180,rot=(x,y)=>({x:cx+(x-cx)*Math.cos(rad)-(y-cy)*Math.sin(rad),y:cy+(x-cx)*Math.sin(rad)+(y-cy)*Math.cos(rad)});if(a.type==='stroke'||a.type==='highlight')a.points=a.points.map(p=>rot(p.x,p.y));else{const p=rot(a.x,a.y);a.x=p.x;a.y=p.y;a.rotation=((a.rotation||0)+deg)%360;}}
function eraseAt(pt){const rad=(Number(els.eraserWidth.value)||20)/2;const anns=page().annotations;let changed=false;for(let i=anns.length-1;i>=0;i--){const b=bbox(anns[i]);if(!b)continue;const nx=clamp(pt.x,b[0],b[2]),ny=clamp(pt.y,b[1],b[3]);if(Math.hypot(pt.x-nx,pt.y-ny)<=rad){anns.splice(i,1);changed=true;}}if(changed){state.selected=[];drawOverlay();}}

const pointers=new Map();
els.overlayCanvas.addEventListener('pointerdown',(e)=>{if(!active())return;pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,type:e.pointerType});if(pointers.size===2){const arr=[...pointers.values()],dist=Math.hypot(arr[0].x-arr[1].x,arr[0].y-arr[1].y);state.pinch={dist,zoom:state.zoom};state.pointer=null;state.currentStroke=null;return;}if(pointers.size>1)return;const pt=point(e);if(state.tool==='text'){state.pendingTextPoint=pt;state.editingTextIndex=null;els.textDialogTitle.textContent='Add Text';els.textInput.value='';openDialog(els.textDialog);return;}if(state.tool==='pan'){state.pointer={mode:'pan',x:e.clientX,y:e.clientY,left:els.scrollArea.scrollLeft,top:els.scrollArea.scrollTop};els.overlayCanvas.style.cursor='grabbing';return;}if(state.tool==='pen'||state.tool==='highlight'){snapshot();const a={type:state.tool==='pen'?'stroke':'highlight',points:[pt],color:state.tool==='highlight'?'#ffff00':els.colorPicker.value,width:Number(state.tool==='pen'?els.penWidth.value:els.highlightWidth.value)||3};page().annotations.push(a);state.currentStroke=a;state.pointer={mode:'draw'};els.overlayCanvas.setPointerCapture?.(e.pointerId);drawOverlay();return;}if(state.tool==='erase'){snapshot();state.pointer={mode:'erase'};eraseAt(pt);return;}if(state.tool==='select'){const b=groupBox();if(b&&nearRotate(pt,b)){snapshot();state.pointer={mode:'rotate',start:pt,base:deepClone(page().annotations),box:b};return;}if(b&&nearResize(pt,b)){snapshot();state.pointer={mode:'resize',start:pt,base:deepClone(page().annotations),box:b};return;}const h=hit(pt);if(h!==null){if(!state.selected.includes(h))state.selected=[h];snapshot();state.pointer={mode:'move',start:pt,base:deepClone(page().annotations)};}else{state.selected=[];state.pointer={mode:'box',start:pt,rect:[pt.x,pt.y,pt.x,pt.y]};}drawOverlay();refreshUI();}});
els.overlayCanvas.addEventListener('pointermove',(e)=>{if(pointers.has(e.pointerId))pointers.set(e.pointerId,{x:e.clientX,y:e.clientY,type:e.pointerType});if(state.pinch&&pointers.size>=2){const arr=[...pointers.values()],dist=Math.hypot(arr[0].x-arr[1].x,arr[0].y-arr[1].y);state.zoom=clamp(state.pinch.zoom*(dist/state.pinch.dist),.1,4);scheduleRender();return;}if(!state.pointer)return;const pt=point(e);if(state.pointer.mode==='pan'){els.scrollArea.scrollLeft=state.pointer.left-(e.clientX-state.pointer.x);els.scrollArea.scrollTop=state.pointer.top-(e.clientY-state.pointer.y);return;}if(state.pointer.mode==='draw'&&state.currentStroke){state.currentStroke.points.push(pt);drawOverlay();return;}if(state.pointer.mode==='erase'){eraseAt(pt);return;}if(state.pointer.mode==='move'){const dx=pt.x-state.pointer.start.x,dy=pt.y-state.pointer.start.y;page().annotations=deepClone(state.pointer.base);state.selected.forEach(i=>translateAnn(page().annotations[i],dx,dy));drawOverlay();return;}if(state.pointer.mode==='resize'){const b=state.pointer.box,sx=Math.max(.05,(pt.x-b[0])/Math.max(1,b[2]-b[0])),sy=Math.max(.05,(pt.y-b[1])/Math.max(1,b[3]-b[1]));page().annotations=deepClone(state.pointer.base);state.selected.forEach(i=>scaleAnn(page().annotations[i],b,sx,sy));drawOverlay();return;}if(state.pointer.mode==='rotate'){const b=state.pointer.box,cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2,a0=Math.atan2(state.pointer.start.y-cy,state.pointer.start.x-cx),a1=Math.atan2(pt.y-cy,pt.x-cx),deg=(a1-a0)*180/Math.PI;page().annotations=deepClone(state.pointer.base);state.selected.forEach(i=>rotateAnn(page().annotations[i],cx,cy,deg));drawOverlay();return;}if(state.pointer.mode==='box'){state.pointer.rect=[Math.min(state.pointer.start.x,pt.x),Math.min(state.pointer.start.y,pt.y),Math.max(state.pointer.start.x,pt.x),Math.max(state.pointer.start.y,pt.y)];const r=state.pointer.rect;state.selected=page().annotations.map((a,i)=>({i,b:bbox(a)})).filter(o=>o.b&&!(o.b[2]<r[0]||o.b[0]>r[2]||o.b[3]<r[1]||o.b[1]>r[3])).map(o=>o.i);drawOverlay();}});
function pointerEnd(e){pointers.delete(e.pointerId);if(state.pinch){if(pointers.size<2){state.pinch=null;renderPage();scheduleRecovery();}return;}if(!state.pointer)return;const mode=state.pointer.mode;state.pointer=null;state.currentStroke=null;if(mode==='pan')els.overlayCanvas.style.cursor='grab';if(mode!=='box'&&mode!=='pan')scheduleRecovery();refreshUI();}
els.overlayCanvas.addEventListener('pointerup',pointerEnd);els.overlayCanvas.addEventListener('pointercancel',pointerEnd);els.overlayCanvas.addEventListener('lostpointercapture',pointerEnd);
let renderRAF=0;function scheduleRender(){if(renderRAF)return;renderRAF=requestAnimationFrame(async()=>{renderRAF=0;await renderPage();});}
els.overlayCanvas.addEventListener('dblclick',(e)=>{if(state.tool!=='select')return;const i=hit(point(e));if(i===null||page().annotations[i].type!=='text')return;state.editingTextIndex=i;els.textDialogTitle.textContent='Edit Text';els.textInput.value=page().annotations[i].text;openDialog(els.textDialog);});

els.textForm.addEventListener('submit',(e)=>{e.preventDefault();const text=els.textInput.value;if(text.trim()){snapshot();if(state.editingTextIndex!==null){const a=page().annotations[state.editingTextIndex];a.text=text;a.color=els.colorPicker.value;a.size=Number(els.textSize.value)||a.size;}else if(state.pendingTextPoint){page().annotations.push({type:'text',x:state.pendingTextPoint.x,y:state.pendingTextPoint.y,text,color:els.colorPicker.value,size:Number(els.textSize.value)||18,rotation:0});}}state.editingTextIndex=null;state.pendingTextPoint=null;closeDialog(els.textDialog);drawOverlay();refreshUI();scheduleRecovery();});
els.cancelTextBtn.addEventListener('click',()=>{state.editingTextIndex=null;state.pendingTextPoint=null;closeDialog(els.textDialog);});

els.imageInput.addEventListener('change',()=>{const f=els.imageInput.files?.[0];if(!f)return;const reader=new FileReader();reader.onload=()=>{const im=new Image();im.onload=()=>{snapshot();const maxW=page().width*.45,maxH=page().height*.35,ratio=Math.min(maxW/im.width,maxH/im.height,1),w=im.width*ratio,h=im.height*ratio;page().annotations.push({type:'image',dataUrl:reader.result,x:(page().width-w)/2,y:(page().height-h)/2,w,h,rotation:0});state.imageCache.set(reader.result,im);state.selected=[page().annotations.length-1];drawOverlay();refreshUI();scheduleRecovery();};im.src=reader.result;};reader.readAsDataURL(f);els.imageInput.value='';});

async function fitToWindow(initial=false){if(!active())return;await new Promise(r=>requestAnimationFrame(r));const p=page(),w=Math.max(120,els.scrollArea.clientWidth-36),h=Math.max(120,els.scrollArea.clientHeight-36);state.zoom=clamp(Math.min(w/p.width,h/p.height),.1,4);await renderPage();if(initial){els.scrollArea.scrollLeft=0;els.scrollArea.scrollTop=0;}refreshUI();}
function applyZoom(){state.zoom=clamp((Number(els.zoomInput.value)||100)/100,.1,4);renderPage();scheduleRecovery();}
function changeZoom(d){state.zoom=clamp(state.zoom+d,.1,4);renderPage();scheduleRecovery();}

function addPage(){if(!active())return;snapshot();const p=page();state.pages.splice(state.page+1,0,{sourceIndex:null,width:p.width,height:p.height,annotations:[]});state.page++;state.selected=[];fitToWindow();scheduleRecovery();}
function deletePage(){if(state.pages.length<=1){showToast('A PDF needs at least one page.');return;}if(!confirm('Delete current page?'))return;snapshot();state.pages.splice(state.page,1);state.page=Math.min(state.page,state.pages.length-1);state.selected=[];renderPage();scheduleRecovery();}
function nav(d){const n=state.page+d;if(n<0||n>=state.pages.length)return;state.page=n;state.selected=[];renderPage();refreshUI();}
function clearPage(){if(!page().annotations.length)return;if(!confirm('Delete all edits on this page?'))return;snapshot();page().annotations=[];state.selected=[];drawOverlay();refreshUI();scheduleRecovery();}
function deleteSelected(){if(!state.selected.length)return;snapshot();for(const i of [...state.selected].sort((a,b)=>b-a))page().annotations.splice(i,1);state.selected=[];drawOverlay();refreshUI();scheduleRecovery();}
function copySelected(){state.clipboard=state.selected.map(i=>deepClone(page().annotations[i]));}
function pasteSelected(){if(!state.clipboard.length)return;snapshot();const start=page().annotations.length;for(const a of deepClone(state.clipboard)){translateAnn(a,12,12);page().annotations.push(a);}state.selected=state.clipboard.map((_,i)=>start+i);drawOverlay();refreshUI();scheduleRecovery();}
function keyTransform(key){if(!state.selected.length)return;snapshot();const b=groupBox(),cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2;state.selected.forEach(i=>{const a=page().annotations[i];if(key==='r')rotateAnn(a,cx,cy,2.5);if(key==='1')scaleAnn(a,b,1.03,1);if(key==='3')scaleAnn(a,b,.97,1);if(key==='2')scaleAnn(a,b,1,1.03);if(key==='4')scaleAnn(a,b,1,.97);});drawOverlay();scheduleRecovery();}

async function exportPdf(){if(!active())return;els.saveBtn.disabled=true;els.saveBtn.textContent='Saving…';try{const pdfLib=await ensurePdfLib();const {PDFDocument,StandardFonts,rgb,degrees}=pdfLib;const out=await PDFDocument.create();const src=state.sourceBytes?await PDFDocument.load(state.sourceBytes.slice()):null;const font=await out.embedFont(StandardFonts.Helvetica);for(const p of state.pages){let op;if(p.sourceIndex!==null&&src){const [cp]=await out.copyPages(src,[p.sourceIndex]);op=out.addPage(cp);}else op=out.addPage([p.width,p.height]);for(const a of p.annotations){const col=hexColor(a.color||'#000000',rgb);if(a.type==='text'){a.text.split('\n').forEach((line,k)=>op.drawText(line||' ',{x:a.x,y:p.height-a.y-a.size-k*a.size*1.2,size:a.size,font,color:col,rotate:degrees(-(a.rotation||0))}));}else if((a.type==='stroke'||a.type==='highlight')&&a.points.length>1){for(let i=1;i<a.points.length;i++)op.drawLine({start:{x:a.points[i-1].x,y:p.height-a.points[i-1].y},end:{x:a.points[i].x,y:p.height-a.points[i].y},thickness:a.width,color:col,opacity:a.type==='highlight'?.35:1});}else if(a.type==='image'){try{const bytes=dataUrlBytes(a.dataUrl);const im=/png/i.test(a.dataUrl.slice(0,30))?await out.embedPng(bytes):await out.embedJpg(bytes);op.drawImage(im,{x:a.x,y:p.height-a.y-a.h,width:a.w,height:a.h,rotate:degrees(-(a.rotation||0))});}catch{}}}}
const bytes=await out.save();const blob=new Blob([bytes],{type:'application/pdf'});await saveBlob(blob,state.filename);await recoveryClear();setStatus('PDF exported. Recovery copy cleared.');showToast('PDF saved.');}catch(e){console.error(e);showToast('Save failed.');}finally{els.saveBtn.textContent='Save As';refreshUI();}}
function hexColor(h,rgb){h=(h||'#000000').replace('#','');const n=parseInt(h,16)||0;return rgb(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255);}
function dataUrlBytes(u){const b=atob(u.split(',')[1]),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a;}
async function saveBlob(blob,name){if(navigator.canShare&&navigator.share&&/iPad|iPhone|iPod/.test(navigator.userAgent)){try{const f=new File([blob],name,{type:'application/pdf'});if(navigator.canShare({files:[f]})){await navigator.share({files:[f],title:name});return;}}catch(e){if(e?.name==='AbortError')return;}}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}

els.importBtn.onclick=els.emptyImportBtn.onclick=()=>els.pdfInput.click();els.pdfInput.onchange=()=>{loadPdf(els.pdfInput.files?.[0]);els.pdfInput.value='';};els.newBtn.onclick=els.emptyNewBtn.onclick=()=>openDialog(els.newDialog);els.newForm.addEventListener('submit',(e)=>{e.preventDefault();newPdf(els.pageSizeSelect.value);closeDialog(els.newDialog);});els.saveBtn.onclick=exportPdf;els.addPageBtn.onclick=addPage;els.delPageBtn.onclick=deletePage;els.prevBtn.onclick=()=>nav(-1);els.nextBtn.onclick=()=>nav(1);els.imageBtn.onclick=()=>els.imageInput.click();els.undoBtn.onclick=undo;els.redoBtn.onclick=redo;els.deleteSelectedBtn.onclick=deleteSelected;els.clearPageBtn.onclick=clearPage;els.zoomOutBtn.onclick=()=>changeZoom(-.1);els.zoomInBtn.onclick=()=>changeZoom(.1);els.applyZoomBtn.onclick=applyZoom;els.fitBtn.onclick=()=>fitToWindow();els.zoomInput.addEventListener('keydown',e=>{if(e.key==='Enter')applyZoom();});document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));

window.addEventListener('keydown',(e)=>{if(isTypingTarget(e.target))return;const k=e.key.toLowerCase(),mod=e.ctrlKey||e.metaKey;if(mod&&k==='s'){e.preventDefault();exportPdf();return;}if(mod&&k==='z'){e.preventDefault();undo();return;}if(mod&&k==='y'){e.preventDefault();redo();return;}if(mod&&k==='c'){e.preventDefault();copySelected();return;}if(mod&&k==='v'){e.preventDefault();pasteSelected();return;}if(mod&&e.key==='0'){e.preventDefault();fitToWindow();return;}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteSelected();return;}if(e.key==='PageUp'){e.preventDefault();nav(-1);return;}if(e.key==='PageDown'){e.preventDefault();nav(1);return;}if(['s','p','e','h','t'].includes(k)&&!mod){setTool({s:'select',p:'pen',e:'erase',h:'highlight',t:'text'}[k]);return;}if(['r','1','2','3','4'].includes(k)&&state.selected.length)keyTransform(k);});

let resizeTimer;function handleResize(){clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(active())fitToWindow();},180);}window.addEventListener('resize',handleResize);window.visualViewport?.addEventListener('resize',handleResize);window.addEventListener('orientationchange',()=>setTimeout(handleResize,250));document.addEventListener('visibilitychange',()=>{if(document.hidden)scheduleRecovery(0);});window.addEventListener('pagehide',()=>{if(active())recoveryPut();});

(async()=>{try{await navigator.storage?.persist?.();}catch{}await restoreRecovery();refreshUI();})();
})();
