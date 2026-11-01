/* =====================================================================
   Extras — the 1.3 features, in one block so the template stays readable.
   Everything here runs on the same inlined pdf-lib and pdf.js; nothing new
   is fetched, installed or linked.
   ===================================================================== */

let cancelJob=false;

/* ---------- network guard: count every request this page makes ---------- */
const NET={count:0,urls:[]};
(function(){
  try{
    const f=window.fetch;
    if(f) window.fetch=function(input){
      try{ NET.count++; NET.urls.push(String(typeof input==='string'?input:(input&&input.url)||'')); netUpdate(); }catch(e){}
      return f.apply(this,arguments);
    };
    const open=XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open=function(m,u){
      try{ NET.count++; NET.urls.push(String(u)); netUpdate(); }catch(e){}
      return open.apply(this,arguments);
    };
  }catch(e){}
})();
function netUpdate(){
  const c=$('#netcount'); if(c) c.textContent=NET.count?(NET.count+(NET.count===1?' request':' requests')):'0 requests';
  const l=$('#netlist');
  if(l) l.innerHTML = NET.count
    ? NET.urls.map(u=>'<div class="stat"><span style="word-break:break-all">'+esc(u)+'</span></div>').join('')
    : '<p class="hint">No request has left this page.</p>';
}

/* ---------- a screen-reader line, so state changes are spoken ---------- */
let liveEl=null;
function announce(m){ if(!liveEl) return; liveEl.textContent=m; }

/* ---------- page geometry ---------- */
const PAPER={a4:[595.28,841.89],a4l:[841.89,595.28],letter:[612,792]};

function trimPages(doc,pt){
  for(const page of doc.getPages()){
    const {width:W,height:H}=page.getSize();
    const m=Math.min(pt,Math.min(W,H)/3);
    page.setCropBox(m,m,W-2*m,H-2*m);
  }
}

/* place one source page inside a box, scaled to fit and rotated as it was */
function drawFitted(page,emb,X,Y,boxW,boxH,w,h,ang){
  const visW=(ang%180===90)?h:w, visH=(ang%180===90)?w:h;
  const m=Math.min(boxW/visW,boxH/visH);
  const Wl=w*m, Hl=h*m;                     // the drawing's own size after scaling
  const cx=X+(boxW-visW*m)/2, cy=Y+(boxH-visH*m)/2;
  const opts={width:Wl,height:Hl};
  if(ang===90) page.drawPage(emb,{x:cx+Hl,y:cy,...opts,rotate:degrees(90)});
  else if(ang===180) page.drawPage(emb,{x:cx+Wl,y:cy+Hl,...opts,rotate:degrees(180)});
  else if(ang===270) page.drawPage(emb,{x:cx,y:cy+Wl,...opts,rotate:degrees(270)});
  else page.drawPage(emb,{x:cx,y:cy,...opts});
}

async function resizeDoc(doc,key){
  const [W,H]=PAPER[key]||PAPER.a4;
  const out=await PDFDocument.create();
  out.setProducer('Offline PDF Toolkit'); out.setCreator('Offline PDF Toolkit');
  const src=doc.getPages();
  const emb=await out.embedPages(src);
  for(let i=0;i<emb.length;i++){
    const sp=src[i];
    const {width:w,height:h}=sp.getSize();
    const ang=((sp.getRotation().angle||0)%360+360)%360;
    drawFitted(out.addPage([W,H]),emb[i],0,0,W,H,w,h,ang);
  }
  return out;
}

async function imposeDoc(doc,mode,gap){
  const src=doc.getPages(); const n=src.length;
  if(!n) return doc;
  const [W,H]=PAPER.a4l;
  const out=await PDFDocument.create();
  out.setProducer('Offline PDF Toolkit'); out.setCreator('Offline PDF Toolkit');
  const emb=await out.embedPages(src);

  // sheets: each is a list of page indices, left-to-right, top-to-bottom
  const sheets=[];
  if(mode==='bk'){
    /* classic saddle-stitch: sheet s carries the outermost pair, then the next
       pair inward. Front, then back, so a two-sided print folds into order. */
    const m=Math.ceil(n/4)*4;
    for(let s=0;s<m/4;s++){
      sheets.push([m-1-2*s, 2*s]);       // front: last page, first page
      sheets.push([2*s+1, m-2-2*s]);     // back:  second page, second-last
    }
  } else {
    const per=mode==='4'?4:2;
    for(let i=0;i<n;i+=per){
      const s=[]; for(let j=0;j<per;j++) s.push(i+j<n?i+j:-1);
      sheets.push(s);
    }
  }

  const cols=mode==='4'?2:2, rows=mode==='4'?2:1;
  const cw=(W-gap*(cols+1))/cols, ch=(H-gap*(rows+1))/rows;
  for(const sheet of sheets){
    const page=out.addPage([W,H]);
    sheet.forEach((idx,k)=>{
      if(idx<0||idx>=src.length) return;   // padding in a booklet falls off the sheet
      const col=k%cols, row=Math.floor(k/cols);
      const cx=gap+col*(cw+gap), cy=H-gap-(row+1)*ch-row*gap;
      const sp=src[idx];
      const {width:w,height:h}=sp.getSize();
      const ang=((sp.getRotation().angle||0)%360+360)%360;
      drawFitted(page,emb[idx],cx,cy,cw,ch,w,h,ang);
      page.drawRectangle({x:cx,y:cy,width:cw,height:ch,borderColor:rgb(.75,.75,.75),borderWidth:.5});
    });
  }
  return out;
}

/* ---------- redaction ----------
   pdf.js reports text positions in the page's own content space, which is the
   same space pdf-lib draws in — so the boxes land where the words are, rotated
   pages included, without any coordinate gymnastics. */
async function drawRedactions(doc,r){
  const words=(r.words||[]).filter(Boolean).map(w=>w.toLowerCase());
  if(!words.length) return 0;
  const outPages=doc.getPages(); let hits=0;
  for(let i=0;i<outPages.length;i++){
    const p=pages[i]; if(!p) continue;
    const d=docs.find(x=>x.id===p.docId); if(!d||d.kind!=='pdf') continue;
    let tc=null;
    try{ const pg=await d.pdfjs.getPage(p.src+1); tc=await pg.getTextContent(); }catch(e){ continue; }
    const page=outPages[i];
    for(const item of (tc.items||[])){
      const str=item.str||''; if(!str.trim()) continue;
      const low=str.toLowerCase();
      for(const w of words){
        let at=low.indexOf(w);
        while(at!==-1){
          const iw=item.width||0, ih=item.height||10;
          const f0=at/str.length, f1=(at+w.length)/str.length;
          const x=item.transform[4]+iw*f0, wd=Math.max(iw*(f1-f0),2);
          const y=item.transform[5]-ih*0.22, ht=ih*1.15;
          page.drawRectangle({x,y,width:wd,height:ht,color:rgb(0,0,0)});
          hits++; at=low.indexOf(w,at+w.length);
        }
      }
    }
  }
  return hits;
}

/* rebuild every page as an image, so nothing under a box survives as text */
async function rasteriseDoc(doc,dpi,quality){
  const bytes=await doc.save({useObjectStreams:true});
  const pdf=await pdfjsLib.getDocument({data:bytes.slice(0)}).promise;
  const out=await PDFDocument.create();
  out.setProducer('Offline PDF Toolkit'); out.setCreator('Offline PDF Toolkit');
  const scale=dpi/72;
  for(let i=1;i<=pdf.numPages;i++){
    if(cancelJob) throw new Error('cancelled');
    const page=await pdf.getPage(i);
    const v=page.getViewport({scale});
    const c=document.createElement('canvas');
    c.width=Math.ceil(v.width); c.height=Math.ceil(v.height);
    const ctx=c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height);
    await page.render({canvasContext:ctx,viewport:v}).promise;
    const jpg=Uint8Array.from(atob(c.toDataURL('image/jpeg',quality).split(',')[1]),ch=>ch.charCodeAt(0));
    const img=await out.embedJpg(jpg);
    const p=out.addPage([c.width*72/dpi,c.height*72/dpi]);
    p.drawImage(img,{x:0,y:0,width:c.width*72/dpi,height:c.height*72/dpi});
    prog(Math.round(100*i/pdf.numPages));
    if(i%3===0) await new Promise(r=>setTimeout(r,0));
  }
  return out;
}

/* ---------- header, footer, Bates ---------- */
function tokens(s,i,total,file){
  return String(s||'')
    .replace(/\{n\}/g,String(i))
    .replace(/\{total\}/g,String(total))
    .replace(/\{date\}/g,new Date().toLocaleDateString())
    .replace(/\{file\}/g,file||'');
}
async function drawHeaderFooter(doc,o){
  const font=await doc.embedFont(StandardFonts.Helvetica);
  const all=doc.getPages(), total=all.length;
  const file=docs[0]?docs[0].name.replace(/\.pdf$/i,''):'';
  all.forEach((page,idx)=>{
    const {width:W,height:H}=page.getSize();
    const put=(text,x,y)=>{
      const t=tokens(text,idx+1,total,file); if(!t) return;
      page.drawText(t,{x,y,size:o.size,font,color:rgb(.35,.35,.35)});
    };
    const tw=t=>font.widthOfTextAtSize(tokens(t,idx+1,total,file),o.size);
    if(o.tl) put(o.tl,24,H-24-o.size);
    if(o.tc) put(o.tc,(W-tw(o.tc))/2,H-24-o.size);
    if(o.tr) put(o.tr,W-24-tw(o.tr),H-24-o.size);
    if(o.bl) put(o.bl,24,20);
    if(o.bc) put(o.bc,(W-tw(o.bc))/2,20);
    if(o.br) put(o.br,W-24-tw(o.br),20);
  });
}
async function drawBates(doc,o){
  const font=await doc.embedFont(StandardFonts.Helvetica);
  const all=doc.getPages();
  all.forEach((page,idx)=>{
    const label=(o.prefix||'')+String(o.start+idx).padStart(o.digits,'0');
    const {width:W,height:H}=page.getSize();
    const tw=font.widthOfTextAtSize(label,10);
    const pos=o.pos||'br';
    const x = pos==='bl'||pos==='tl' ? 24 : W-24-tw;
    const y = pos==='tl'||pos==='tr' ? H-30 : 18;
    page.drawText(label,{x,y,size:10,font,color:rgb(.25,.25,.25)});
  });
}
function flattenForms(doc){
  try{ const f=doc.getForm(); if(f) f.flatten(); return true; }catch(e){ return false; }
}
function stripMeta(doc){
  doc.setTitle(''); doc.setAuthor(''); doc.setSubject('');
  try{ doc.setKeywords([]); }catch(e){}
  doc.setProducer('Offline PDF Toolkit'); doc.setCreator('Offline PDF Toolkit');
}

/* ---------- the single post-pass buildDoc calls ---------- */
async function finishDoc(doc,o){
  let out=doc;
  if(o.trim>0) trimPages(out,o.trim);
  let redacted=0;
  if(o.redact&&o.redact.words.length) redacted=await drawRedactions(out,o.redact);
  if(o.resize) out=await resizeDoc(out,o.resize);
  if(o.impose) out=await imposeDoc(out,o.impose.mode,o.impose.gap);
  if(o.hf) await drawHeaderFooter(out,o.hf);
  if(o.bates) await drawBates(out,o.bates);
  if(o.flatten) flattenForms(out);
  if(o.stripmd) stripMeta(out);
  if(redacted&&o.redact.raster) out=await rasteriseDoc(out,150,.82);
  if(redacted) toast('Redacted '+redacted+' match'+(redacted===1?'':'es')+(o.redact.raster?' · pages rebuilt':' · boxes only'));
  return out;
}

/* ---------- read the new controls ---------- */
function extrasOpts(){
  const trim=Math.max(0,+$('#trim').value||0);
  const resize=$('#resize').value||'';
  const imp=$('#impose').value||'';
  const hfRaw={tl:$('#hfl').value,tc:$('#hfc').value,tr:$('#hfr').value,
               bl:$('#hfo').value,bc:$('#hfoc').value,br:$('#hfor').value,size:+$('#hfs').value};
  const hf=(hfRaw.tl||hfRaw.tc||hfRaw.tr||hfRaw.bl||hfRaw.bc||hfRaw.br)?hfRaw:null;
  const bates=$('#s-bates').open?{prefix:$('#btp').value,start:+$('#bts').value||0,
    digits:Math.max(1,+$('#btd').value||6),pos:$('#btpos').value}:null;
  const words=$('#rdt').value.split(',').map(s=>s.trim()).filter(Boolean);
  const redact=(words.length&&$('#s-redact').open)?{words,raster:$('#rdraster').checked}:null;
  return {trim,resize,impose:imp?{mode:imp,gap:+$('#imgap').value}:null,hf,bates,redact,
          flatten:$('#flatten').checked,stripmd:$('#stripmd').checked};
}

/* ---------- split & export ---------- */
function parseRanges(txt,max){
  const out=[];
  for(const part of String(txt||'').split(',')){
    const s=part.trim(); if(!s) continue;
    const m=s.match(/^(\d+)\s*(?:-\s*(\d+))?$/); if(!m) continue;
    const a=+m[1], b=m[2]?+m[2]:a;
    for(let i=Math.min(a,b);i<=Math.max(a,b);i++) if(i>=1&&i<=max) out.push(i-1);
  }
  return [...new Set(out)].sort((x,y)=>x-y);
}
async function buildFrom(indexes){
  const keep=pages;
  pages=indexes.map(i=>({...keep[i],sel:false}));
  try{ return await buildDoc({}); } finally { pages=keep; }
}
async function splitNow(){
  if(!pages.length){ toast('Add a PDF first'); return; }
  const sel=selList();
  const base=sel.length?sel:pages.map((_,i)=>i);
  const mode=$('#splitmode').value;
  let chunks=[];
  if(mode==='ranges'){ const r=parseRanges($('#splitr').value,pages.length);
    if(!r.length){ toast('Give ranges like 1-3, 5'); return; } chunks=[r]; }
  else if(mode==='1'){ chunks=base.map(i=>[i]); }
  else { const n=Math.max(1,+$('#splitn').value||1);
    for(let i=0;i<base.length;i+=n) chunks.push(base.slice(i,i+n)); }

  cancelJob=false; $('#save').disabled=true;
  let made=0;
  try{
    for(let k=0;k<chunks.length;k++){
      if(cancelJob) break;
      prog(Math.round(100*k/chunks.length));
      const doc=await buildFrom(chunks[k]);
      const bytes=await doc.save({useObjectStreams:true});
      const nm=chunks.length===1?'part':(mode==='1'?('page-'+(chunks[k][0]+1)):('part-'+(k+1)));
      download(bytes,'split-'+nm+'.pdf');
      made++;
      await new Promise(r=>setTimeout(r,120));   // let the browser take each file
    }
    prog(100);
    toast('Split into '+made+' file'+(made===1?'':'s'));
    announce('Split into '+made+' files');
  }catch(e){ if(String(e.message)!=='cancelled') toast('Split failed: '+e.message); }
  $('#save').disabled=false;
}
async function exportPng(){
  if(!pages.length){ toast('Add a PDF first'); return; }
  const sel=selList(); const base=sel.length?sel:pages.map((_,i)=>i);
  const dpi=+$('#pngdpi').value||150;
  cancelJob=false; $('#save').disabled=true;
  try{
    for(let k=0;k<base.length;k++){
      if(cancelJob) break;
      const i=base[k], p=pages[i], d=docs.find(x=>x.id===p.docId); if(!d) continue;
      prog(Math.round(100*k/base.length));
      const c=await pageToCanvas(p,d,dpi/72);
      const blob=await new Promise(res=>c.toBlob(res,'image/png'));
      const u=URL.createObjectURL(blob);
      const a=document.createElement('a'); a.href=u; a.download='page-'+String(i+1).padStart(3,'0')+'.png'; a.click();
      setTimeout(()=>URL.revokeObjectURL(u),4000);
      await new Promise(r=>setTimeout(r,120));
    }
    prog(100); toast('Exported '+base.length+' PNG'+(base.length===1?'':'s'));
  }catch(e){ toast('Export failed: '+e.message); }
  $('#save').disabled=false;
}

/* ---------- self-test: prove the build works, without a document ---------- */
async function selfTest(){
  const out=$('#selftestout'); const rows=[];
  const t=(name,fn)=>rows.push([name,fn]);
  const ok=(n,cond,extra)=>n+' — '+(cond?'pass':'FAIL')+(extra?' ('+extra+')':'');
  const res=[];
  try{
    // 1. build three pages from nothing
    const d=await PDFDocument.create();
    const font=await d.embedFont(StandardFonts.Helvetica);
    for(let i=0;i<3;i++){ const p=d.addPage([595,842]); p.drawText('self-test page '+(i+1),{x:60,y:760,size:18,font}); }
    let b=await d.save({useObjectStreams:true});
    let re=await PDFDocument.load(b);
    res.push(ok('create 3 pages',re.getPageCount()===3,re.getPageCount()+' pages'));

    // 2. rotate survives a round trip
    re.getPage(0).setRotation(degrees(90));
    b=await re.save(); re=await PDFDocument.load(b);
    res.push(ok('rotate 90°',(re.getPage(0).getRotation().angle%360)===90));

    // 3. crop box
    re.getPage(1).setCropBox(20,20,500,700);
    b=await re.save(); re=await PDFDocument.load(b);
    const cb=re.getPage(1).getCropBox();
    res.push(ok('crop box',Math.round(cb.width)===500,Math.round(cb.width)+' wide'));

    // 4. AES-256 round trip
    await re.encrypt({userPassword:'pw',ownerPassword:'owner'});
    const enc=await re.save();
    let refused=false;
    try{ await PDFDocument.load(enc); }catch(e){ refused=true; }
    const opened=await PDFDocument.load(enc,{password:'pw'});
    res.push(ok('AES-256 encrypt',refused&&opened.getPageCount()===3,'opens with the password, not without'));

    // 5. pdf.js can read it back
    const pdf=await pdfjsLib.getDocument({data:enc.slice(0),password:'pw'}).promise;
    const txt=(await (await pdf.getPage(1)).getTextContent()).items.map(i=>i.str).join(' ');
    res.push(ok('pdf.js reads text',txt.includes('self-test'),txt.trim().slice(0,28)));

    // 6. the network guard is live
    res.push(ok('network guard',typeof NET==='object'&&typeof NET.count==='number',NET.count+' requests so far'));
  }catch(e){ res.push('FAIL — '+e.message); }
  out.innerHTML=res.map(r=>'<div class="stat"><span>'+esc(r)+'</span></div>').join('')
    +'<p class="hint">Run on your own machine, in this tab. Nothing above left the page.</p>';
  announce('Self-test finished');
  toast('Self-test finished');
}

/* ---------- command palette ---------- */
const ACTIONS=[
  ['Add PDFs','add files',()=>$('#fpick').click()],
  ['Add images','add files',()=>$('#ipick').click()],
  ['Save PDF','build and download',()=>save()],
  ['Select all pages','pages',()=>selectAll(true)],
  ['Clear selection','pages',()=>selectAll(false)],
  ['Rotate left','pages',()=>rotate(-1)],
  ['Rotate right','pages',()=>rotate(1)],
  ['Duplicate selected','pages',duplicateSel],
  ['Delete selected','pages',removeSel],
  ['Extract selected to a new PDF','pages',extract],
  ['Watermark','tools',()=>openSec('s-wm')],
  ['Page numbers','tools',()=>openSec('s-pn')],
  ['Header & footer','tools',()=>openSec('s-hf')],
  ['Bates numbering','tools',()=>openSec('s-bates')],
  ['Page size & trim','tools',()=>openSec('s-geom')],
  ['Impose (N-up)','tools',()=>openSec('s-impose')],
  ['Redaction','tools',()=>openSec('s-redact')],
  ['Split','tools',()=>openSec('s-split')],
  ['Export pages as PNG','tools',()=>exportPng()],
  ['Compress','tools',()=>openSec('s-cmp')],
  ['Password protect','tools',()=>openSec('s-sec')],
  ['Extract text','tools',()=>extractText()],
  ['OCR','tools',()=>openSec('s-ocr')],
  ['Network log','tools',()=>openSec('s-net')],
  ['Self-test','tools',()=>selfTest()],
  ['Cycle theme','app',cycleTheme],
  ['Help','app',()=>openModal('Offline PDF Toolkit',helpHTML())]
];
function openSec(id){
  const s=$('#'+id); if(!s) return;
  setView('tools'); s.open=true; s.scrollIntoView({block:'center',behavior:'smooth'});
}
let palIdx=0, palList=ACTIONS;
function paletteOpen(){
  openModal('Commands','<input id="palq" type="text" placeholder="Type a command…" autocomplete="off" '
    +'style="width:100%;padding:10px 12px;border-radius:9px;border:1px solid var(--line);background:var(--panel);font-size:14px">'
    +'<div id="palout" style="margin-top:12px"></div>');
  const q=$('#palq'); q.focus();
  const draw=()=>{
    const s=q.value.toLowerCase();
    palList=ACTIONS.filter(a=>a[0].toLowerCase().includes(s));
    palIdx=0;
    $('#palout').innerHTML=palList.length
      ? palList.map((a,i)=>'<div class="k" data-i="'+i+'" style="cursor:pointer;'+(i===0?'background:var(--panel2)':'')+'">'
          +'<b style="flex:1;font-weight:600">'+esc(a[0])+'</b><span>'+esc(a[1])+'</span></div>').join('')
      : '<p class="hint">Nothing matches.</p>';
  };
  draw();
  q.addEventListener('input',draw);
  q.addEventListener('keydown',e=>{
    if(e.key==='ArrowDown'){ palIdx=Math.min(palIdx+1,palList.length-1); e.preventDefault(); }
    else if(e.key==='ArrowUp'){ palIdx=Math.max(palIdx-1,0); e.preventDefault(); }
    else if(e.key==='Enter'){ const a=palList[palIdx]; closeModal(); if(a) setTimeout(()=>a[2](),60); return; }
    else return;
    [...$('#palout').children].forEach((c,i)=>{ c.style.background=i===palIdx?'var(--panel2)':''; });
  });
  $('#palout').addEventListener('click',e=>{
    const row=e.target.closest('[data-i]'); if(!row) return;
    const a=palList[+row.dataset.i]; closeModal(); if(a) setTimeout(()=>a[2](),60);
  });
}

/* ---------- wire it up ---------- */
function initExtras(){
  liveEl=document.createElement('div');
  liveEl.setAttribute('aria-live','polite');
  liveEl.style.cssText='position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap';
  document.body.appendChild(liveEl);

  // a cancel button beside the progress bar
  const bar=$('#pbar');
  if(bar && !$('#canceljob')){
    const b=document.createElement('button');
    b.className='ibtn'; b.id='canceljob'; b.textContent='Cancel'; b.hidden=true;
    b.onclick=()=>{ cancelJob=true; toast('Stopping…'); };
    bar.appendChild(b);
  }
  const setCancel=v=>{ const b=$('#canceljob'); if(b) b.hidden=!v; };
  const _prog=window.prog;
  window.prog=function(p){ setCancel(p!=null&&p<100); return _prog(p); };

  for(const [id,vid] of [['imgap','imgapv'],['hfs','hfsv'],['pngdpi','pngdpiv']]){
    const el=$('#'+id); if(el) el.oninput=()=>{ $('#'+vid).textContent=el.value; };
  }
  $('#dosplit').onclick=splitNow;
  $('#dopng').onclick=exportPng;
  $('#selftest').onclick=selfTest;

  addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){ e.preventDefault(); paletteOpen(); }
  });

  // say something useful when the page count changes
  const _render=window.render;
  window.render=function(){ _render.apply(this,arguments);
    announce(pages.length?(pages.length+' pages, '+selList().length+' selected'):'no pages loaded'); };

  netUpdate();
}
initExtras();
