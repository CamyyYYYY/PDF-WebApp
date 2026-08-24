(() => {
'use strict';
const $ = id => document.getElementById(id);
const el = {
  newBtn:$('newBtn'), importBtn:$('importBtn'), saveBtn:$('saveBtn'), addPageBtn:$('addPageBtn'), delPageBtn:$('delPageBtn'), prevBtn:$('prevBtn'), nextBtn:$('nextBtn'), pageLabel:$('pageLabel'),
  imageBtn:$('imageBtn'), colorPicker:$('colorPicker'), undoBtn:$('undoBtn'), redoBtn:$('redoBtn'), deleteSelectedBtn:$('deleteSelectedBtn'), clearPageBtn:$('clearPageBtn'),
  penWidth:$('penWidth'), highlightWidth:$('highlightWidth'), eraserWidth:$('eraserWidth'), textSize:$('textSize'), zoomOutBtn:$('zoomOutBtn'), zoomInBtn:$('zoomInBtn'), zoomInput:$('zoomInput'), applyZoomBtn:$('applyZoomBtn'), fitBtn:$('fitBtn'), zoomLabel:$('zoomLabel'), toolLabel:$('toolLabel'),
  workspace:$('workspace'), emptyState:$('emptyState'), scrollArea:$('scrollArea'), pageStage:$('pageStage'), pdfCanvas:$('pdfCanvas'), overlayCanvas:$('overlayCanvas'), status:$('status'), selectionStatus:$('selectionStatus'),
  pdfInput:$('pdfInput'), imageInput:$('imageInput'), newDialog:$('newDialog'), newForm:$('newForm'), pageSizeSelect:$('pageSizeSelect'), createPdfBtn:$('createPdfBtn'), textDialog:$('textDialog'), textForm:$('textForm'), textInput:$('textInput'), cancelTextBtn:$('cancelTextBtn'), toast:$('toast'),
  emptyNewBtn:$('emptyNewBtn'), emptyImportBtn:$('emptyImportBtn'), toolsToggleBtn:$('toolsToggleBtn'), toolbarWrap:$('toolbarWrap')
};

const st = {
  sourceBytes:null, pdfDoc:null, filename:'edited.pdf', pages:[], pageIndex:0, scale:1, fitMode:true, tool:'select', selected:-1,
  drawing:false, pointerId:null, stroke:null, pendingText:null, drag:null, undo:[], redo:[], renderSeq:0, autosaveTimer:null, libraries:null
};
const pdfCtx = el.pdfCanvas.getContext('2d', {alpha:false});
const ovCtx = el.overlayCanvas.getContext('2d');

function msg(s){ el.status.textContent=s; }
function toast(s){ el.toast.textContent=s; el.toast.classList.remove('hidden'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.toast.classList.add('hidden'),2500); }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }
function num(input, fallback, a, b){ const v=Number(input.value); return Number.isFinite(v)?clamp(v,a,b):fallback; }
function current(){ return st.pages[st.pageIndex] || null; }
function canDialog(d){ return d && typeof d.showModal==='function'; }
function showDialog(d){ if(canDialog(d)) d.showModal(); else d.setAttribute('open',''); }
function closeDialog(d){ if(!d)return; if(typeof d.close==='function') d.close(); else d.removeAttribute('open'); }
function stripRuntime(obj){ return JSON.parse(JSON.stringify(obj,(k,v)=>k==='imageObj'?undefined:v)); }
function snapshot(){ return {pages:stripRuntime(st.pages), pageIndex:st.pageIndex}; }
function pushUndo(){ st.undo.push(snapshot()); if(st.undo.length>60) st.undo.shift(); st.redo=[]; updateUI(); }
function restoreSnap(s){ st.pages=s.pages; st.pageIndex=clamp(s.pageIndex,0,Math.max(0,st.pages.length-1)); st.selected=-1; hydrateImages().then(renderCurrent); scheduleRecovery(); }

function loadScript(url){ return new Promise((resolve,reject)=>{ const x=document.createElement('script'); x.src=url; x.onload=resolve; x.onerror=reject; document.head.appendChild(x); }); }
async function ensureLibraries(){
  if(window.pdfjsLib && window.PDFLib){ setupWorker(); return; }
  const tries=[
    ['https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js','https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js'],
    ['https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js','https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js']
  ];
  let last;
  for(const [a,b] of tries){
    try{ if(!window.pdfjsLib) await loadScript(a); if(!window.PDFLib) await loadScript(b); if(window.pdfjsLib&&window.PDFLib){setupWorker();return;} }catch(e){ last=e; }
  }
  throw last || new Error('PDF libraries failed to load');
}
function setupWorker(){
  if(!window.pdfjsLib) return;
  const cdn='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const jsd='https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  window.pdfjsLib.GlobalWorkerOptions.workerSrc=cdn;
  st.workerFallback=jsd;
}

async function openPdfFile(file){
  if(!file) return;
  try{
    msg('Loading PDF…'); await ensureLibraries();
    const ab=await file.arrayBuffer(); st.sourceBytes=new Uint8Array(ab); st.filename=file.name.replace(/\.pdf$/i,'')+'-edited.pdf';
    st.pdfDoc=await window.pdfjsLib.getDocument({data:st.sourceBytes.slice()}).promise;
    st.pages=[];
    for(let i=1;i<=st.pdfDoc.numPages;i++){ const p=await st.pdfDoc.getPage(i); const vp=p.getViewport({scale:1}); st.pages.push({kind:'pdf',sourcePage:i,width:vp.width,height:vp.height,annotations:[]}); }
    st.pageIndex=0; st.fitMode=true; st.selected=-1; st.undo=[]; st.redo=[];
    showEditor(); await fitAndRender(); scheduleRecovery(); toast('PDF loaded.');
  }catch(e){
    console.error(e); msg('Could not open PDF.'); toast('Could not open this PDF. Check the console or internet connection.');
  }finally{ el.pdfInput.value=''; }
}

function pageSize(name){
  const m={ 'Letter - Portrait':[612,792], 'Letter - Landscape':[792,612], 'A4 - Portrait':[595.28,841.89], 'A4 - Landscape':[841.89,595.28], 'Square':[612,612]}; return m[name]||m['Letter - Portrait'];
}
async function createNew(){
  const [w,h]=pageSize(el.pageSizeSelect.value); st.sourceBytes=null; st.pdfDoc=null; st.filename='new_pdf.pdf'; st.pages=[{kind:'blank',width:w,height:h,annotations:[]}]; st.pageIndex=0; st.fitMode=true; st.selected=-1; st.undo=[]; st.redo=[]; closeDialog(el.newDialog); showEditor(); await fitAndRender(); scheduleRecovery();
}
function showEditor(){ el.emptyState.classList.add('hidden'); el.scrollArea.classList.remove('hidden'); updateUI(); }

async function fitAndRender(){ if(!current())return; await new Promise(r=>requestAnimationFrame(r)); const p=current(); const pad=24; const w=Math.max(120,el.scrollArea.clientWidth-pad), h=Math.max(120,el.scrollArea.clientHeight-pad); st.scale=clamp(Math.min(w/p.width,h/p.height),0.05,4); st.fitMode=true; updateZoomUI(); return renderCurrent(); }
async function renderCurrent(){
  const p=current(); if(!p) return; const seq=++st.renderSeq; const cssW=Math.max(1,Math.round(p.width*st.scale)), cssH=Math.max(1,Math.round(p.height*st.scale)); const dpr=clamp(window.devicePixelRatio||1,1,3);
  for(const c of [el.pdfCanvas,el.overlayCanvas]){ c.style.width=cssW+'px'; c.style.height=cssH+'px'; c.width=Math.max(1,Math.round(cssW*dpr)); c.height=Math.max(1,Math.round(cssH*dpr)); }
  el.pageStage.style.width=cssW+'px'; el.pageStage.style.height=cssH+'px';
  pdfCtx.setTransform(1,0,0,1,0,0); pdfCtx.fillStyle='#fff'; pdfCtx.fillRect(0,0,el.pdfCanvas.width,el.pdfCanvas.height);
  try{
    if(p.kind==='pdf'){
      const pg=await st.pdfDoc.getPage(p.sourcePage); if(seq!==st.renderSeq)return; const viewport=pg.getViewport({scale:st.scale*dpr}); await pg.render({canvasContext:pdfCtx,viewport}).promise;
    }
  }catch(e){ console.error('PDF page render failed',e); msg('PDF page render failed.'); }
  drawOverlay(); updateUI();
}
function updateZoomUI(){ const z=Math.round(st.scale*100); el.zoomInput.value=z; el.zoomLabel.textContent='Zoom '+z+'%'; }

function drawOverlay(){
  const p=current(); if(!p)return; const dpr=clamp(window.devicePixelRatio||1,1,3); ovCtx.setTransform(dpr,0,0,dpr,0,0); ovCtx.clearRect(0,0,el.overlayCanvas.width/dpr,el.overlayCanvas.height/dpr);
  p.annotations.forEach((a,i)=>{
    ovCtx.save();
    if(a.type==='stroke'||a.type==='highlight'){
      ovCtx.strokeStyle=a.color; ovCtx.globalAlpha=a.type==='highlight'?0.35:1; ovCtx.lineWidth=a.width*st.scale; ovCtx.lineCap='round'; ovCtx.lineJoin='round'; ovCtx.beginPath(); a.points.forEach((q,j)=>{const x=q.x*st.scale,y=q.y*st.scale;j?ovCtx.lineTo(x,y):ovCtx.moveTo(x,y)}); ovCtx.stroke();
    } else if(a.type==='text'){
      ovCtx.fillStyle=a.color; ovCtx.font=`${a.size*st.scale}px Arial`; ovCtx.textBaseline='top'; a.text.split('\n').forEach((line,j)=>ovCtx.fillText(line,a.x*st.scale,(a.y+j*a.size*1.2)*st.scale));
    } else if(a.type==='image'&&a.imageObj){ ovCtx.drawImage(a.imageObj,a.x*st.scale,a.y*st.scale,a.w*st.scale,a.h*st.scale); }
    if(i===st.selected){ const b=bbox(a); if(b){ovCtx.globalAlpha=1;ovCtx.strokeStyle='#168cff';ovCtx.lineWidth=2;ovCtx.setLineDash([6,4]);ovCtx.strokeRect(b.x*st.scale,b.y*st.scale,b.w*st.scale,b.h*st.scale);} }
    ovCtx.restore();
  });
}
function canvasPoint(e){ const r=el.overlayCanvas.getBoundingClientRect(); return {x:clamp((e.clientX-r.left)/st.scale,0,current().width),y:clamp((e.clientY-r.top)/st.scale,0,current().height)}; }
function bbox(a){
  if(a.type==='text') return {x:a.x,y:a.y,w:Math.max(24,a.text.length*a.size*.55),h:a.size*1.35};
  if(a.type==='image') return {x:a.x,y:a.y,w:a.w,h:a.h};
  if((a.type==='stroke'||a.type==='highlight')&&a.points.length){const xs=a.points.map(q=>q.x),ys=a.points.map(q=>q.y),pad=a.width/2+4;return{x:Math.min(...xs)-pad,y:Math.min(...ys)-pad,w:Math.max(...xs)-Math.min(...xs)+2*pad,h:Math.max(...ys)-Math.min(...ys)+2*pad};}
  return null;
}
function hit(pt){ const a=current().annotations; for(let i=a.length-1;i>=0;i--){const b=bbox(a[i]); if(b&&pt.x>=b.x&&pt.x<=b.x+b.w&&pt.y>=b.y&&pt.y<=b.y+b.h)return i;} return -1; }
function setTool(t){ st.tool=t; st.selected=-1; document.querySelectorAll('[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===t)); el.toolLabel.textContent='Tool: '+t[0].toUpperCase()+t.slice(1); el.overlayCanvas.style.cursor=t==='text'?'text':t==='pan'?'grab':t==='select'?'default':'crosshair'; drawOverlay(); updateUI(); }
function moveAnn(a,dx,dy){ if(a.type==='stroke'||a.type==='highlight')a.points=a.points.map(q=>({x:q.x+dx,y:q.y+dy})); else {a.x+=dx;a.y+=dy;} }

el.overlayCanvas.addEventListener('pointerdown',e=>{
  if(!current())return; const pt=canvasPoint(e);
  if(st.tool==='pan'){ st.drag={kind:'pan',x:e.clientX,y:e.clientY,sl:el.scrollArea.scrollLeft,st:el.scrollArea.scrollTop}; el.overlayCanvas.setPointerCapture(e.pointerId); return; }
  if(st.tool==='text'){ st.pendingText=pt; el.textInput.value=''; showDialog(el.textDialog); return; }
  if(st.tool==='select'){ const i=hit(pt); st.selected=i; if(i>=0){pushUndo();st.drag={kind:'move',pt,orig:stripRuntime(current().annotations[i])};el.overlayCanvas.setPointerCapture(e.pointerId);} drawOverlay();updateUI();return; }
  if(st.tool==='erase'){ const i=hit(pt); if(i>=0){pushUndo();current().annotations.splice(i,1);st.selected=-1;drawOverlay();scheduleRecovery();updateUI();} return; }
  if(st.tool==='pen'||st.tool==='highlight'){
    pushUndo(); st.drawing=true; st.pointerId=e.pointerId; el.overlayCanvas.setPointerCapture(e.pointerId); const a={type:st.tool==='pen'?'stroke':'highlight',points:[pt],color:st.tool==='highlight'?'#ffff00':el.colorPicker.value,width:st.tool==='pen'?num(el.penWidth,3,1,80):num(el.highlightWidth,16,1,80)}; current().annotations.push(a); st.stroke=a; drawOverlay();
  }
});
el.overlayCanvas.addEventListener('pointermove',e=>{
  if(st.drag?.kind==='pan'){el.scrollArea.scrollLeft=st.drag.sl-(e.clientX-st.drag.x);el.scrollArea.scrollTop=st.drag.st-(e.clientY-st.drag.y);return;}
  if(st.drag?.kind==='move'&&st.selected>=0){const pt=canvasPoint(e),dx=pt.x-st.drag.pt.x,dy=pt.y-st.drag.pt.y,a=stripRuntime(st.drag.orig);moveAnn(a,dx,dy); if(a.type==='image'){a.dataUrl=st.drag.orig.dataUrl;a.imageObj=current().annotations[st.selected].imageObj;} current().annotations[st.selected]=a; drawOverlay();return;}
  if(st.drawing&&st.stroke){st.stroke.points.push(canvasPoint(e));drawOverlay();}
});
function pointerEnd(){ if(st.drawing){st.drawing=false;st.stroke=null;scheduleRecovery();} if(st.drag){st.drag=null;scheduleRecovery();} updateUI(); }
el.overlayCanvas.addEventListener('pointerup',pointerEnd); el.overlayCanvas.addEventListener('pointercancel',pointerEnd);

el.textForm.addEventListener('submit',e=>{e.preventDefault();const text=el.textInput.value;if(text&&st.pendingText){pushUndo();current().annotations.push({type:'text',text,x:st.pendingText.x,y:st.pendingText.y,size:num(el.textSize,18,6,144),color:el.colorPicker.value});st.pendingText=null;closeDialog(el.textDialog);drawOverlay();scheduleRecovery();updateUI();}});
el.cancelTextBtn.addEventListener('click',()=>{st.pendingText=null;closeDialog(el.textDialog)});

async function importImage(file){ if(!file||!current())return; const dataUrl=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)}); const img=new Image(); await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=dataUrl}); pushUndo(); const p=current(),w=Math.min(p.width*.35,img.naturalWidth),h=w*(img.naturalHeight/img.naturalWidth); current().annotations.push({type:'image',dataUrl,imageObj:img,x:p.width*.15,y:p.height*.15,w,h}); st.selected=current().annotations.length-1; drawOverlay();scheduleRecovery();updateUI(); el.imageInput.value=''; }
async function hydrateImages(){ const jobs=[]; for(const p of st.pages)for(const a of p.annotations||[])if(a.type==='image'&&a.dataUrl&&!a.imageObj){const img=new Image();a.imageObj=img;jobs.push(new Promise(r=>{img.onload=r;img.onerror=r;img.src=a.dataUrl}))} await Promise.all(jobs); }

function updateUI(){
  const has=st.pages.length>0,p=current(); [el.saveBtn,el.addPageBtn,el.delPageBtn,el.imageBtn,el.zoomOutBtn,el.zoomInBtn,el.applyZoomBtn,el.fitBtn,el.clearPageBtn].forEach(b=>b.disabled=!has); el.prevBtn.disabled=!has||st.pageIndex<=0; el.nextBtn.disabled=!has||st.pageIndex>=st.pages.length-1; el.delPageBtn.disabled=!has||st.pages.length<=1; el.pageLabel.textContent=has?`Page ${st.pageIndex+1} / ${st.pages.length}`:'Page 0 / 0'; el.undoBtn.disabled=!st.undo.length; el.redoBtn.disabled=!st.redo.length; el.deleteSelectedBtn.disabled=st.selected<0; el.selectionStatus.textContent=st.selected>=0?'Selected edit':''; if(has){updateZoomUI();msg(`${p.annotations.length} editable edit(s). Recovery autosave is ON.`)}
}

el.newBtn.addEventListener('click',()=>showDialog(el.newDialog)); el.emptyNewBtn.addEventListener('click',()=>showDialog(el.newDialog));
el.newForm.addEventListener('submit',e=>{e.preventDefault();createNew()});
el.importBtn.addEventListener('click',()=>el.pdfInput.click()); el.emptyImportBtn.addEventListener('click',()=>el.pdfInput.click()); el.pdfInput.addEventListener('change',()=>openPdfFile(el.pdfInput.files[0]));
el.imageBtn.addEventListener('click',()=>el.imageInput.click()); el.imageInput.addEventListener('change',()=>importImage(el.imageInput.files[0]));
document.querySelectorAll('[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));
el.prevBtn.addEventListener('click',async()=>{if(st.pageIndex>0){st.pageIndex--;st.selected=-1;st.fitMode=true;await fitAndRender();scheduleRecovery()}}); el.nextBtn.addEventListener('click',async()=>{if(st.pageIndex<st.pages.length-1){st.pageIndex++;st.selected=-1;st.fitMode=true;await fitAndRender();scheduleRecovery()}});
el.addPageBtn.addEventListener('click',async()=>{const p=current();pushUndo();st.pages.splice(st.pageIndex+1,0,{kind:'blank',width:p.width,height:p.height,annotations:[]});st.pageIndex++;st.fitMode=true;await fitAndRender();scheduleRecovery()});
el.delPageBtn.addEventListener('click',async()=>{if(st.pages.length<=1)return;if(!confirm('Delete current page?'))return;pushUndo();st.pages.splice(st.pageIndex,1);st.pageIndex=Math.min(st.pageIndex,st.pages.length-1);st.selected=-1;st.fitMode=true;await fitAndRender();scheduleRecovery()});
el.clearPageBtn.addEventListener('click',()=>{if(!current().annotations.length)return;if(!confirm('Delete all edits on this page?'))return;pushUndo();current().annotations=[];st.selected=-1;drawOverlay();scheduleRecovery();updateUI()});
el.deleteSelectedBtn.addEventListener('click',()=>{if(st.selected<0)return;pushUndo();current().annotations.splice(st.selected,1);st.selected=-1;drawOverlay();scheduleRecovery();updateUI()});
el.undoBtn.addEventListener('click',()=>{if(!st.undo.length)return;st.redo.push(snapshot());restoreSnap(st.undo.pop())}); el.redoBtn.addEventListener('click',()=>{if(!st.redo.length)return;st.undo.push(snapshot());restoreSnap(st.redo.pop())});
el.zoomInBtn.addEventListener('click',()=>{st.fitMode=false;st.scale=clamp(st.scale*1.15,.05,4);renderCurrent()}); el.zoomOutBtn.addEventListener('click',()=>{st.fitMode=false;st.scale=clamp(st.scale/1.15,.05,4);renderCurrent()});
el.applyZoomBtn.addEventListener('click',()=>{st.fitMode=false;st.scale=clamp(num(el.zoomInput,100,10,400)/100,.1,4);renderCurrent()}); el.fitBtn.addEventListener('click',fitAndRender);
el.toolsToggleBtn.addEventListener('click',()=>{const o=el.toolbarWrap.classList.toggle('open');el.toolsToggleBtn.setAttribute('aria-expanded',String(o));});

async function buildOutput(){
  await ensureLibraries(); const {PDFDocument,rgb}=window.PDFLib; const out=await PDFDocument.create(); let src=null; if(st.sourceBytes)src=await PDFDocument.load(st.sourceBytes,{ignoreEncryption:true});
  for(const p of st.pages){ let pg; if(p.kind==='pdf'&&src){const [copy]=await out.copyPages(src,[p.sourcePage-1]);pg=out.addPage(copy)}else pg=out.addPage([p.width,p.height]);
    for(const a of p.annotations){
      if(a.type==='stroke'||a.type==='highlight'){const c=hexRgb(a.color),op=a.type==='highlight'?.35:1;for(let i=1;i<a.points.length;i++){const q0=a.points[i-1],q1=a.points[i];pg.drawLine({start:{x:q0.x,y:p.height-q0.y},end:{x:q1.x,y:p.height-q1.y},thickness:a.width,color:rgb(c.r,c.g,c.b),opacity:op})}}
      else if(a.type==='text'){const c=hexRgb(a.color);pg.drawText(a.text,{x:a.x,y:p.height-a.y-a.size,size:a.size,color:rgb(c.r,c.g,c.b),lineHeight:a.size*1.2})}
      else if(a.type==='image'&&a.dataUrl){try{const bytes=dataUrlBytes(a.dataUrl),im=a.dataUrl.startsWith('data:image/png')?await out.embedPng(bytes):await out.embedJpg(bytes);pg.drawImage(im,{x:a.x,y:p.height-a.y-a.h,width:a.w,height:a.h})}catch(e){console.warn('image export',e)}}
    }
  }
  return out.save();
}
function hexRgb(h){h=(h||'#000000').replace('#','');const n=parseInt(h,16);return{r:((n>>16)&255)/255,g:((n>>8)&255)/255,b:(n&255)/255}}
function dataUrlBytes(u){const b=atob(u.split(',')[1]),a=new Uint8Array(b.length);for(let i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a}
el.saveBtn.addEventListener('click',async()=>{try{msg('Building PDF…');const bytes=await buildOutput();const blob=new Blob([bytes],{type:'application/pdf'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=st.filename||'edited.pdf';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);await clearRecovery();msg('PDF saved.');toast('PDF exported. Recovery cleared.')}catch(e){console.error(e);msg('Save failed.');toast('Could not export PDF.')}});

// Recovery: one revolving draft only. Fresh DB schema avoids old inline-key conflict.
const DB='SimplePDFEditorRecoveryV3', STORE='drafts', KEY='current';
function dbOpen(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE)};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function saveRecovery(){ if(!st.pages.length)return; try{const d=await dbOpen();const rec={savedAt:Date.now(),filename:st.filename,sourceBytes:st.sourceBytes?st.sourceBytes.buffer.slice(0):null,pages:stripRuntime(st.pages),pageIndex:st.pageIndex}; await new Promise((res,rej)=>{const tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).put(rec,KEY);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});d.close()}catch(e){console.warn('Recovery save failed',e)} }
function scheduleRecovery(){clearTimeout(st.autosaveTimer);st.autosaveTimer=setTimeout(saveRecovery,600)}
async function clearRecovery(){try{const d=await dbOpen();await new Promise((res,rej)=>{const tx=d.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(KEY);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});d.close()}catch{}}
async function maybeRestore(){
  try{const d=await dbOpen();const rec=await new Promise((res,rej)=>{const r=d.transaction(STORE).objectStore(STORE).get(KEY);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});d.close(); if(!rec)return; if(Date.now()-rec.savedAt>30*86400000){await clearRecovery();return;} if(!confirm(`Recover unsaved PDF?\n\n${rec.filename||'Unsaved document'}`)) {await clearRecovery();return;}
    await ensureLibraries();st.filename=rec.filename||'edited.pdf';st.sourceBytes=rec.sourceBytes?new Uint8Array(rec.sourceBytes):null;st.pages=rec.pages||[];st.pageIndex=clamp(rec.pageIndex||0,0,Math.max(0,st.pages.length-1)); if(st.sourceBytes)st.pdfDoc=await window.pdfjsLib.getDocument({data:st.sourceBytes.slice()}).promise;await hydrateImages();showEditor();await fitAndRender();toast('Recovery restored.');
  }catch(e){console.warn('Recovery restore failed',e)}
}

let resizeTimer; window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(st.pages.length&&st.fitMode)fitAndRender()},180)}); window.addEventListener('orientationchange',()=>setTimeout(()=>{if(st.pages.length)fitAndRender()},300));
window.addEventListener('keydown',e=>{if(e.target.matches('input,textarea,select'))return;const k=e.key.toLowerCase(),m=e.ctrlKey||e.metaKey;if(m&&k==='s'){e.preventDefault();el.saveBtn.click()}else if(m&&k==='z'){e.preventDefault();el.undoBtn.click()}else if(m&&k==='y'){e.preventDefault();el.redoBtn.click()}else if(k==='delete'){el.deleteSelectedBtn.click()}else if(['s','p','e','h','t'].includes(k)){setTool({s:'select',p:'pen',e:'erase',h:'highlight',t:'text'}[k])}});

setTool('select'); updateUI(); maybeRestore();
})();
