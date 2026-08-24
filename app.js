(() => {
'use strict';
const $ = id => document.getElementById(id);
const el = {
  newBtn:$('newBtn'), importBtn:$('importBtn'), saveBtn:$('saveBtn'), addPageBtn:$('addPageBtn'), delPageBtn:$('delPageBtn'), prevBtn:$('prevBtn'), nextBtn:$('nextBtn'), pageLabel:$('pageLabel'),
  imageBtn:$('imageBtn'), colorPicker:$('colorPicker'), undoBtn:$('undoBtn'), redoBtn:$('redoBtn'), deleteSelectedBtn:$('deleteSelectedBtn'), clearPageBtn:$('clearPageBtn'),
  penWidth:$('penWidth'), highlightWidth:$('highlightWidth'), eraserWidth:$('eraserWidth'), textSize:$('textSize'), zoomOutBtn:$('zoomOutBtn'), zoomInBtn:$('zoomInBtn'), zoomInput:$('zoomInput'), applyZoomBtn:$('applyZoomBtn'), fitBtn:$('fitBtn'), zoomLabel:$('zoomLabel'), toolLabel:$('toolLabel'),
  workspace:$('workspace'), emptyState:$('emptyState'), scrollArea:$('scrollArea'), pageStage:$('pageStage'), pdfCanvas:$('pdfCanvas'), overlayCanvas:$('overlayCanvas'), status:$('status'), selectionStatus:$('selectionStatus'),
  pdfInput:$('pdfInput'), imageInput:$('imageInput'), newDialog:$('newDialog'), newForm:$('newForm'), pageSizeSelect:$('pageSizeSelect'), createPdfBtn:$('createPdfBtn'), textDialog:$('textDialog'), textForm:$('textForm'), textInput:$('textInput'), cancelTextBtn:$('cancelTextBtn'), toast:$('toast'),
  toolsToggleBtn:$('toolsToggleBtn'), toolbarWrap:$('toolbarWrap'), emptyNewBtn:$('emptyNewBtn'), emptyImportBtn:$('emptyImportBtn')
};

const state = {
  sourceBytes:null, pdf:null, filename:'edited.pdf', pages:[], pageIndex:0, zoom:1, fitMode:true,
  tool:'select', annotations:{}, selected:[], clipboard:[], undo:[], redo:[],
  pointerDown:false, pointerId:null, dragMode:null, dragStart:null, dragSnapshot:null,
  selectionStart:null, selectionRect:null, currentStroke:null, renderSeq:0, imageCache:new Map(),
  pendingTextPoint:null, autosaveTimer:null, pinch:new Map(), pinchStartDistance:0, pinchStartZoom:1
};

let pdfjsPromise, pdfLibPromise;
const PDFJS = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js'
];
const PDFLIB = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
  'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'
];
function loadScript(url){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=url;s.onload=res;s.onerror=()=>rej(new Error('Failed '+url));document.head.appendChild(s);});}
async function ensurePdfJs(){
  if(window.pdfjsLib) return window.pdfjsLib;
  if(!pdfjsPromise) pdfjsPromise=(async()=>{let last;for(const u of PDFJS){try{await loadScript(u);if(window.pdfjsLib){window.pdfjsLib.GlobalWorkerOptions.workerSrc=u.includes('cdnjs')?'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js':'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';return window.pdfjsLib;}}catch(e){last=e;}}throw last||new Error('PDF.js unavailable');})();
  return pdfjsPromise;
}
async function ensurePdfLib(){
  if(window.PDFLib) return window.PDFLib;
  if(!pdfLibPromise) pdfLibPromise=(async()=>{let last;for(const u of PDFLIB){try{await loadScript(u);if(window.PDFLib)return window.PDFLib;}catch(e){last=e;}}throw last||new Error('pdf-lib unavailable');})();
  return pdfLibPromise;
}

function toast(msg){ el.toast.textContent=msg;el.toast.classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>el.toast.classList.add('hidden'),2400); }
function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
function anns(){return state.annotations[state.pageIndex] ||= [];}
function page(){return state.pages[state.pageIndex];}
function deep(v){return structuredClone ? structuredClone(v) : JSON.parse(JSON.stringify(v));}
function num(input,d,min,max){const n=parseFloat(input.value);return Number.isFinite(n)?clamp(n,min,max):d;}
function hasDoc(){return state.pages.length>0;}
function editableTarget(t){return ['INPUT','TEXTAREA','SELECT'].includes(t?.tagName);}

function setEnabled(){
  const on=hasDoc(); [el.saveBtn,el.addPageBtn,el.delPageBtn,el.imageBtn,el.clearPageBtn,el.zoomOutBtn,el.zoomInBtn,el.applyZoomBtn,el.fitBtn].forEach(b=>b.disabled=!on);
  el.prevBtn.disabled=!on||state.pageIndex<=0; el.nextBtn.disabled=!on||state.pageIndex>=state.pages.length-1;
  el.deleteSelectedBtn.disabled=!state.selected.length; el.undoBtn.disabled=!state.undo.length; el.redoBtn.disabled=!state.redo.length;
  el.pageLabel.textContent=on?`Page ${state.pageIndex+1} / ${state.pages.length}`:'Page 0 / 0';
  el.zoomLabel.textContent=`Zoom ${Math.round(state.zoom*100)}%`; el.zoomInput.value=Math.round(state.zoom*100); el.toolLabel.textContent=`Tool: ${state.tool[0].toUpperCase()+state.tool.slice(1)}`;
  el.selectionStatus.textContent=state.selected.length?`${state.selected.length} selected • drag to move • blue square = resize • green circle = rotate`:'';
}
function saveState(){state.undo.push(deep({annotations:state.annotations,pages:state.pages,pageIndex:state.pageIndex}));if(state.undo.length>60)state.undo.shift();state.redo=[];setEnabled();}
function restoreSnapshot(s){state.annotations=s.annotations||{};state.pages=s.pages||[];state.pageIndex=clamp(s.pageIndex||0,0,Math.max(0,state.pages.length-1));state.selected=[];renderPage();scheduleRecovery();}
function undo(){if(!state.undo.length)return;state.redo.push(deep({annotations:state.annotations,pages:state.pages,pageIndex:state.pageIndex}));restoreSnapshot(state.undo.pop());}
function redo(){if(!state.redo.length)return;state.undo.push(deep({annotations:state.annotations,pages:state.pages,pageIndex:state.pageIndex}));restoreSnapshot(state.redo.pop());}

async function newPdf(sizeName){
  const sizes={'Letter - Portrait':[612,792],'Letter - Landscape':[792,612],'A4 - Portrait':[595,842],'A4 - Landscape':[842,595],'Square':[612,612]};
  const [w,h]=sizes[sizeName]||sizes['Letter - Portrait'];
  state.sourceBytes=null;state.pdf=null;state.filename='new_pdf.pdf';state.pages=[{kind:'blank',width:w,height:h}];state.annotations={0:[]};state.pageIndex=0;state.undo=[];state.redo=[];state.selected=[];state.fitMode=true;
  showEditor();await renderPage();scheduleRecovery();
}
async function importPdf(file){
  if(!file)return; try{
    el.status.textContent='Opening PDF…'; const pdfjs=await ensurePdfJs(); const bytes=new Uint8Array(await file.arrayBuffer()); const doc=await pdfjs.getDocument({data:bytes.slice()}).promise;
    state.sourceBytes=bytes;state.pdf=doc;state.filename=file.name.replace(/\.pdf$/i,'')+'-edited.pdf';state.pages=[];
    for(let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i);const v=p.getViewport({scale:1});state.pages.push({kind:'source',sourcePage:i,width:v.width,height:v.height});}
    state.annotations={};state.pageIndex=0;state.undo=[];state.redo=[];state.selected=[];state.zoom=1;state.fitMode=true;showEditor();await renderPage();scheduleRecovery();toast('PDF imported.');
  }catch(e){console.error(e);el.status.textContent='Could not open PDF.';toast('Could not open that PDF.');}
}
function showEditor(){el.emptyState.classList.add('hidden');el.scrollArea.classList.remove('hidden');setEnabled();}

function viewportAvailable(){
  const r=el.scrollArea.getBoundingClientRect(); const pad=window.innerWidth<700?16:40; return {w:Math.max(120,r.width-pad),h:Math.max(160,r.height-pad)};
}
async function fitPage(){if(!hasDoc())return;const p=page();const a=viewportAvailable();state.zoom=clamp(Math.min(a.w/p.width,a.h/p.height),0.1,4);state.fitMode=true;await renderPage(false);}
async function renderPage(autoFit=true){
  if(!hasDoc())return; const seq=++state.renderSeq; const p=page(); if(autoFit&&state.fitMode){const a=viewportAvailable();state.zoom=clamp(Math.min(a.w/p.width,a.h/p.height),0.1,4);}
  const cssW=Math.max(1,Math.round(p.width*state.zoom)), cssH=Math.max(1,Math.round(p.height*state.zoom)); const dpr=clamp(window.devicePixelRatio||1,1,3);
  for(const c of [el.pdfCanvas,el.overlayCanvas]){c.style.width=cssW+'px';c.style.height=cssH+'px';c.width=Math.max(1,Math.round(cssW*dpr));c.height=Math.max(1,Math.round(cssH*dpr));}
  el.pageStage.style.width=cssW+'px';el.pageStage.style.height=cssH+'px';
  const ctx=el.pdfCanvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,cssW,cssH);ctx.fillStyle='#fff';ctx.fillRect(0,0,cssW,cssH);
  if(p.kind==='source'){
    try{const pdfPage=await state.pdf.getPage(p.sourcePage);if(seq!==state.renderSeq)return;const vp=pdfPage.getViewport({scale:state.zoom});ctx.setTransform(1,0,0,1,0,0);await pdfPage.render({canvasContext:ctx,viewport:vp,transform:dpr!==1?[dpr,0,0,dpr,0,0]:null}).promise;}catch(e){console.error(e);toast('Page render failed.');}
  }
  drawOverlay();setEnabled();el.status.textContent=`${Object.values(state.annotations).reduce((n,a)=>n+a.length,0)} editable edit(s). Recovery autosave is ON.`;
}

function canvasPoint(evt){const r=el.overlayCanvas.getBoundingClientRect();return {x:clamp((evt.clientX-r.left)/state.zoom,0,page().width),y:clamp((evt.clientY-r.top)/state.zoom,0,page().height)};}
function rotatePoint(x,y,cx,cy,deg){const a=deg*Math.PI/180,dx=x-cx,dy=y-cy;return{x:cx+dx*Math.cos(a)-dy*Math.sin(a),y:cy+dx*Math.sin(a)+dy*Math.cos(a)};}
function bbox(a){
  if(a.type==='stroke'||a.type==='highlight'){if(!a.points?.length)return null;const xs=a.points.map(p=>p.x),ys=a.points.map(p=>p.y),pad=Math.max(6,(a.width||1)/2);return [Math.min(...xs)-pad,Math.min(...ys)-pad,Math.max(...xs)+pad,Math.max(...ys)+pad];}
  if(a.type==='text'){const w=Math.max(30,(a.text||'').split('\n').reduce((m,s)=>Math.max(m,s.length),0)*(a.size||18)*.58),h=Math.max(a.size||18,(a.text||'').split('\n').length*(a.size||18)*1.25);return [a.x,a.y,a.x+w,a.y+h];}
  if(a.type==='image')return[a.x,a.y,a.x+a.w,a.y+a.h]; return null;
}
function selectionBox(indices=state.selected){const bs=indices.map(i=>bbox(anns()[i])).filter(Boolean);if(!bs.length)return null;return[Math.min(...bs.map(b=>b[0])),Math.min(...bs.map(b=>b[1])),Math.max(...bs.map(b=>b[2])),Math.max(...bs.map(b=>b[3]))];}
function intersects(a,b){return !(a[2]<b[0]||a[0]>b[2]||a[3]<b[1]||a[1]>b[3]);}
function hitTest(p){const a=anns();for(let i=a.length-1;i>=0;i--){const b=bbox(a[i]);if(b&&p.x>=b[0]&&p.x<=b[2]&&p.y>=b[1]&&p.y<=b[3])return i;}return null;}
function handleHit(p,b){if(!b)return null;const tol=18/state.zoom;const resize={x:b[2],y:b[3]};const rot={x:(b[0]+b[2])/2,y:b[1]-34/state.zoom};if(Math.hypot(p.x-resize.x,p.y-resize.y)<=tol)return'resize';if(Math.hypot(p.x-rot.x,p.y-rot.y)<=tol)return'rotate';return null;}

async function loadImageFromDataUrl(dataUrl){if(state.imageCache.has(dataUrl))return state.imageCache.get(dataUrl);const img=new Image();const p=new Promise((res,rej)=>{img.onload=()=>res(img);img.onerror=rej;});img.src=dataUrl;const out=await p;state.imageCache.set(dataUrl,out);return out;}
function drawOverlay(){
  const c=el.overlayCanvas,ctx=c.getContext('2d'),dpr=clamp(window.devicePixelRatio||1,1,3),w=c.width/dpr,h=c.height/dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
  const z=state.zoom;
  anns().forEach((a,i)=>{
    ctx.save();
    if(a.type==='stroke'||a.type==='highlight'){
      ctx.strokeStyle=a.color||'#f00';ctx.globalAlpha=a.type==='highlight'?.35:1;ctx.lineWidth=Math.max(1,(a.width||1)*z);ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();a.points.forEach((p,j)=>j?ctx.lineTo(p.x*z,p.y*z):ctx.moveTo(p.x*z,p.y*z));ctx.stroke();
    } else if(a.type==='text'){
      ctx.translate(a.x*z,a.y*z);ctx.rotate((a.rotation||0)*Math.PI/180);ctx.fillStyle=a.color||'#000';ctx.font=`${(a.size||18)*z}px Arial,sans-serif`;ctx.textBaseline='top';(a.text||'').split('\n').forEach((line,k)=>ctx.fillText(line,0,k*(a.size||18)*1.25*z));
    } else if(a.type==='image'){
      const img=state.imageCache.get(a.dataUrl);if(img){const cx=(a.x+a.w/2)*z,cy=(a.y+a.h/2)*z;ctx.translate(cx,cy);ctx.rotate((a.rotation||0)*Math.PI/180);ctx.drawImage(img,-a.w*z/2,-a.h*z/2,a.w*z,a.h*z);}
    }
    ctx.restore();
  });
  if(state.dragMode==='box'&&state.selectionRect){const b=state.selectionRect;ctx.save();ctx.strokeStyle='#51a9ff';ctx.setLineDash([5,4]);ctx.lineWidth=2;ctx.strokeRect(b[0]*z,b[1]*z,(b[2]-b[0])*z,(b[3]-b[1])*z);ctx.restore();}
  const b=selectionBox();if(b){const x=b[0]*z,y=b[1]*z,wid=(b[2]-b[0])*z,hei=(b[3]-b[1])*z,cx=(b[0]+b[2])/2*z;ctx.save();ctx.strokeStyle='#0099ff';ctx.lineWidth=2;ctx.setLineDash([6,4]);ctx.strokeRect(x,y,wid,hei);ctx.setLineDash([]);ctx.fillStyle='#0099ff';ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.fillRect((b[2]*z)-8,(b[3]*z)-8,16,16);ctx.strokeRect((b[2]*z)-8,(b[3]*z)-8,16,16);ctx.beginPath();ctx.moveTo(cx,y);ctx.lineTo(cx,y-28);ctx.strokeStyle='#0099ff';ctx.stroke();ctx.beginPath();ctx.arc(cx,y-36,9,0,Math.PI*2);ctx.fillStyle='#16b87a';ctx.fill();ctx.strokeStyle='#fff';ctx.stroke();ctx.restore();}
}

function moveAnn(a,dx,dy){if(a.type==='stroke'||a.type==='highlight')a.points=a.points.map(p=>({x:p.x+dx,y:p.y+dy}));else{a.x+=dx;a.y+=dy;}return a;}
function scaleAnn(a,b,sx,sy){const[x0,y0]=b;if(a.type==='stroke'||a.type==='highlight'){a.points=a.points.map(p=>({x:x0+(p.x-x0)*sx,y:y0+(p.y-y0)*sy}));a.width=Math.max(1,(a.width||1)*(Math.abs(sx)+Math.abs(sy))/2);}else{a.x=x0+(a.x-x0)*sx;a.y=y0+(a.y-y0)*sy;if(a.type==='image'){a.w=Math.max(4,a.w*sx);a.h=Math.max(4,a.h*sy);}if(a.type==='text')a.size=clamp((a.size||18)*Math.abs(sy),6,144);}return a;}
function rotateAnn(a,b,deg){const cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2;if(a.type==='stroke'||a.type==='highlight')a.points=a.points.map(p=>rotatePoint(p.x,p.y,cx,cy,deg));else{const p=rotatePoint(a.x,a.y,cx,cy,deg);a.x=p.x;a.y=p.y;a.rotation=((a.rotation||0)+deg)%360;}return a;}

function setTool(t){state.tool=t;state.selected=[];document.querySelectorAll('.tool[data-tool]').forEach(b=>b.classList.toggle('active',b.dataset.tool===t));el.overlayCanvas.style.cursor=t==='select'?'default':t==='pan'?'grab':'crosshair';drawOverlay();setEnabled();}
document.querySelectorAll('.tool[data-tool]').forEach(b=>b.addEventListener('click',()=>setTool(b.dataset.tool)));

el.overlayCanvas.addEventListener('pointerdown',async e=>{
  if(!hasDoc())return;
  state.pinch.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(state.pinch.size===2){const pts=[...state.pinch.values()];state.pinchStartDistance=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);state.pinchStartZoom=state.zoom;return;}
  const p=canvasPoint(e);state.pointerDown=true;state.pointerId=e.pointerId;try{el.overlayCanvas.setPointerCapture(e.pointerId);}catch{}
  if(state.tool==='pan'){state.dragMode='pan';state.dragStart={x:e.clientX,y:e.clientY,sl:el.scrollArea.scrollLeft,st:el.scrollArea.scrollTop};return;}
  if(state.tool==='select'){
    const b=selectionBox();const hh=handleHit(p,b);if(hh&&state.selected.length){saveState();state.dragMode=hh;state.dragStart=p;state.dragSnapshot=state.selected.map(i=>[i,deep(anns()[i])]);return;}
    const hit=hitTest(p);if(hit!==null){state.selected=[hit];saveState();state.dragMode='move';state.dragStart=p;state.dragSnapshot=[[hit,deep(anns()[hit])]];drawOverlay();setEnabled();return;}
    state.selected=[];state.dragMode='box';state.selectionStart=p;state.selectionRect=[p.x,p.y,p.x,p.y];drawOverlay();setEnabled();return;
  }
  if(state.tool==='text'){state.pendingTextPoint=p;el.textInput.value='';if(el.textDialog.showModal)el.textDialog.showModal();else el.textDialog.setAttribute('open','');return;}
  if(state.tool==='erase'){saveState();eraseAt(p);state.dragMode='erase';return;}
  if(state.tool==='pen'||state.tool==='highlight'){
    saveState();const a={type:state.tool==='pen'?'stroke':'highlight',points:[p],color:state.tool==='highlight'?'#ffff00':el.colorPicker.value,width:state.tool==='highlight'?num(el.highlightWidth,16,1,80):num(el.penWidth,3,1,80),rotation:0};anns().push(a);state.currentStroke=a;state.dragMode='draw';drawOverlay();
  }
});

el.overlayCanvas.addEventListener('pointermove',e=>{
  if(state.pinch.has(e.pointerId)){state.pinch.set(e.pointerId,{x:e.clientX,y:e.clientY});if(state.pinch.size===2){const pts=[...state.pinch.values()],d=Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y);if(state.pinchStartDistance>0){state.zoom=clamp(state.pinchStartZoom*d/state.pinchStartDistance,.1,4);state.fitMode=false;renderPage(false);}return;}}
  if(!state.pointerDown||e.pointerId!==state.pointerId)return;
  if(state.dragMode==='pan'){el.scrollArea.scrollLeft=state.dragStart.sl-(e.clientX-state.dragStart.x);el.scrollArea.scrollTop=state.dragStart.st-(e.clientY-state.dragStart.y);return;}
  const p=canvasPoint(e);
  if(state.dragMode==='box'){const s=state.selectionStart;state.selectionRect=[Math.min(s.x,p.x),Math.min(s.y,p.y),Math.max(s.x,p.x),Math.max(s.y,p.y)];state.selected=anns().map((a,i)=>({i,b:bbox(a)})).filter(o=>o.b&&intersects(o.b,state.selectionRect)).map(o=>o.i);drawOverlay();setEnabled();return;}
  if(state.dragMode==='move'&&state.dragSnapshot){const dx=p.x-state.dragStart.x,dy=p.y-state.dragStart.y;state.dragSnapshot.forEach(([i,a])=>anns()[i]=moveAnn(deep(a),dx,dy));drawOverlay();return;}
  if(state.dragMode==='resize'&&state.dragSnapshot){const b=selectionBox(state.dragSnapshot.map(x=>x[0]));const sourceBoxes=state.dragSnapshot.map(([,a])=>bbox(a)).filter(Boolean);const gb=[Math.min(...sourceBoxes.map(x=>x[0])),Math.min(...sourceBoxes.map(x=>x[1])),Math.max(...sourceBoxes.map(x=>x[2])),Math.max(...sourceBoxes.map(x=>x[3]))];const sx=Math.max(.05,(p.x-gb[0])/Math.max(1,gb[2]-gb[0])),sy=Math.max(.05,(p.y-gb[1])/Math.max(1,gb[3]-gb[1]));state.dragSnapshot.forEach(([i,a])=>anns()[i]=scaleAnn(deep(a),gb,sx,sy));drawOverlay();return;}
  if(state.dragMode==='rotate'&&state.dragSnapshot){const sourceBoxes=state.dragSnapshot.map(([,a])=>bbox(a)).filter(Boolean);const gb=[Math.min(...sourceBoxes.map(x=>x[0])),Math.min(...sourceBoxes.map(x=>x[1])),Math.max(...sourceBoxes.map(x=>x[2])),Math.max(...sourceBoxes.map(x=>x[3]))],cx=(gb[0]+gb[2])/2,cy=(gb[1]+gb[3])/2;const a0=Math.atan2(state.dragStart.y-cy,state.dragStart.x-cx),a1=Math.atan2(p.y-cy,p.x-cx),deg=(a1-a0)*180/Math.PI;state.dragSnapshot.forEach(([i,a])=>anns()[i]=rotateAnn(deep(a),gb,deg));drawOverlay();return;}
  if(state.dragMode==='draw'&&state.currentStroke){state.currentStroke.points.push(p);drawOverlay();return;}
  if(state.dragMode==='erase')eraseAt(p);
});
function pointerEnd(e){state.pinch.delete(e.pointerId);if(state.pinch.size<2)state.pinchStartDistance=0;if(e.pointerId!==state.pointerId)return;state.pointerDown=false;state.pointerId=null;if(state.dragMode==='box'){state.selectionRect=null;state.selectionStart=null;}state.currentStroke=null;const changed=['move','resize','rotate','draw','erase'].includes(state.dragMode);state.dragMode=null;state.dragSnapshot=null;drawOverlay();setEnabled();if(changed)scheduleRecovery();}
el.overlayCanvas.addEventListener('pointerup',pointerEnd);el.overlayCanvas.addEventListener('pointercancel',pointerEnd);
function eraseAt(p){const r=num(el.eraserWidth,20,1,200)/2;const before=anns().length;state.annotations[state.pageIndex]=anns().filter(a=>{const b=bbox(a);if(!b)return true;const nx=clamp(p.x,b[0],b[2]),ny=clamp(p.y,b[1],b[3]);return Math.hypot(p.x-nx,p.y-ny)>r;});if(state.annotations[state.pageIndex].length!==before){state.selected=[];drawOverlay();}}

el.textForm.addEventListener('submit',e=>{e.preventDefault();const t=el.textInput.value;if(t&&state.pendingTextPoint){saveState();anns().push({type:'text',x:state.pendingTextPoint.x,y:state.pendingTextPoint.y,text:t,color:el.colorPicker.value,size:num(el.textSize,18,6,144),rotation:0});state.pendingTextPoint=null;el.textDialog.close?.();drawOverlay();scheduleRecovery();}});
el.cancelTextBtn.addEventListener('click',()=>{state.pendingTextPoint=null;el.textDialog.close?.();});
el.imageBtn.addEventListener('click',()=>el.imageInput.click());
el.imageInput.addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f)return;const dataUrl=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f);});const img=await loadImageFromDataUrl(dataUrl);saveState();const p=page(),w=p.width*.35,h=w*(img.height/img.width);const a={type:'image',dataUrl,x:p.width*.15,y:p.height*.15,w,h,rotation:0};anns().push(a);state.selected=[anns().length-1];drawOverlay();setEnabled();scheduleRecovery();e.target.value='';});

el.newBtn.addEventListener('click',()=>el.newDialog.showModal?el.newDialog.showModal():newPdf('Letter - Portrait'));el.emptyNewBtn.addEventListener('click',()=>el.newBtn.click());
el.newForm.addEventListener('submit',e=>{e.preventDefault();newPdf(el.pageSizeSelect.value);el.newDialog.close?.();});
el.importBtn.addEventListener('click',()=>el.pdfInput.click());el.emptyImportBtn.addEventListener('click',()=>el.pdfInput.click());el.pdfInput.addEventListener('change',e=>{importPdf(e.target.files?.[0]);e.target.value='';});
el.prevBtn.addEventListener('click',()=>{if(state.pageIndex>0){state.pageIndex--;state.selected=[];state.fitMode=true;renderPage();}});el.nextBtn.addEventListener('click',()=>{if(state.pageIndex<state.pages.length-1){state.pageIndex++;state.selected=[];state.fitMode=true;renderPage();}});
el.addPageBtn.addEventListener('click',()=>{saveState();const p=page();state.pages.splice(state.pageIndex+1,0,{kind:'blank',width:p.width,height:p.height});const na={};Object.keys(state.annotations).forEach(k=>{const n=+k;na[n>state.pageIndex?n+1:n]=state.annotations[k];});state.annotations=na;state.pageIndex++;state.annotations[state.pageIndex]=[];state.selected=[];state.fitMode=true;renderPage();scheduleRecovery();});
el.delPageBtn.addEventListener('click',()=>{if(state.pages.length<=1){toast('A PDF needs at least one page.');return;}saveState();state.pages.splice(state.pageIndex,1);const na={};Object.keys(state.annotations).forEach(k=>{const n=+k;if(n===state.pageIndex)return;na[n>state.pageIndex?n-1:n]=state.annotations[k];});state.annotations=na;state.pageIndex=Math.min(state.pageIndex,state.pages.length-1);state.selected=[];state.fitMode=true;renderPage();scheduleRecovery();});
el.undoBtn.addEventListener('click',undo);el.redoBtn.addEventListener('click',redo);el.deleteSelectedBtn.addEventListener('click',()=>{if(!state.selected.length)return;saveState();for(const i of [...state.selected].sort((a,b)=>b-a))anns().splice(i,1);state.selected=[];drawOverlay();setEnabled();scheduleRecovery();});
el.clearPageBtn.addEventListener('click',()=>{if(!anns().length)return;saveState();state.annotations[state.pageIndex]=[];state.selected=[];drawOverlay();setEnabled();scheduleRecovery();});
el.zoomInBtn.addEventListener('click',()=>{state.zoom=clamp(state.zoom*1.15,.1,4);state.fitMode=false;renderPage(false);});el.zoomOutBtn.addEventListener('click',()=>{state.zoom=clamp(state.zoom/1.15,.1,4);state.fitMode=false;renderPage(false);});el.applyZoomBtn.addEventListener('click',()=>{state.zoom=clamp(num(el.zoomInput,100,10,400)/100,.1,4);state.fitMode=false;renderPage(false);});el.fitBtn.addEventListener('click',fitPage);

function copySelected(){state.clipboard=state.selected.map(i=>deep(anns()[i]));}
function pasteSelected(){if(!state.clipboard.length)return;saveState();const start=anns().length;state.clipboard.forEach(a=>anns().push(moveAnn(deep(a),12,12)));state.selected=state.clipboard.map((_,i)=>start+i);drawOverlay();setEnabled();scheduleRecovery();}
function keyTransform(k){if(!state.selected.length)return;saveState();const b=selectionBox();state.selected.forEach(i=>{let a=deep(anns()[i]);if(k==='r')a=rotateAnn(a,b,5);if(k==='1')a=scaleAnn(a,b,1.05,1);if(k==='3')a=scaleAnn(a,b,.95,1);if(k==='2')a=scaleAnn(a,b,1,1.05);if(k==='4')a=scaleAnn(a,b,1,.95);anns()[i]=a;});drawOverlay();scheduleRecovery();}
window.addEventListener('keydown',e=>{if(editableTarget(e.target))return;const cmd=e.ctrlKey||e.metaKey,k=e.key.toLowerCase();if(cmd&&k==='z'){e.preventDefault();undo();}else if(cmd&&k==='y'){e.preventDefault();redo();}else if(cmd&&k==='c'){e.preventDefault();copySelected();}else if(cmd&&k==='v'){e.preventDefault();pasteSelected();}else if(cmd&&k==='s'){e.preventDefault();exportPdf();}else if(cmd&&e.key==='0'){e.preventDefault();fitPage();}else if(e.key==='Delete'||e.key==='Backspace'){if(state.selected.length){e.preventDefault();el.deleteSelectedBtn.click();}}else if(['s','p','e','h','t'].includes(k)){const map={s:'select',p:'pen',e:'erase',h:'highlight',t:'text'};setTool(map[k]);}else if(['r','1','2','3','4'].includes(k))keyTransform(k);else if(e.key==='PageUp'){e.preventDefault();el.prevBtn.click();}else if(e.key==='PageDown'){e.preventDefault();el.nextBtn.click();}});

async function exportPdf(){if(!hasDoc())return;try{el.saveBtn.disabled=true;el.saveBtn.textContent='Saving…';const {PDFDocument,StandardFonts,rgb,degrees}=await ensurePdfLib();let src=state.sourceBytes?await PDFDocument.load(state.sourceBytes.slice()):null;const out=await PDFDocument.create();const font=await out.embedFont(StandardFonts.Helvetica);
  for(let pi=0;pi<state.pages.length;pi++){const p=state.pages[pi];let op;if(p.kind==='source'){const [cp]=await out.copyPages(src,[p.sourcePage-1]);op=out.addPage(cp);}else op=out.addPage([p.width,p.height]);
    const ph=op.getHeight();for(const a of state.annotations[pi]||[]){const hex=(a.color||'#000000').replace('#','');const n=parseInt(hex,16);const color=rgb(((n>>16)&255)/255,((n>>8)&255)/255,(n&255)/255);
      if(a.type==='text'){const lines=(a.text||'').split('\n');lines.forEach((line,j)=>op.drawText(line||' ',{x:a.x,y:ph-(a.y+j*a.size*1.25)-a.size,size:a.size,font,color,rotate:degrees(-(a.rotation||0))}));}
      else if((a.type==='stroke'||a.type==='highlight')&&a.points.length>1){for(let j=1;j<a.points.length;j++){op.drawLine({start:{x:a.points[j-1].x,y:ph-a.points[j-1].y},end:{x:a.points[j].x,y:ph-a.points[j].y},thickness:a.width,color,opacity:a.type==='highlight'?.35:1});}}
      else if(a.type==='image'){try{const bytes=await fetch(a.dataUrl).then(r=>r.arrayBuffer());const img=a.dataUrl.startsWith('data:image/png')?await out.embedPng(bytes):await out.embedJpg(bytes);op.drawImage(img,{x:a.x,y:ph-a.y-a.h,width:a.w,height:a.h,rotate:degrees(-(a.rotation||0))});}catch(err){console.warn('image export',err);}}
    }
  }
  const bytes=await out.save(),blob=new Blob([bytes],{type:'application/pdf'}),file=new File([blob],state.filename,{type:'application/pdf'});if(navigator.canShare?.({files:[file]})&&/iPhone|iPad|iPod/i.test(navigator.userAgent)){await navigator.share({files:[file],title:state.filename});}else{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=state.filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);}await clearRecovery();toast('PDF saved.');
}catch(e){console.error(e);toast('Save failed.');}finally{el.saveBtn.textContent='Save As';setEnabled();}}
el.saveBtn.addEventListener('click',exportPdf);

const DB='SimplePDFEditorRecoveryV2',STORE='drafts',KEY='current';
function openDb(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>{const db=r.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE,{keyPath:'id'});};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
function serializableAnnotations(){const o={};for(const[k,v]of Object.entries(state.annotations))o[k]=v.map(a=>{const c={...a};delete c.img;return c;});return o;}
async function saveRecovery(){if(!hasDoc())return;try{const db=await openDb();const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put({id:KEY,ts:Date.now(),filename:state.filename,sourceBytes:state.sourceBytes?state.sourceBytes.slice():null,pages:deep(state.pages),annotations:serializableAnnotations(),pageIndex:state.pageIndex,zoom:state.zoom});await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});db.close();}catch(e){console.warn('Recovery save failed',e);}}
function scheduleRecovery(){clearTimeout(state.autosaveTimer);state.autosaveTimer=setTimeout(saveRecovery,650);}
async function clearRecovery(){try{const db=await openDb();const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(KEY);db.close();}catch{}}
async function restoreRecovery(){try{const db=await openDb();const rec=await new Promise((res,rej)=>{const tx=db.transaction(STORE);const r=tx.objectStore(STORE).get(KEY);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});db.close();if(!rec)return;if(Date.now()-rec.ts>30*864e5){clearRecovery();return;}if(!confirm(`Recover unsaved PDF?\n\n${rec.filename||'Unsaved PDF'}`))return clearRecovery();state.filename=rec.filename||'recovered.pdf';state.sourceBytes=rec.sourceBytes?new Uint8Array(rec.sourceBytes):null;state.pages=rec.pages||[];state.annotations=rec.annotations||{};state.pageIndex=clamp(rec.pageIndex||0,0,Math.max(0,state.pages.length-1));if(state.sourceBytes){const pdfjs=await ensurePdfJs();state.pdf=await pdfjs.getDocument({data:state.sourceBytes.slice()}).promise;}for(const arr of Object.values(state.annotations))for(const a of arr)if(a.type==='image'&&a.dataUrl)loadImageFromDataUrl(a.dataUrl).then(drawOverlay);state.fitMode=true;showEditor();await renderPage();toast('Recovery restored.');}catch(e){console.warn('Recovery restore failed',e);}}

el.toolsToggleBtn?.addEventListener('click',()=>{const open=el.toolbarWrap.classList.toggle('mobile-open');el.toolsToggleBtn.setAttribute('aria-expanded',String(open));el.toolsToggleBtn.textContent=open?'Close':'Tools';setTimeout(()=>{if(state.fitMode&&hasDoc())fitPage();},60);});
let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(state.fitMode&&hasDoc())fitPage();},150);});window.addEventListener('orientationchange',()=>setTimeout(()=>{if(hasDoc())fitPage();},250));
setTool('select');setEnabled();restoreRecovery();
})();
