/* Simple PDF Editor - browser version (HTML/CSS/JavaScript only) */

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const $ = (id) => document.getElementById(id);
const els = {
  newBtn:$('newBtn'), importBtn:$('importBtn'), saveBtn:$('saveBtn'), addPageBtn:$('addPageBtn'), delPageBtn:$('delPageBtn'),
  prevBtn:$('prevBtn'), nextBtn:$('nextBtn'), pageLabel:$('pageLabel'), imageBtn:$('imageBtn'), colorPicker:$('colorPicker'),
  undoBtn:$('undoBtn'), redoBtn:$('redoBtn'), deleteSelectedBtn:$('deleteSelectedBtn'), clearPageBtn:$('clearPageBtn'),
  penWidth:$('penWidth'), highlightWidth:$('highlightWidth'), eraserWidth:$('eraserWidth'), textSize:$('textSize'),
  zoomOutBtn:$('zoomOutBtn'), zoomInBtn:$('zoomInBtn'), zoomInput:$('zoomInput'), applyZoomBtn:$('applyZoomBtn'), fitBtn:$('fitBtn'),
  zoomLabel:$('zoomLabel'), toolLabel:$('toolLabel'), emptyState:$('emptyState'), scrollArea:$('scrollArea'), pageStage:$('pageStage'),
  pdfCanvas:$('pdfCanvas'), overlayCanvas:$('overlayCanvas'), status:$('status'), selectionStatus:$('selectionStatus'),
  pdfInput:$('pdfInput'), imageInput:$('imageInput'), newDialog:$('newDialog'), pageSizeSelect:$('pageSizeSelect'), createPdfBtn:$('createPdfBtn'),
  textDialog:$('textDialog'), textInput:$('textInput'), confirmTextBtn:$('confirmTextBtn'), toast:$('toast'),
  emptyNewBtn:$('emptyNewBtn'), emptyImportBtn:$('emptyImportBtn')
};
const pdfCtx = els.pdfCanvas.getContext('2d');
const overlayCtx = els.overlayCanvas.getContext('2d');

const imageCache = new Map();

const state = {
  sourceBytes:null, pdfjsDoc:null, filename:'new_pdf.pdf', pages:[], pageIndex:0, zoom:1, minZoom:.1, maxZoom:4,
  tool:'select', color:'#ff0000', drawing:false, currentStroke:null, pointerId:null, selected:[], clipboard:[],
  drag:null, selectionRect:null, undo:[], redo:[], pendingTextPoint:null, editTextIndex:null, renderToken:0
};

function page(){ return state.pages[state.pageIndex] || null; }
function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
function num(el, fallback, min, max){ const n=Number(el.value); const v=Number.isFinite(n)?clamp(n,min,max):fallback; el.value=String(v); return v; }
function deep(v){ return JSON.parse(JSON.stringify(v, (k,val)=>k==='imageObj'?undefined:val)); }
function toast(msg){ els.toast.textContent=msg; els.toast.classList.remove('hidden'); clearTimeout(toast.t); toast.t=setTimeout(()=>els.toast.classList.add('hidden'),2200); }
function hexToRgb01(hex){ hex=hex.replace('#',''); return [0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255); }
function isTyping(){ const a=document.activeElement; return a && ['INPUT','TEXTAREA','SELECT'].includes(a.tagName); }

function pushHistory(){
  state.undo.push(deep({pages:state.pages,pageIndex:state.pageIndex}));
  if(state.undo.length>60) state.undo.shift();
  state.redo=[];
  updateUI();
}
async function restoreSnapshot(s){ state.pages=deep(s.pages); state.pageIndex=clamp(s.pageIndex,0,state.pages.length-1); state.selected=[]; state.drag=null; await hydrateImages(); renderPage(); }
function undo(){ if(!state.undo.length)return; state.redo.push(deep({pages:state.pages,pageIndex:state.pageIndex})); restoreSnapshot(state.undo.pop()); }
function redo(){ if(!state.redo.length)return; state.undo.push(deep({pages:state.pages,pageIndex:state.pageIndex})); restoreSnapshot(state.redo.pop()); }

function setTool(tool){
  state.tool=tool; state.selected=[]; state.drag=null; state.selectionRect=null;
  document.querySelectorAll('.tool[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));
  els.toolLabel.textContent=`Tool: ${tool[0].toUpperCase()+tool.slice(1)}`;
  els.overlayCanvas.style.cursor=tool==='select'?'default':tool==='text'?'text':'crosshair';
  drawOverlay(); updateUI();
}

document.querySelectorAll('.tool[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));

async function openPdfFile(file){
  if(!file)return;
  try{
    const bytes=new Uint8Array(await file.arrayBuffer());
    const doc=await pdfjsLib.getDocument({data:bytes.slice()}).promise;
    const pages=[];
    for(let i=1;i<=doc.numPages;i++){
      const p=await doc.getPage(i); const vp=p.getViewport({scale:1});
      pages.push({sourcePage:i-1,width:vp.width,height:vp.height,annotations:[]});
    }
    state.sourceBytes=bytes; state.pdfjsDoc=doc; state.pages=pages; state.pageIndex=0; state.zoom=1; state.filename=file.name;
    state.undo=[]; state.redo=[]; state.selected=[];
    showEditor(); await renderPage(); updateStatus(`Imported: ${file.name}`);
  }catch(e){ console.error(e); toast('Could not open that PDF.'); }
}

function pageSize(name){
  return ({'Letter - Portrait':[612,792],'Letter - Landscape':[792,612],'A4 - Portrait':[595,842],'A4 - Landscape':[842,595],'Square':[612,612]})[name] || [612,792];
}
async function createNewPdf(){
  const [w,h]=pageSize(els.pageSizeSelect.value);
  state.sourceBytes=null; state.pdfjsDoc=null; state.pages=[{sourcePage:null,width:w,height:h,annotations:[]}]; state.pageIndex=0; state.zoom=1; state.filename='new_pdf.pdf';
  state.undo=[]; state.redo=[]; state.selected=[]; showEditor(); await renderPage(); updateStatus('Created new PDF. Use Save As to download it.');
}
function showEditor(){ els.emptyState.classList.add('hidden'); els.scrollArea.classList.remove('hidden'); updateUI(); }

async function renderPage(){
  const p=page(); if(!p)return; const token=++state.renderToken;
  const cssW=p.width*state.zoom, cssH=p.height*state.zoom; const dpr=window.devicePixelRatio||1;
  for(const c of [els.pdfCanvas,els.overlayCanvas]){ c.width=Math.max(1,Math.round(cssW*dpr)); c.height=Math.max(1,Math.round(cssH*dpr)); c.style.width=`${cssW}px`; c.style.height=`${cssH}px`; }
  els.pageStage.style.width=`${cssW}px`; els.pageStage.style.height=`${cssH}px`;
  pdfCtx.setTransform(dpr,0,0,dpr,0,0); pdfCtx.clearRect(0,0,cssW,cssH); pdfCtx.fillStyle='#fff'; pdfCtx.fillRect(0,0,cssW,cssH);
  if(p.sourcePage!==null && state.pdfjsDoc){
    const src=await state.pdfjsDoc.getPage(p.sourcePage+1); if(token!==state.renderToken)return;
    const viewport=src.getViewport({scale:state.zoom});
    await src.render({canvasContext:pdfCtx,viewport,transform:dpr!==1?[dpr,0,0,dpr,0,0]:null}).promise;
  }
  drawOverlay(); updateUI();
}

function toPagePoint(evt){ const r=els.overlayCanvas.getBoundingClientRect(); return {x:clamp((evt.clientX-r.left)/state.zoom,0,page().width),y:clamp((evt.clientY-r.top)/state.zoom,0,page().height)}; }
function bbox(ann){
  if(ann.type==='stroke'||ann.type==='highlight'){
    const xs=ann.points.map(p=>p.x), ys=ann.points.map(p=>p.y), pad=Math.max(6,(ann.width||1)/2);
    return [Math.min(...xs)-pad,Math.min(...ys)-pad,Math.max(...xs)+pad,Math.max(...ys)+pad];
  }
  if(ann.type==='text'){ const w=Math.max(30,(ann.text||'').split('\n').reduce((m,s)=>Math.max(m,s.length),0)*(ann.size||18)*.58); const h=Math.max(ann.size||18,(ann.text||'').split('\n').length*(ann.size||18)*1.2); return [ann.x,ann.y,ann.x+w,ann.y+h]; }
  if(ann.type==='image') return [ann.x,ann.y,ann.x+ann.w,ann.y+ann.h];
  return null;
}
function selectionBBox(indices=state.selected){ const boxes=indices.map(i=>bbox(page().annotations[i])).filter(Boolean); if(!boxes.length)return null; return [Math.min(...boxes.map(b=>b[0])),Math.min(...boxes.map(b=>b[1])),Math.max(...boxes.map(b=>b[2])),Math.max(...boxes.map(b=>b[3]))]; }
function hitTest(pt){ const a=page().annotations; for(let i=a.length-1;i>=0;i--){ const b=bbox(a[i]); if(b&&pt.x>=b[0]&&pt.x<=b[2]&&pt.y>=b[1]&&pt.y<=b[3])return i; } return null; }
function intersects(a,b){ return !(a[2]<b[0]||a[0]>b[2]||a[3]<b[1]||a[1]>b[3]); }

function drawOverlay(){
  const p=page(); if(!p)return; const dpr=window.devicePixelRatio||1, w=p.width*state.zoom,h=p.height*state.zoom;
  overlayCtx.setTransform(dpr,0,0,dpr,0,0); overlayCtx.clearRect(0,0,w,h);
  for(const ann of p.annotations) drawAnn(ann);
  if(state.currentStroke) drawAnn(state.currentStroke);
  if(state.tool==='select') drawSelection();
}
function drawAnn(ann){
  const z=state.zoom; overlayCtx.save();
  if(ann.type==='stroke'||ann.type==='highlight'){
    overlayCtx.strokeStyle=ann.color; overlayCtx.globalAlpha=ann.type==='highlight'?.35:1; overlayCtx.lineWidth=(ann.width||1)*z; overlayCtx.lineCap='round'; overlayCtx.lineJoin='round'; overlayCtx.beginPath();
    ann.points.forEach((p,i)=>i?overlayCtx.lineTo(p.x*z,p.y*z):overlayCtx.moveTo(p.x*z,p.y*z)); overlayCtx.stroke();
  }else if(ann.type==='text'){
    overlayCtx.translate(ann.x*z,ann.y*z); overlayCtx.rotate((ann.rotation||0)*Math.PI/180); overlayCtx.fillStyle=ann.color||'#000'; overlayCtx.font=`${(ann.size||18)*z}px Arial`; overlayCtx.textBaseline='top';
    ann.text.split('\n').forEach((line,i)=>overlayCtx.fillText(line,0,i*(ann.size||18)*1.2*z));
  }else if(ann.type==='image'&&ann.dataUrl){
    const img=imageCache.get(ann.dataUrl);
    if(img){ const cx=(ann.x+ann.w/2)*z,cy=(ann.y+ann.h/2)*z; overlayCtx.translate(cx,cy); overlayCtx.rotate((ann.rotation||0)*Math.PI/180); overlayCtx.drawImage(img,-ann.w*z/2,-ann.h*z/2,ann.w*z,ann.h*z); }
  }
  overlayCtx.restore();
}
function drawSelection(){
  const z=state.zoom;
  if(state.selectionRect){ const r=state.selectionRect; overlayCtx.save(); overlayCtx.strokeStyle='#66ccff'; overlayCtx.setLineDash([4,3]); overlayCtx.lineWidth=2; overlayCtx.strokeRect(r[0]*z,r[1]*z,(r[2]-r[0])*z,(r[3]-r[1])*z); overlayCtx.restore(); }
  const b=selectionBBox(); if(!b)return;
  overlayCtx.save(); overlayCtx.strokeStyle='#0099ff'; overlayCtx.setLineDash([5,3]); overlayCtx.lineWidth=2; overlayCtx.strokeRect(b[0]*z,b[1]*z,(b[2]-b[0])*z,(b[3]-b[1])*z); overlayCtx.setLineDash([]);
  overlayCtx.fillStyle='#0099ff'; overlayCtx.strokeStyle='#fff'; overlayCtx.fillRect(b[2]*z-7,b[3]*z-7,14,14); overlayCtx.strokeRect(b[2]*z-7,b[3]*z-7,14,14);
  const cx=(b[0]+b[2])/2*z, top=b[1]*z; overlayCtx.strokeStyle='#0099ff'; overlayCtx.beginPath(); overlayCtx.moveTo(cx,top); overlayCtx.lineTo(cx,top-28); overlayCtx.stroke(); overlayCtx.fillStyle='#00aa77'; overlayCtx.beginPath(); overlayCtx.arc(cx,top-36,8,0,Math.PI*2); overlayCtx.fill(); overlayCtx.strokeStyle='#fff'; overlayCtx.stroke(); overlayCtx.restore();
}
function nearResize(pt,b){ const t=14/state.zoom; return Math.abs(pt.x-b[2])<=t&&Math.abs(pt.y-b[3])<=t; }
function nearRotate(pt,b){ const cx=(b[0]+b[2])/2, ry=b[1]-36/state.zoom; return Math.hypot(pt.x-cx,pt.y-ry)<=16/state.zoom; }

function moveAnn(ann,dx,dy){ if(ann.type==='stroke'||ann.type==='highlight') ann.points=ann.points.map(p=>({x:p.x+dx,y:p.y+dy})); else {ann.x+=dx;ann.y+=dy;} }
function scaleAnn(ann,group,sx,sy){ const [x0,y0]=group; if(ann.type==='stroke'||ann.type==='highlight'){ ann.points=ann.points.map(p=>({x:x0+(p.x-x0)*sx,y:y0+(p.y-y0)*sy})); ann.width=Math.max(1,(ann.width||1)*((sx+sy)/2)); } else { ann.x=x0+(ann.x-x0)*sx; ann.y=y0+(ann.y-y0)*sy; if(ann.type==='image'){ann.w=Math.max(2,ann.w*sx);ann.h=Math.max(2,ann.h*sy);} else if(ann.type==='text')ann.size=clamp(ann.size*sy,6,144); } }
function rotatePoint(x,y,cx,cy,deg){ const r=deg*Math.PI/180,ca=Math.cos(r),sa=Math.sin(r),dx=x-cx,dy=y-cy; return {x:cx+dx*ca-dy*sa,y:cy+dx*sa+dy*ca}; }
function rotateAnn(ann,group,deg){ const cx=(group[0]+group[2])/2,cy=(group[1]+group[3])/2; if(ann.type==='stroke'||ann.type==='highlight')ann.points=ann.points.map(p=>rotatePoint(p.x,p.y,cx,cy,deg)); else {const q=rotatePoint(ann.x,ann.y,cx,cy,deg);ann.x=q.x;ann.y=q.y;ann.rotation=((ann.rotation||0)+deg)%360;} }

els.overlayCanvas.addEventListener('pointerdown',(evt)=>{
  if(!page())return; els.overlayCanvas.setPointerCapture(evt.pointerId); state.pointerId=evt.pointerId; const pt=toPagePoint(evt);
  if(state.tool==='text'){ state.pendingTextPoint=pt; state.editTextIndex=null; els.textInput.value=''; els.textDialog.showModal(); setTimeout(()=>els.textInput.focus(),20); return; }
  if(state.tool==='pen'||state.tool==='highlight'){
    state.drawing=true; state.currentStroke={type:state.tool==='pen'?'stroke':'highlight',points:[pt],color:state.tool==='highlight'?'#ffff00':els.colorPicker.value,width:state.tool==='highlight'?num(els.highlightWidth,16,1,80):num(els.penWidth,3,1,80)}; drawOverlay(); return;
  }
  if(state.tool==='erase'){ pushHistory(); state.drag={mode:'erase'}; eraseAt(pt); return; }
  if(state.tool==='select'){
    const b=selectionBBox();
    if(b&&pt.x>=b[0]&&pt.x<=b[2]&&pt.y>=b[1]&&pt.y<=b[3]){
      pushHistory(); const mode=nearRotate(pt,b)?'rotate':nearResize(pt,b)?'resize':'move'; state.drag={mode,start:pt,group:b,original:deep(state.selected.map(i=>page().annotations[i]))}; return;
    }
    const hit=hitTest(pt);
    if(hit!==null){ state.selected=[hit]; pushHistory(); state.drag={mode:'move',start:pt,group:selectionBBox(),original:[deep(page().annotations[hit])]}; drawOverlay(); updateUI(); return; }
    state.selected=[]; state.selectionRect=[pt.x,pt.y,pt.x,pt.y]; state.drag={mode:'box',start:pt}; drawOverlay(); updateUI();
  }
});

els.overlayCanvas.addEventListener('pointermove',(evt)=>{
  if(state.pointerId!==evt.pointerId)return; const pt=toPagePoint(evt);
  if(state.drawing&&state.currentStroke){ state.currentStroke.points.push(pt); drawOverlay(); return; }
  if(!state.drag)return;
  if(state.drag.mode==='erase'){ eraseAt(pt); return; }
  if(state.drag.mode==='box'){
    const s=state.drag.start; state.selectionRect=[Math.min(s.x,pt.x),Math.min(s.y,pt.y),Math.max(s.x,pt.x),Math.max(s.y,pt.y)]; state.selected=page().annotations.map((a,i)=>intersects(state.selectionRect,bbox(a))?i:-1).filter(i=>i>=0); drawOverlay(); updateUI(); return;
  }
  const indices=state.selected; if(!indices.length)return; const dx=pt.x-state.drag.start.x,dy=pt.y-state.drag.start.y;
  indices.forEach((idx,k)=>{ page().annotations[idx]=deep(state.drag.original[k]); const ann=page().annotations[idx]; if(state.drag.mode==='move')moveAnn(ann,dx,dy); else if(state.drag.mode==='resize'){ const g=state.drag.group,ow=Math.max(1,g[2]-g[0]),oh=Math.max(1,g[3]-g[1]); scaleAnn(ann,g,Math.max(.05,(pt.x-g[0])/ow),Math.max(.05,(pt.y-g[1])/oh)); } else if(state.drag.mode==='rotate'){ const g=state.drag.group,cx=(g[0]+g[2])/2,cy=(g[1]+g[3])/2; const a0=Math.atan2(state.drag.start.y-cy,state.drag.start.x-cx),a1=Math.atan2(pt.y-cy,pt.x-cx); rotateAnn(ann,g,(a1-a0)*180/Math.PI); } });
  drawOverlay();
});

function endPointer(evt){
  if(state.pointerId!==evt.pointerId)return;
  if(state.drawing&&state.currentStroke){ if(state.currentStroke.points.length>1){ pushHistory(); page().annotations.push(state.currentStroke); } state.currentStroke=null; state.drawing=false; }
  if(state.drag?.mode==='box'){ state.selectionRect=null; }
  state.drag=null; state.pointerId=null; drawOverlay(); updateUI();
}
els.overlayCanvas.addEventListener('pointerup',endPointer); els.overlayCanvas.addEventListener('pointercancel',endPointer);

function eraseAt(pt){ const r=num(els.eraserWidth,20,1,200)/2; const before=page().annotations.length; page().annotations=page().annotations.filter(a=>{const b=bbox(a); if(!b)return true; const nx=clamp(pt.x,b[0],b[2]),ny=clamp(pt.y,b[1],b[3]); return Math.hypot(pt.x-nx,pt.y-ny)>r;}); if(page().annotations.length!==before){state.selected=[];drawOverlay();updateUI();} }

els.overlayCanvas.addEventListener('dblclick',(evt)=>{
  if(state.tool!=='select')return; const i=hitTest(toPagePoint(evt)); if(i===null)return; const a=page().annotations[i]; if(a.type!=='text')return; state.editTextIndex=i; state.pendingTextPoint={x:a.x,y:a.y}; els.textInput.value=a.text; els.textDialog.showModal();
});

els.confirmTextBtn.addEventListener('click',(evt)=>{
  evt.preventDefault(); const text=els.textInput.value; if(!text.trim()){els.textDialog.close();return;}
  pushHistory();
  if(state.editTextIndex!==null){ page().annotations[state.editTextIndex].text=text; }
  else page().annotations.push({type:'text',x:state.pendingTextPoint.x,y:state.pendingTextPoint.y,text,color:els.colorPicker.value,size:num(els.textSize,18,6,144),rotation:0});
  state.editTextIndex=null; state.pendingTextPoint=null; els.textDialog.close(); drawOverlay();updateUI();
});

els.imageBtn.addEventListener('click',()=>els.imageInput.click());
els.imageInput.addEventListener('change',async()=>{
  const file=els.imageInput.files?.[0]; if(!file||!page())return; let dataUrl=await fileToDataUrl(file); let img=await imageFromUrl(dataUrl); if(file.type==='image/webp'){ const c=document.createElement('canvas'); c.width=img.naturalWidth; c.height=img.naturalHeight; c.getContext('2d').drawImage(img,0,0); dataUrl=c.toDataURL('image/png'); img=await imageFromUrl(dataUrl); } imageCache.set(dataUrl,img); pushHistory();
  const maxW=page().width*.35,maxH=page().height*.28,scale=Math.min(maxW/img.naturalWidth,maxH/img.naturalHeight,1);
  const ann={type:'image',dataUrl,x:page().width*.15,y:page().height*.15,w:img.naturalWidth*scale,h:img.naturalHeight*scale,rotation:0}; page().annotations.push(ann); state.selected=[page().annotations.length-1]; setTool('select'); state.selected=[page().annotations.length-1]; drawOverlay(); updateUI(); els.imageInput.value='';
});
function fileToDataUrl(file){ return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(file);}); }
function imageFromUrl(url){ return new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url;}); }
async function hydrateImages(){ for(const p of state.pages)for(const a of p.annotations)if(a.type==='image'&&a.dataUrl&&!imageCache.has(a.dataUrl))imageCache.set(a.dataUrl,await imageFromUrl(a.dataUrl)); }

function deleteSelected(){ if(!state.selected.length)return; pushHistory(); [...state.selected].sort((a,b)=>b-a).forEach(i=>page().annotations.splice(i,1)); state.selected=[]; drawOverlay();updateUI(); }
function clearPage(){ if(!page()||!page().annotations.length)return; if(!confirm('Delete all edits on this page?'))return; pushHistory(); page().annotations=[];state.selected=[];drawOverlay();updateUI(); }
function copySelected(){ state.clipboard=state.selected.map(i=>deep(page().annotations[i])); }
async function pasteSelected(){ if(!state.clipboard.length||!page())return; pushHistory(); const start=page().annotations.length; for(const src of deep(state.clipboard)){moveAnn(src,12,12);if(src.type==='image'&&src.dataUrl&&!imageCache.has(src.dataUrl))imageCache.set(src.dataUrl,await imageFromUrl(src.dataUrl));page().annotations.push(src);} state.selected=Array.from({length:state.clipboard.length},(_,i)=>start+i);setTool('select');state.selected=Array.from({length:state.clipboard.length},(_,i)=>start+i);drawOverlay();updateUI(); }

async function addBlankPage(){ if(!page())return; pushHistory(); const p=page(); state.pages.splice(state.pageIndex+1,0,{sourcePage:null,width:p.width,height:p.height,annotations:[]}); state.pageIndex++; state.selected=[]; await renderPage(); }
async function deletePage(){ if(state.pages.length<=1){toast('A PDF needs at least one page.');return;} if(!confirm('Delete current page?'))return; pushHistory(); state.pages.splice(state.pageIndex,1); state.pageIndex=Math.min(state.pageIndex,state.pages.length-1); state.selected=[]; await renderPage(); }
async function prevPage(){ if(state.pageIndex>0){state.pageIndex--;state.selected=[];await renderPage();} }
async function nextPage(){ if(state.pageIndex<state.pages.length-1){state.pageIndex++;state.selected=[];await renderPage();} }

function zoomTo(z){ state.zoom=clamp(z,state.minZoom,state.maxZoom); renderPage(); }
function fitToWindow(){ if(!page())return; const r=els.scrollArea.getBoundingClientRect(); zoomTo(Math.max(state.minZoom,Math.min(state.maxZoom,(r.width-90)/page().width,(r.height-90)/page().height))); }

async function saveAs(){
  if(!state.pages.length)return; els.saveBtn.disabled=true; els.saveBtn.textContent='Saving...';
  try{
    const {PDFDocument,StandardFonts,rgb,degrees}=PDFLib; const out=await PDFDocument.create(); let src=null; if(state.sourceBytes)src=await PDFDocument.load(state.sourceBytes.slice()); const font=await out.embedFont(StandardFonts.Helvetica);
    for(const p of state.pages){
      let outPage;
      if(p.sourcePage!==null&&src){ const [cp]=await out.copyPages(src,[p.sourcePage]); out.addPage(cp); outPage=out.getPage(out.getPageCount()-1); }
      else outPage=out.addPage([p.width,p.height]);
      for(const a of p.annotations){
        if(a.type==='stroke'||a.type==='highlight'){
          const [r,g,b]=hexToRgb01(a.color||'#000000'); const opacity=a.type==='highlight'?.35:1;
          for(let i=1;i<a.points.length;i++){ const u=a.points[i-1],v=a.points[i]; outPage.drawLine({start:{x:u.x,y:p.height-u.y},end:{x:v.x,y:p.height-v.y},thickness:a.width||1,color:rgb(r,g,b),opacity}); }
        }else if(a.type==='text'){
          const [r,g,b]=hexToRgb01(a.color||'#000000'); const lines=a.text.split('\n'); lines.forEach((line,i)=>outPage.drawText(line,{x:a.x,y:p.height-a.y-(a.size||18)-i*(a.size||18)*1.2,size:a.size||18,font,color:rgb(r,g,b),rotate:degrees(-(a.rotation||0))}));
        }else if(a.type==='image'&&a.dataUrl){
          const bytes=dataUrlToBytes(a.dataUrl); let embedded; if(a.dataUrl.startsWith('data:image/png'))embedded=await out.embedPng(bytes); else embedded=await out.embedJpg(bytes); outPage.drawImage(embedded,{x:a.x,y:p.height-a.y-a.h,width:a.w,height:a.h,rotate:degrees(-(a.rotation||0))});
        }
      }
    }
    const bytes=await out.save(); const blob=new Blob([bytes],{type:'application/pdf'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=(state.filename.replace(/\.pdf$/i,'')||'document')+'-edited.pdf'; document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);updateStatus('Saved PDF download.');
  }catch(e){console.error(e);toast('Save failed.');}
  finally{els.saveBtn.textContent='Save As';els.saveBtn.disabled=false;}
}
function dataUrlToBytes(url){ const b64=url.split(',')[1],bin=atob(b64),u8=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i);return u8; }

function updateUI(){
  const has=state.pages.length>0,p=page(); const selected=state.selected.length;
  [els.saveBtn,els.addPageBtn,els.delPageBtn,els.imageBtn,els.clearPageBtn,els.zoomOutBtn,els.zoomInBtn,els.applyZoomBtn,els.fitBtn].forEach(b=>b.disabled=!has);
  els.prevBtn.disabled=!has||state.pageIndex===0; els.nextBtn.disabled=!has||state.pageIndex>=state.pages.length-1; els.undoBtn.disabled=!state.undo.length;els.redoBtn.disabled=!state.redo.length;els.deleteSelectedBtn.disabled=!selected;
  els.pageLabel.textContent=has?`Page ${state.pageIndex+1} / ${state.pages.length}`:'Page 0 / 0'; els.zoomLabel.textContent=`Zoom ${Math.round(state.zoom*100)}%`; els.zoomInput.value=String(Math.round(state.zoom*100));
  els.selectionStatus.textContent=selected?`${selected} selected`:(p?`${p.annotations.length} editable edit(s)`:'');
}
function updateStatus(msg){ els.status.textContent=msg||'Ready.'; updateUI(); }

els.newBtn.onclick=()=>els.newDialog.showModal(); els.emptyNewBtn.onclick=()=>els.newDialog.showModal();
els.createPdfBtn.addEventListener('click',(e)=>{e.preventDefault();els.newDialog.close();createNewPdf();});
els.importBtn.onclick=()=>els.pdfInput.click();els.emptyImportBtn.onclick=()=>els.pdfInput.click();els.pdfInput.onchange=()=>{openPdfFile(els.pdfInput.files?.[0]);els.pdfInput.value='';};
els.saveBtn.onclick=saveAs; els.addPageBtn.onclick=addBlankPage;els.delPageBtn.onclick=deletePage;els.prevBtn.onclick=prevPage;els.nextBtn.onclick=nextPage;
els.undoBtn.onclick=undo;els.redoBtn.onclick=redo;els.deleteSelectedBtn.onclick=deleteSelected;els.clearPageBtn.onclick=clearPage;
els.zoomInBtn.onclick=()=>zoomTo(state.zoom*1.15);els.zoomOutBtn.onclick=()=>zoomTo(state.zoom/1.15);els.applyZoomBtn.onclick=()=>zoomTo(num(els.zoomInput,100,10,400)/100);els.fitBtn.onclick=fitToWindow;
els.colorPicker.oninput=()=>state.color=els.colorPicker.value;

window.addEventListener('keydown',async(e)=>{
  if(isTyping())return; const k=e.key.toLowerCase();
  const tools={p:'pen',e:'erase',h:'highlight',s:'select',t:'text'}; if(tools[k]&&!e.ctrlKey&&!e.metaKey){setTool(tools[k]);e.preventDefault();return;}
  if((e.ctrlKey||e.metaKey)&&k==='z'){e.preventDefault();undo();return;} if((e.ctrlKey||e.metaKey)&&k==='y'){e.preventDefault();redo();return;}
  if((e.ctrlKey||e.metaKey)&&k==='c'){e.preventDefault();copySelected();return;} if((e.ctrlKey||e.metaKey)&&k==='v'){e.preventDefault();await pasteSelected();return;}
  if((e.ctrlKey||e.metaKey)&&k==='s'){e.preventDefault();saveAs();return;} if((e.ctrlKey||e.metaKey)&&k==='0'){e.preventDefault();fitToWindow();return;}
  if(e.key==='Delete'){e.preventDefault();deleteSelected();return;} if(e.key==='PageUp'){e.preventDefault();prevPage();return;} if(e.key==='PageDown'){e.preventDefault();nextPage();return;}
  if(!state.selected.length)return; const b=selectionBBox(); if(!b)return;
  if(k==='r'||['1','2','3','4'].includes(k)){
    e.preventDefault();pushHistory();for(const i of state.selected){const a=page().annotations[i];if(k==='r')rotateAnn(a,b,2.5);else if(k==='1')scaleAnn(a,b,1.025,1);else if(k==='3')scaleAnn(a,b,.975,1);else if(k==='2')scaleAnn(a,b,1,1.025);else if(k==='4')scaleAnn(a,b,1,.975);}drawOverlay();updateUI();
  }
});

window.addEventListener('resize',()=>{ if(page())drawOverlay(); });
updateUI();
