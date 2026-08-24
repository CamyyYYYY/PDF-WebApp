(() => {
'use strict';
const $ = id => document.getElementById(id);
const els = {
  newBtn:$('newBtn'), importBtn:$('importBtn'), saveBtn:$('saveBtn'), addPageBtn:$('addPageBtn'), delPageBtn:$('delPageBtn'),
  prevBtn:$('prevBtn'), nextBtn:$('nextBtn'), pageLabel:$('pageLabel'), imageBtn:$('imageBtn'), colorPicker:$('colorPicker'),
  undoBtn:$('undoBtn'), redoBtn:$('redoBtn'), deleteSelectedBtn:$('deleteSelectedBtn'), clearPageBtn:$('clearPageBtn'),
  penWidth:$('penWidth'), highlightWidth:$('highlightWidth'), eraserWidth:$('eraserWidth'), textSize:$('textSize'),
  zoomOutBtn:$('zoomOutBtn'), zoomInBtn:$('zoomInBtn'), zoomInput:$('zoomInput'), applyZoomBtn:$('applyZoomBtn'), fitBtn:$('fitBtn'),
  zoomLabel:$('zoomLabel'), toolLabel:$('toolLabel'), workspace:$('workspace'), emptyState:$('emptyState'), scrollArea:$('scrollArea'),
  pageStage:$('pageStage'), pdfCanvas:$('pdfCanvas'), overlayCanvas:$('overlayCanvas'), status:$('status'), selectionStatus:$('selectionStatus'),
  pdfInput:$('pdfInput'), imageInput:$('imageInput'), newDialog:$('newDialog'), newForm:$('newForm'), pageSizeSelect:$('pageSizeSelect'),
  emptyNewBtn:$('emptyNewBtn'), emptyImportBtn:$('emptyImportBtn'), textDialog:$('textDialog'), textForm:$('textForm'), textInput:$('textInput'),
  cancelTextBtn:$('cancelTextBtn'), toast:$('toast')
};
for (const [k,v] of Object.entries(els)) if (!v) console.warn('Missing UI element:', k);

const state = {
  filename:'edited.pdf', sourceBytes:null, pdf:null, pages:[], pageIndex:0, zoom:1, fitMode:true, tool:'select',
  undo:[], redo:[], selected:-1, drag:null, currentStroke:null, pendingText:null, renderSeq:0, libraries:null,
  autosaveTimer:null, imageCache:new Map()
};
const pageSizes = {
  'Letter - Portrait':[612,792], 'Letter - Landscape':[792,612], 'A4 - Portrait':[595.28,841.89],
  'A4 - Landscape':[841.89,595.28], 'Square':[612,612]
};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const currentPage=()=>state.pages[state.pageIndex] || null;
const hasDoc=()=>state.pages.length>0;
function showToast(msg){ if(!els.toast)return; els.toast.textContent=msg; els.toast.classList.remove('hidden'); clearTimeout(showToast.t); showToast.t=setTimeout(()=>els.toast.classList.add('hidden'),2500); }
function setStatus(msg){ els.status.textContent=msg; }
function openDialog(d){ if(!d)return; if(typeof d.showModal==='function'){try{d.showModal();return}catch{}} d.setAttribute('open',''); }
function closeDialog(d){ if(!d)return; if(typeof d.close==='function'){try{d.close();return}catch{}} d.removeAttribute('open'); }
async function loadScript(url){ return new Promise((res,rej)=>{const s=document.createElement('script');s.src=url;s.onload=res;s.onerror=()=>rej(new Error('Failed '+url));document.head.appendChild(s);}); }
async function ensureLibraries(){
  if(state.libraries) return state.libraries;
  if(!window.pdfjsLib){
    try{await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js')}catch{await loadScript('https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js')}
  }
  if(!window.PDFLib){
    try{await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js')}catch{await loadScript('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js')}
  }
  if(!window.pdfjsLib || !window.PDFLib) throw new Error('PDF libraries could not load.');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  state.libraries={pdfjsLib:window.pdfjsLib,PDFLib:window.PDFLib};
  return state.libraries;
}
function snapshot(){ return JSON.stringify(state.pages.map(p=>({...p,annotations:p.annotations.map(a=>({...a, imageData:a.imageData||null}))}))); }
function saveUndo(){ state.undo.push(snapshot()); if(state.undo.length>50)state.undo.shift(); state.redo=[]; updateUI(); }
function restoreSnapshot(s){ state.pages=JSON.parse(s); state.pageIndex=clamp(state.pageIndex,0,state.pages.length-1); state.selected=-1; renderPage(); scheduleRecovery(); }
function undo(){ if(!state.undo.length)return; state.redo.push(snapshot()); restoreSnapshot(state.undo.pop()); }
function redo(){ if(!state.redo.length)return; state.undo.push(snapshot()); restoreSnapshot(state.redo.pop()); }

function makePage({sourceIndex=null,width=612,height=792}={}){return {sourceIndex,width,height,annotations:[]};}
async function createNew(){
  const size=pageSizes[els.pageSizeSelect.value]||pageSizes['Letter - Portrait'];
  state.sourceBytes=null; state.pdf=null; state.pages=[makePage({width:size[0],height:size[1]})]; state.pageIndex=0; state.filename='new_pdf.pdf';
  state.zoom=1;state.fitMode=true;state.undo=[];state.redo=[];state.selected=-1; closeDialog(els.newDialog); enterEditor(); await renderPage(); scheduleRecovery();
}
async function importPdf(file){
  if(!file)return;
  try{
    setStatus('Opening PDF…'); const {pdfjsLib}=await ensureLibraries(); const bytes=new Uint8Array(await file.arrayBuffer());
    const pdf=await pdfjsLib.getDocument({data:bytes.slice()}).promise; const pages=[];
    for(let i=1;i<=pdf.numPages;i++){const p=await pdf.getPage(i);const v=p.getViewport({scale:1});pages.push(makePage({sourceIndex:i-1,width:v.width,height:v.height}));}
    state.sourceBytes=bytes;state.pdf=pdf;state.pages=pages;state.pageIndex=0;state.filename=file.name.replace(/\.pdf$/i,'')+'-edited.pdf';
    state.zoom=1;state.fitMode=true;state.undo=[];state.redo=[];state.selected=-1; enterEditor(); await renderPage(); scheduleRecovery(); showToast('PDF opened.');
  }catch(e){console.error(e);setStatus('Could not open PDF.');showToast('Could not open that PDF. Check your connection and file.');}
}
function enterEditor(){els.emptyState.classList.add('hidden');els.scrollArea.classList.remove('hidden');updateUI();}
function naturalViewport(page){ return {width:page.width,height:page.height}; }
function computeFitScale(page){
  const pad=window.innerWidth<=700?16:48; const availW=Math.max(80,els.scrollArea.clientWidth-pad); const availH=Math.max(80,els.scrollArea.clientHeight-pad);
  return clamp(Math.min(availW/page.width,availH/page.height),0.1,3);
}
async function renderPage(){
  if(!hasDoc())return; const seq=++state.renderSeq; const page=currentPage(); if(state.fitMode)state.zoom=computeFitScale(page);
  const scale=state.zoom; const cssW=Math.max(1,Math.round(page.width*scale)); const cssH=Math.max(1,Math.round(page.height*scale)); const dpr=Math.min(window.devicePixelRatio||1,2.5);
  for(const c of [els.pdfCanvas,els.overlayCanvas]){c.width=Math.max(1,Math.round(cssW*dpr));c.height=Math.max(1,Math.round(cssH*dpr));c.style.width=cssW+'px';c.style.height=cssH+'px';}
  els.pageStage.style.width=cssW+'px';els.pageStage.style.height=cssH+'px';
  const ctx=els.pdfCanvas.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,els.pdfCanvas.width,els.pdfCanvas.height);ctx.fillStyle='#fff';ctx.fillRect(0,0,els.pdfCanvas.width,els.pdfCanvas.height);
  if(page.sourceIndex!==null && state.pdf){
    try{const pdfPage=await state.pdf.getPage(page.sourceIndex+1); if(seq!==state.renderSeq)return; const viewport=pdfPage.getViewport({scale:scale*dpr}); await pdfPage.render({canvasContext:ctx,viewport}).promise;}catch(e){console.error(e);showToast('Page render failed.');}
  }
  drawOverlay();updateUI();
}
function overlayCtx(){const c=els.overlayCanvas,ctx=c.getContext('2d'),dpr=Math.min(window.devicePixelRatio||1,2.5);ctx.setTransform(dpr,0,0,dpr,0,0);return {ctx,dpr};}
function drawOverlay(){
  const page=currentPage(); if(!page)return; const {ctx}=overlayCtx(); const w=parseFloat(els.overlayCanvas.style.width)||1,h=parseFloat(els.overlayCanvas.style.height)||1;ctx.clearRect(0,0,w,h);
  const s=state.zoom;
  page.annotations.forEach((a,i)=>{
    ctx.save();
    if(a.type==='stroke'||a.type==='highlight'){ctx.globalAlpha=a.type==='highlight'?.35:1;ctx.strokeStyle=a.color;ctx.lineWidth=a.width*s;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();a.points.forEach((p,j)=>j?ctx.lineTo(p.x*s,p.y*s):ctx.moveTo(p.x*s,p.y*s));ctx.stroke();}
    else if(a.type==='text'){ctx.fillStyle=a.color;ctx.font=`${a.size*s}px Arial`;ctx.textBaseline='top';a.text.split('\n').forEach((line,j)=>ctx.fillText(line,a.x*s,(a.y+j*a.size*1.2)*s));}
    else if(a.type==='image'&&a.imageData){let img=state.imageCache.get(a.imageData);if(!img){img=new Image();img.src=a.imageData;img.onload=drawOverlay;state.imageCache.set(a.imageData,img);}if(img.complete)ctx.drawImage(img,a.x*s,a.y*s,a.w*s,a.h*s);}
    if(i===state.selected){const b=bbox(a);if(b){ctx.strokeStyle='#1683ff';ctx.lineWidth=2;ctx.setLineDash([5,4]);ctx.strokeRect(b.x*s,b.y*s,b.w*s,b.h*s);ctx.setLineDash([]);}}
    ctx.restore();
  });
}
function bbox(a){
  if(a.type==='text')return{x:a.x,y:a.y,w:Math.max(30,a.text.length*a.size*.55),h:a.size*1.4*Math.max(1,a.text.split('\n').length)};
  if(a.type==='image')return{x:a.x,y:a.y,w:a.w,h:a.h};
  if(a.points?.length){const xs=a.points.map(p=>p.x),ys=a.points.map(p=>p.y),pad=(a.width||3);return{x:Math.min(...xs)-pad,y:Math.min(...ys)-pad,w:Math.max(...xs)-Math.min(...xs)+pad*2,h:Math.max(...ys)-Math.min(...ys)+pad*2};}
  return null;
}
function eventPoint(e){const r=els.overlayCanvas.getBoundingClientRect();return{x:clamp((e.clientX-r.left)/state.zoom,0,currentPage().width),y:clamp((e.clientY-r.top)/state.zoom,0,currentPage().height)};}
function hitTest(p){const as=currentPage().annotations;for(let i=as.length-1;i>=0;i--){const b=bbox(as[i]);if(b&&p.x>=b.x&&p.x<=b.x+b.w&&p.y>=b.y&&p.y<=b.y+b.h)return i;}return-1;}
function setTool(t){state.tool=t;document.querySelectorAll('.tool[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));els.toolLabel.textContent='Tool: '+t[0].toUpperCase()+t.slice(1);els.overlayCanvas.style.touchAction=t==='pan'?'pan-x pan-y':'none';}

els.overlayCanvas.addEventListener('pointerdown',e=>{
  if(!hasDoc()||e.button>0)return;const p=eventPoint(e);
  if(state.tool==='pan')return;
  if(state.tool==='text'){state.pendingText=p;els.textInput.value='';openDialog(els.textDialog);setTimeout(()=>els.textInput.focus(),50);return;}
  if(state.tool==='select'){const i=hitTest(p);state.selected=i;if(i>=0){saveUndo();state.drag={start:p,orig:JSON.parse(JSON.stringify(currentPage().annotations[i]))};els.overlayCanvas.setPointerCapture?.(e.pointerId);}drawOverlay();updateUI();return;}
  if(state.tool==='erase'){const i=hitTest(p);if(i>=0){saveUndo();currentPage().annotations.splice(i,1);state.selected=-1;drawOverlay();scheduleRecovery();}return;}
  if(state.tool==='pen'||state.tool==='highlight'){saveUndo();const ann={type:state.tool==='pen'?'stroke':'highlight',points:[p],color:state.tool==='highlight'?'#ffff00':els.colorPicker.value,width:Number(state.tool==='pen'?els.penWidth.value:els.highlightWidth.value)||3};currentPage().annotations.push(ann);state.currentStroke=ann;els.overlayCanvas.setPointerCapture?.(e.pointerId);drawOverlay();}
});
els.overlayCanvas.addEventListener('pointermove',e=>{
  const p=eventPoint(e);
  if(state.currentStroke){state.currentStroke.points.push(p);drawOverlay();return;}
  if(state.drag&&state.selected>=0){const dx=p.x-state.drag.start.x,dy=p.y-state.drag.start.y;let a=JSON.parse(JSON.stringify(state.drag.orig));if(a.points)a.points=a.points.map(q=>({x:q.x+dx,y:q.y+dy}));else{a.x+=dx;a.y+=dy;}currentPage().annotations[state.selected]=a;drawOverlay();}
});
function endPointer(){if(state.currentStroke||state.drag)scheduleRecovery();state.currentStroke=null;state.drag=null;updateUI();}
els.overlayCanvas.addEventListener('pointerup',endPointer);els.overlayCanvas.addEventListener('pointercancel',endPointer);
els.overlayCanvas.addEventListener('dblclick',e=>{if(state.tool!=='select')return;const i=hitTest(eventPoint(e)),a=currentPage()?.annotations[i];if(a?.type==='text'){state.selected=i;state.pendingText={editIndex:i};els.textInput.value=a.text;openDialog(els.textDialog);}});

els.textForm.addEventListener('submit',e=>{e.preventDefault();const text=els.textInput.value;if(!text.trim()){closeDialog(els.textDialog);return;}saveUndo();if(state.pendingText?.editIndex!==undefined){currentPage().annotations[state.pendingText.editIndex].text=text;}else{currentPage().annotations.push({type:'text',x:state.pendingText.x,y:state.pendingText.y,text,color:els.colorPicker.value,size:Number(els.textSize.value)||18});}state.pendingText=null;closeDialog(els.textDialog);drawOverlay();scheduleRecovery();});
els.cancelTextBtn.addEventListener('click',()=>{state.pendingText=null;closeDialog(els.textDialog)});

async function addBlankPage(){if(!hasDoc())return;saveUndo();const p=currentPage();state.pages.splice(state.pageIndex+1,0,makePage({width:p.width,height:p.height}));state.pageIndex++;state.fitMode=true;await renderPage();scheduleRecovery();}
async function deletePage(){if(state.pages.length<=1){showToast('A PDF needs at least one page.');return;}if(!confirm('Delete current page?'))return;saveUndo();state.pages.splice(state.pageIndex,1);state.pageIndex=Math.min(state.pageIndex,state.pages.length-1);state.fitMode=true;await renderPage();scheduleRecovery();}
async function nav(delta){const n=state.pageIndex+delta;if(n<0||n>=state.pages.length)return;state.pageIndex=n;state.selected=-1;state.fitMode=true;await renderPage();}
function clearPage(){if(!currentPage()?.annotations.length)return;if(!confirm('Delete all edits on this page?'))return;saveUndo();currentPage().annotations=[];state.selected=-1;drawOverlay();scheduleRecovery();updateUI();}
function deleteSelected(){if(state.selected<0)return;saveUndo();currentPage().annotations.splice(state.selected,1);state.selected=-1;drawOverlay();scheduleRecovery();updateUI();}

async function imagePicked(file){if(!file||!hasDoc())return;const data=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file)});const img=new Image();img.onload=()=>{saveUndo();const p=currentPage(),ratio=img.naturalHeight/img.naturalWidth,w=p.width*.35,h=w*ratio;currentPage().annotations.push({type:'image',imageData:data,x:p.width*.12,y:p.height*.12,w,h});state.selected=currentPage().annotations.length-1;drawOverlay();scheduleRecovery();updateUI();};img.src=data;}

async function exportPdf(){
  if(!hasDoc())return;try{setStatus('Exporting PDF…');const {PDFLib}=await ensureLibraries();const {PDFDocument,StandardFonts,rgb}=PDFLib;let src=null;if(state.sourceBytes)src=await PDFDocument.load(state.sourceBytes.slice());const out=await PDFDocument.create();const font=await out.embedFont(StandardFonts.Helvetica);
    for(const pm of state.pages){let op;if(pm.sourceIndex!==null&&src){const [cp]=await out.copyPages(src,[pm.sourceIndex]);op=out.addPage(cp);}else op=out.addPage([pm.width,pm.height]);const pw=op.getWidth(),ph=op.getHeight(),sx=pw/pm.width,sy=ph/pm.height;
      for(const a of pm.annotations){const h=(a.color||'#000000').replace('#',''),num=parseInt(h,16),col=rgb(((num>>16)&255)/255,((num>>8)&255)/255,(num&255)/255);
        if(a.type==='text'){a.text.split('\n').forEach((line,j)=>op.drawText(line||' ',{x:a.x*sx,y:ph-(a.y+j*a.size*1.2+a.size)*sy,size:a.size*Math.min(sx,sy),font,color:col}));}
        else if(a.type==='stroke'||a.type==='highlight'){for(let i=1;i<a.points.length;i++){const A=a.points[i-1],B=a.points[i];op.drawLine({start:{x:A.x*sx,y:ph-A.y*sy},end:{x:B.x*sx,y:ph-B.y*sy},thickness:a.width*Math.min(sx,sy),color:col,opacity:a.type==='highlight'?.35:1});}}
        else if(a.type==='image'&&a.imageData){try{const bytes=Uint8Array.from(atob(a.imageData.split(',')[1]),c=>c.charCodeAt(0));const emb=a.imageData.startsWith('data:image/png')?await out.embedPng(bytes):await out.embedJpg(bytes);op.drawImage(emb,{x:a.x*sx,y:ph-(a.y+a.h)*sy,width:a.w*sx,height:a.h*sy});}catch(err){console.warn('image export',err)}}
      }
    }
    const bytes=await out.save();const blob=new Blob([bytes],{type:'application/pdf'});const file=new File([blob],state.filename,{type:'application/pdf'});
    let shared=false;if(navigator.share&&navigator.canShare){try{if(navigator.canShare({files:[file]})){await navigator.share({files:[file],title:state.filename});shared=true;}}catch(e){if(e.name!=='AbortError')console.warn(e)}}
    if(!shared){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=state.filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
    await clearRecovery();setStatus('Saved '+state.filename);showToast('PDF exported.');
  }catch(e){console.error(e);setStatus('Export failed.');showToast('Could not export PDF.');}
}

function updateUI(){const doc=hasDoc(),p=currentPage();[els.saveBtn,els.addPageBtn,els.delPageBtn,els.imageBtn,els.clearPageBtn,els.zoomOutBtn,els.zoomInBtn,els.applyZoomBtn,els.fitBtn].forEach(b=>b.disabled=!doc);els.prevBtn.disabled=!doc||state.pageIndex<=0;els.nextBtn.disabled=!doc||state.pageIndex>=state.pages.length-1;els.undoBtn.disabled=!state.undo.length;els.redoBtn.disabled=!state.redo.length;els.deleteSelectedBtn.disabled=state.selected<0;els.pageLabel.textContent=doc?`Page ${state.pageIndex+1} / ${state.pages.length}`:'Page 0 / 0';els.zoomLabel.textContent='Zoom '+Math.round(state.zoom*100)+'%';els.zoomInput.value=Math.round(state.zoom*100);els.selectionStatus.textContent=state.selected>=0?'1 selected':'';if(doc&&!els.status.textContent.includes('Export'))setStatus(`${state.pages.reduce((n,x)=>n+x.annotations.length,0)} editable edit(s). Recovery autosave is ON.`);}
function setZoom(z){state.fitMode=false;state.zoom=clamp(z,.1,4);renderPage();}
function fit(){state.fitMode=true;renderPage();}

// IndexedDB: one revolving recovery record.
const DB='SimplePDFEditorRecovery',STORE='drafts',KEY='current';
function openDB(){return new Promise((res,rej)=>{if(!indexedDB)return rej(new Error('IndexedDB unavailable'));const q=indexedDB.open(DB,1);q.onupgradeneeded=()=>q.result.createObjectStore(STORE);q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});}
async function saveRecovery(){if(!hasDoc())return;try{const db=await openDB(),tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put({savedAt:Date.now(),filename:state.filename,sourceBytes:state.sourceBytes?Array.from(state.sourceBytes):null,pages:state.pages,pageIndex:state.pageIndex},KEY);await new Promise((r,j)=>{tx.oncomplete=r;tx.onerror=()=>j(tx.error)});db.close();}catch(e){console.warn('recovery',e)}}
function scheduleRecovery(){clearTimeout(state.autosaveTimer);state.autosaveTimer=setTimeout(saveRecovery,700);}
async function clearRecovery(){try{const db=await openDB(),tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(KEY);db.close();}catch{}}
async function restoreRecovery(){try{const db=await openDB(),tx=db.transaction(STORE,'readonly'),q=tx.objectStore(STORE).get(KEY);const d=await new Promise((r,j)=>{q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});db.close();if(!d)return;if(Date.now()-d.savedAt>30*864e5){await clearRecovery();return;}if(!confirm(`Recover unsaved PDF?\n\n${d.filename}`))return;state.filename=d.filename;state.sourceBytes=d.sourceBytes?new Uint8Array(d.sourceBytes):null;state.pages=d.pages;state.pageIndex=clamp(d.pageIndex||0,0,state.pages.length-1);if(state.sourceBytes){const {pdfjsLib}=await ensureLibraries();state.pdf=await pdfjsLib.getDocument({data:state.sourceBytes.slice()}).promise;}state.fitMode=true;enterEditor();await renderPage();}catch(e){console.warn('restore',e)}}

// Button wiring happens immediately and does not depend on CDNs.
els.newBtn.onclick=()=>openDialog(els.newDialog);els.emptyNewBtn.onclick=()=>openDialog(els.newDialog);els.importBtn.onclick=()=>els.pdfInput.click();els.emptyImportBtn.onclick=()=>els.pdfInput.click();els.pdfInput.onchange=()=>{const f=els.pdfInput.files?.[0];els.pdfInput.value='';importPdf(f)};els.newForm.addEventListener('submit',e=>{e.preventDefault();createNew()});els.saveBtn.onclick=exportPdf;els.addPageBtn.onclick=addBlankPage;els.delPageBtn.onclick=deletePage;els.prevBtn.onclick=()=>nav(-1);els.nextBtn.onclick=()=>nav(1);els.imageBtn.onclick=()=>els.imageInput.click();els.imageInput.onchange=()=>{const f=els.imageInput.files?.[0];els.imageInput.value='';imagePicked(f)};els.undoBtn.onclick=undo;els.redoBtn.onclick=redo;els.deleteSelectedBtn.onclick=deleteSelected;els.clearPageBtn.onclick=clearPage;els.zoomInBtn.onclick=()=>setZoom(state.zoom*1.15);els.zoomOutBtn.onclick=()=>setZoom(state.zoom/1.15);els.applyZoomBtn.onclick=()=>setZoom((Number(els.zoomInput.value)||100)/100);els.fitBtn.onclick=fit;document.querySelectorAll('.tool[data-tool]').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));
window.addEventListener('resize',()=>{clearTimeout(window.__fitTimer);window.__fitTimer=setTimeout(()=>{if(hasDoc()&&state.fitMode)renderPage()},120)});window.addEventListener('orientationchange',()=>setTimeout(()=>{if(hasDoc())fit()},250));
window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;const k=e.key.toLowerCase(),meta=e.ctrlKey||e.metaKey;if(meta&&k==='s'){e.preventDefault();exportPdf();}else if(meta&&k==='z'){e.preventDefault();undo();}else if(meta&&k==='y'){e.preventDefault();redo();}else if(k==='delete'||k==='backspace'){if(state.selected>=0){e.preventDefault();deleteSelected();}}else if(k==='pageup'){e.preventDefault();nav(-1)}else if(k==='pagedown'){e.preventDefault();nav(1)}else if(meta&&k==='0'){e.preventDefault();fit();}else if(['s','p','e','h','t'].includes(k))setTool({s:'select',p:'pen',e:'erase',h:'highlight',t:'text'}[k]);});
setTool('select');updateUI();restoreRecovery();
})();
