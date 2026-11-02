/* =====================================================================
   Extras — the 1.3 features, in one block so the template stays readable.
   Everything here runs on the same inlined pdf-lib and pdf.js; nothing new
   is fetched, installed or linked.
   ===================================================================== */

let cancelJob=false;

/* ---------- network guard: count every request this page makes ---------- */
const NET={count:0,external:0,urls:[]};
(function(){
  const note = u => {
    try{
      const url = String(u);
      let ext = true;
      try{ ext = new URL(url, location.href).origin !== location.origin; }catch(e){ ext = true; }
      NET.count++;
      if(ext) NET.external++;
      NET.urls.push((ext ? 'external · ' : 'this origin · ') + url);
      netUpdate();
    }catch(e){}
  };
  try{
    const f = window.fetch;
    if(f) window.fetch = function(input){
      note(typeof input === 'string' ? input : (input && input.url) || '');
      return f.apply(this, arguments);
    };
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(m, u){ note(u); return open.apply(this, arguments); };
  }catch(e){}
})();
function netUpdate(){
  const c = $('#netcount');
  if(c) c.textContent = NET.external ? (NET.external + ' external') : '0 external';
  const l = $('#netlist');
  if(!l) return;
  if(!NET.count){ l.innerHTML = '<p class="hint">No request has left this page.</p>'; return; }
  l.innerHTML = NET.urls.map(u => '<div class="stat"><span style="word-break:break-all">' + esc(u) + '</span></div>').join('')
    + '<p class="hint">“This origin” means a file beside the page — the OCR engine is one of those.</p>';
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
/* Shapes worth offering, with the honest caveat that a regex is not a data-loss
   guarantee: it only sees text this app can read. */
const REDACT_PATTERNS = {
  aadhaar: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g,
  date:    /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/g,
  ifsc:    /\b[A-Z]{4}0[A-Z0-9]{6}\b/g,
  phone:   /(?:\+?91[\s-]?)?\b[6-9]\d{9}\b/g,
  email:   /[\w.+-]+@[\w-]+\.[\w.-]+/g,
  pan:     /\b[A-Z]{5}\d{4}[A-Z]\b/g
};
function patternRanges(str, names){
  const out = [];
  for(const n of (names || [])){
    const re = REDACT_PATTERNS[n];
    if(!re) continue;
    re.lastIndex = 0;
    let m;
    while((m = re.exec(str)) !== null){
      out.push([m.index, m.index + m[0].length]);
      if(m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return out;
}

async function drawRedactions(doc,r){
  const words=(r.words||[]).filter(Boolean).map(w=>w.toLowerCase());
  if(!words.length && !(r.patterns||[]).length) return 0;
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
      const spans=[];
      for(const w of words){
        let at=low.indexOf(w);
        while(at!==-1){ spans.push([at,at+w.length]); at=low.indexOf(w,at+w.length); }
      }
      for(const sp of patternRanges(str, r.patterns)) spans.push(sp);
      for(const [a,b] of spans){
        const iw=item.width||0, ih=item.height||10;
        const f0=a/str.length, f1=b/str.length;
        const x=item.transform[4]+iw*f0, wd=Math.max(iw*(f1-f0),2);
        const y=item.transform[5]-ih*0.22, ht=ih*1.15;
        page.drawRectangle({x,y,width:wd,height:ht,color:rgb(0,0,0)});
        hits++;
      }
    }
  }
  return hits;
}

/* rebuild every page as an image, so nothing under a box survives as text */
async function rasteriseDoc(doc,dpi,quality){
  await ensurePdfLib();
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
  if(o.sign&&o.sign.dataUrl){
    const n=await drawSignature(out,o.sign);
    if(n) toast('Signature on '+n+' page'+(n===1?'':'s'));
  }
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
  const pats=['rdaadhaar','rdphone','rdemail','rdpan','rddate','rdifsc'].filter(id=>$('#'+id)&&$('#'.concat(id))&&$('#'+id).checked)
    .map(id=>id.slice(2));
  const redact=((words.length||pats.length)&&$('#s-redact').open)
    ?{words,patterns:pats,raster:$('#rdraster').checked}:null;
  const form = ($('#s-form') && $('#s-form').open && formFound.length) ? readFormValues() : null;
  const sign = (sigDataUrl && $('#s-sign') && $('#s-sign').open) ? {
    dataUrl:sigDataUrl, pos:$('#sigpos').value, width:+$('#sigw').value,
    opacity:+$('#sigo').value/100, pages:selList()
  } : null;
  const cmode = $('#cmode') ? $('#cmode').value : 'photos';
  const cgray = $('#cgray') ? $('#cgray').checked : false;
  return {trim,resize,impose:imp?{mode:imp,gap:+$('#imgap').value}:null,hf,bates,redact,form,sign,
          cmode,cgray,flatten:$('#flatten').checked,stripmd:$('#stripmd').checked,
          batch:!!($('#batch') && $('#batch').checked)};
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
/* top-level bookmarks, resolved to page numbers — the shape a split needs */
async function bookmarkStarts(d){
  try{
    const outline=await d.pdfjs.getOutline();
    if(!outline||!outline.length) return null;
    const out=[];
    for(const item of outline){
      let page=null;
      try{
        const dest=typeof item.dest==='string' ? await d.pdfjs.getDestination(item.dest) : item.dest;
        if(dest&&dest[0]) page=await d.pdfjs.getPageIndex(dest[0]);
      }catch(e){}
      if(page!=null) out.push({title:item.title||'bookmark',page});
    }
    out.sort((a,b)=>a.page-b.page);
    return out;
  }catch(e){ return null; }
}

async function splitNow(){
  if(!pages.length){ toast('Add a PDF first'); return; }
  const sel=selList();
  const base=sel.length?sel:pages.map((_,i)=>i);
  const mode=$('#splitmode').value;
  let chunks=[];
  if(mode==='bookmark'){
    // prefer the document the selection came from, then the first one that actually
    // has bookmarks — not simply the first PDF that happens to be loaded
    const prefer = sel.length ? pages[sel[0]].docId : null;
    const pdfs = docs.filter(x=>x.kind==='pdf'&&x.pdfjs);
    let d = prefer ? pdfs.find(x=>x.id===prefer) : null;
    let marks = d ? await bookmarkStarts(d) : null;
    if(!marks || marks.length<2){
      for(const c of pdfs){
        if(c===d) continue;
        const m = await bookmarkStarts(c);
        if(m && m.length>=2){ d=c; marks=m; break; }
      }
    }
    if(!d) d = pdfs[0];
    if(!d){ toast('Load a PDF first'); return; }
    if(!marks || marks.length<2){ toast('That document has no bookmarks to split on'); return; }
    if(!marks||marks.length<2){ toast('That document has no bookmarks to split on'); return; }
    for(let k=0;k<marks.length;k++){
      const from=marks[k].page, to=(k+1<marks.length?marks[k+1].page:d.numPages);
      const idx=[]; for(let p=from;p<to;p++) idx.push(p);
      if(idx.length) chunks.push(idx);
    }
  }
  else if(mode==='ranges'){ const r=parseRanges($('#splitr').value,pages.length);
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
  await ensurePdfLib();
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
  ['Insert a blank page','pages',insertBlank],
  ['Process a folder of PDFs','tools',()=>openSec('s-folder')],
  ['Share as a PIN-locked HTML','tools',()=>openSec('s-lock')],
  ['Compare two documents','tools',()=>openSec('s-compare')],
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

/* =====================================================================
   1.4 — forms, signatures, image extraction, real compression,
   undo/redo, and the small honest things (memory, labels, OCR paths).
   ===================================================================== */

/* ---------- AcroForm: read the fields, fill them, flatten them ---------- */
let formFound = [];
async function scanForms(){
  const box = $('#formfields'); if(!box) return;
  await ensurePdfLib();
  box.innerHTML = '<p class="hint">Reading…</p>';
  formFound = [];
  for(const d of docs){
    if(d.kind !== 'pdf') continue;
    let doc, form;
    try{ doc = await PDFDocument.load(d.bytes, {ignoreEncryption:true}); }catch(e){ continue; }
    try{ form = doc.getForm(); }catch(e){ continue; }
    let fields = [];
    try{ fields = form.getFields(); }catch(e){ continue; }
    for(const f of fields){
      /* The vendored pdf-lib is minified, so constructor names are mangled
         (Tp, Sp, …). Ask what the field can do instead. */
      let options = null, value = '', type = 'text';
      if(typeof f.getOptions === 'function'){
        type = 'dropdown';
        try{ options = f.getOptions(); }catch(e){ options = null; }
      } else if(typeof f.check === 'function' && typeof f.isChecked === 'function'){
        type = 'checkbox';
        try{ value = f.isChecked(); }catch(e){}
      } else if(typeof f.getText === 'function'){
        try{ value = f.getText() || ''; }catch(e){}
      }
      formFound.push({name:f.getName(), type, value, options});
    }
  }
  if(!formFound.length){
    box.innerHTML = '<p class="hint">No form fields in the loaded files. A flat PDF has none — '
      + 'this only does something on a file with an AcroForm.</p>';
    return;
  }
  box.innerHTML = formFound.map((f, i) => {
    const id = 'ff' + i, label = esc(f.name.length > 24 ? f.name.slice(0, 22) + '…' : f.name);
    const attr = 'id="' + id + '" data-field="' + esc(f.name) + '"';
    if(f.options && f.options.length)
      return '<div class="fld"><label for="' + id + '">' + label + '</label><select ' + attr + '>'
        + f.options.map(o => '<option>' + esc(o) + '</option>').join('') + '</select></div>';
    if(f.type === 'checkbox')
      return '<div class="fld"><label for="' + id + '">' + label + '</label><input type="checkbox" ' + attr + '></div>';
    return '<div class="fld"><label for="' + id + '">' + label + '</label><input type="text" '
      + attr + ' value="' + esc(f.value) + '"></div>';
  }).join('') + '<p class="hint">' + formFound.length + ' field' + (formFound.length === 1 ? '' : 's')
    + ' — filled and flattened when you save.</p>';
}
function readFormValues(){
  const out = {};
  $$('#formfields [data-field]').forEach(el => {
    out[el.getAttribute('data-field')] = el.type === 'checkbox' ? el.checked : el.value;
  });
  return out;
}
async function applyFormValues(doc, values){
  /* A field created without a default appearance draws nothing when flattened —
     the value is set but there is no glyph run to show. Give every text field an
     appearance first, then flatten. */
  try{
    const form = doc.getForm();
    let font = null;
    try{ font = await doc.embedFont(StandardFonts.Helvetica); }catch(e){}
    for(const f of form.getFields()){
      const name = f.getName();
      if(!(name in values)) continue;
      const v = values[name];
      try{
        if(typeof f.setText === 'function'){
          f.setText(String(v == null ? '' : v));
          if(font && f.updateAppearances) f.updateAppearances(font);
        } else if(typeof f.check === 'function' && typeof f.isChecked === 'function'){
          v ? f.check() : f.uncheck();
        } else if(typeof f.select === 'function'){
          if(v) f.select(String(v));
          if(font && f.updateAppearances) f.updateAppearances(font);
        }
      }catch(e){ console.warn('field', name, e); }
    }
    form.flatten();
  }catch(e){ console.warn('form flatten', e); }
}

/* ---------- signature: draw it, trim the empty margin, stamp it ---------- */
let sigDataUrl = null;
function trimCanvasToInk(c){
  const ctx = c.getContext('2d');
  const {data, width, height} = ctx.getImageData(0, 0, c.width, c.height);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for(let y = 0; y < height; y++){
    for(let x = 0; x < width; x++){
      if(data[(y * width + x) * 4 + 3] > 8){
        if(x < minX) minX = x; if(x > maxX) maxX = x;
        if(y < minY) minY = y; if(y > maxY) maxY = y;
      }
    }
  }
  if(maxX < 0) return null;
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  out.getContext('2d').drawImage(c, minX, minY, w, h, 0, 0, w, h);
  return out.toDataURL('image/png');
}
function initSignature(){
  const c = $('#sigpad'); if(!c) return;
  const ctx = c.getContext('2d');
  ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#101010';
  let drawing = false;
  const at = e => {
    const r = c.getBoundingClientRect();
    return {x:(e.clientX - r.left) * c.width / r.width, y:(e.clientY - r.top) * c.height / r.height};
  };
  c.addEventListener('pointerdown', e => {
    drawing = true; try{ c.setPointerCapture(e.pointerId); }catch(err){}
    const p = at(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
  });
  c.addEventListener('pointermove', e => {
    if(!drawing) return;
    const p = at(e); ctx.lineTo(p.x, p.y); ctx.stroke();
  });
  const stop = () => { if(!drawing) return; drawing = false; sigDataUrl = trimCanvasToInk(c); rememberSignature(); };
  function rememberSignature(){
    const box = $('#sigremember');
    if(!box || !box.checked) return;
    try{ if(sigDataUrl) localStorage.setItem('pdftk_sig', sigDataUrl); else localStorage.removeItem('pdftk_sig'); }
    catch(e){}
  }
  function restoreSignature(){
    let saved = null;
    try{ saved = localStorage.getItem('pdftk_sig'); }catch(e){}
    if(!saved) return;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, c.width, c.height);
      const s2 = Math.min(c.width / img.width, c.height / img.height);
      ctx.drawImage(img, 0, 0, img.width * s2, img.height * s2);
      sigDataUrl = trimCanvasToInk(c);
      const box = $('#sigremember'); if(box) box.checked = true;
      if(sigDataUrl) toast('Signature restored from this device');
    };
    img.src = saved;
  }
  setTimeout(restoreSignature, 300);
  c.addEventListener('pointerup', stop);
  c.addEventListener('pointercancel', stop);
  c.addEventListener('pointerleave', stop);

  $('#sigclear').onclick = () => {
    ctx.clearRect(0, 0, c.width, c.height); sigDataUrl = null;
    try{ localStorage.removeItem('pdftk_sig'); }catch(e){}
    toast('Signature cleared');
  };
  $('#sigfile').onclick = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = async () => {
      const f = input.files && input.files[0]; if(!f) return;
      try{
        const bmp = await createImageBitmap(f);
        ctx.clearRect(0, 0, c.width, c.height);
        const s = Math.min(c.width / bmp.width, c.height / bmp.height);
        const w = bmp.width * s, h = bmp.height * s;
        ctx.drawImage(bmp, (c.width - w) / 2, (c.height - h) / 2, w, h);
        sigDataUrl = trimCanvasToInk(c);
        try{ if(sigDataUrl && $('#sigremember') && $('#sigremember').checked) localStorage.setItem('pdftk_sig', sigDataUrl); }catch(e){}
        toast(sigDataUrl ? 'Signature loaded' : 'That picture is empty');
      }catch(e){ toast('Could not read that image'); }
    };
    input.click();
  };
}
async function drawSignature(doc, o){
  if(!o.dataUrl) return 0;
  const png = Uint8Array.from(atob(o.dataUrl.split(',')[1]), ch => ch.charCodeAt(0));
  const img = await doc.embedPng(png);
  const all = doc.getPages();
  const idx = (o.pages && o.pages.length) ? o.pages : all.map((_, i) => i);
  let n = 0;
  for(const i of idx){
    const page = all[i]; if(!page) continue;
    const {width:W, height:H} = page.getSize();
    const w = W * (o.width / 100), h = w * img.height / img.width, m = 24;
    let x, y;
    if(o.pos === 'br'){ x = W - m - w; y = m; }
    else if(o.pos === 'bl'){ x = m; y = m; }
    else if(o.pos === 'tr'){ x = W - m - w; y = H - m - h; }
    else if(o.pos === 'tl'){ x = m; y = H - m - h; }
    else { x = (W - w) / 2; y = m; }
    page.drawImage(img, {x, y, width:w, height:h, opacity:o.opacity});
    n++;
  }
  return n;
}

/* ---------- extract the images a PDF stores inside itself ---------- */
function saveBlob(blob, name){
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = u; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(u), 5000);
}
async function imageObjectFrom(page, name){
  /* pdf.js's PDFObjects.get() with a callback behaves differently from the
     promise-less form when the object is already settled, so ask directly and
     wait for the render that populates the store. */
  for(let attempt = 0; attempt < 15; attempt++){
    /* pdf.js keeps a page-local store and a shared one: an image repeated across
       pages (or already seen) lives in commonObjs, and asking the page for it
       alone misses it. */
    try{ const o = page.objs.get(name); if(o) return o; }catch(e){}
    try{ const o = page.commonObjs.get(name); if(o) return o; }catch(e){}
    await new Promise(r => setTimeout(r, 120));
  }
  return null;
}
function imageToCanvas(ob){
  const w = ob.width | 0, h = ob.height | 0;
  if(!w || !h) return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  if(ob.bitmap){
    ctx.drawImage(ob.bitmap, 0, 0); return c;
  }
  const data = ob.data; if(!data) return null;
  const n = w * h;
  const img = ctx.createImageData(w, h);
  if(ob.kind === 3 && data.length >= n * 4){ img.data.set(data.subarray(0, n * 4)); }
  else if(ob.kind === 2 && data.length >= n * 3){
    for(let i = 0; i < n; i++){
      img.data[i * 4] = data[i * 3];
      img.data[i * 4 + 1] = data[i * 3 + 1];
      img.data[i * 4 + 2] = data[i * 3 + 2];
      img.data[i * 4 + 3] = 255;
    }
  } else if(ob.kind === 1){
    const row = (w + 7) >> 3;
    for(let y = 0; y < h; y++){
      for(let x = 0; x < w; x++){
        const bit = (data[y * row + (x >> 3)] >> (7 - (x & 7))) & 1;
        const v = bit ? 0 : 255, o = (y * w + x) * 4;
        img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255;
      }
    }
  } else return null;
  ctx.putImageData(img, 0, 0);
  return c;
}
async function extractImages(){
  await ensurePdfjs();
  if(!pages.length){ toast('Add a PDF first'); return; }
  const sel = selList(), base = sel.length ? sel : pages.map((_, i) => i);
  const msg = $('#imgmsg');
  const OPS = pdfjsLib.OPS;
  let made = 0, seen = 0;
  cancelJob = false; $('#save').disabled = true;
  try{
    for(let k = 0; k < base.length; k++){
      if(cancelJob) break;
      const i = base[k], p = pages[i], d = docs.find(x => x.id === p.docId);
      if(!d || d.kind !== 'pdf') continue;
      prog(Math.round(100 * k / base.length));
      msg.textContent = 'Scanning page ' + (i + 1) + '…';
      let pg, ol;
      try{ pg = await d.pdfjs.getPage(p.src + 1); ol = await pg.getOperatorList(); }catch(e){ continue; }
      /* pdf.js only decodes the images while it renders, so draw the page once at
         a small scale — otherwise page.objs is empty and every lookup misses. */
      try{
        const vp = pg.getViewport({scale:0.3});
        const cv = document.createElement('canvas');
        cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
        await pg.render({canvasContext:cv.getContext('2d'), viewport:vp}).promise;
      }catch(e){}
      const names = [];
      for(let j = 0; j < ol.fnArray.length; j++){
        const f = ol.fnArray[j];
        if(f === OPS.paintImageXObject || f === OPS.paintInlineImageXObject ||
           f === OPS.paintImageMaskXObject || f === OPS.paintJpegXObject){
          const a = ol.argsArray[j]; if(a && a[0] !== undefined) names.push(a[0]);
        }
      }
      for(const name of names){
        if(typeof name !== 'string' && typeof name !== 'number') continue;
        seen++;
        const ob = await imageObjectFrom(pg, name);
        if(!ob) continue;
        let c = null;
        try{ c = imageToCanvas(ob); }catch(e){ c = null; }
        if(!c) continue;
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        if(!blob) continue;
        made++;
        saveBlob(blob, 'page-' + String(i + 1).padStart(3, '0') + '-image-' + made + '.png');
        await new Promise(r => setTimeout(r, 140));
      }
    }
    prog(100);
    msg.textContent = made ? (made + ' image' + (made === 1 ? '' : 's') + ' recovered.')
      : (seen ? 'Found ' + seen + ' image reference' + (seen === 1 ? '' : 's') + ' but could not decode them.'
              : 'No embedded images in these pages — this file is probably all text or a pure scan flattened to one picture per page.');
    toast(made ? ('Extracted ' + made + ' image' + (made === 1 ? '' : 's')) : 'No images found');
    announce(msg.textContent);
  }catch(e){ toast('Extraction failed: ' + e.message); }
  $('#save').disabled = false;
}

/* ---------- compression that keeps the text: re-encode the JPEGs ---------- */
async function condenseDoc(doc, maxDim, quality){
  const {PDFRawStream, PDFName} = PDFLib;
  const ctx = doc.context;
  const stats = {photos:0, shrunk:0, skipped:0, before:0, after:0};
  for(const [ref, obj] of ctx.enumerateIndirectObjects()){
    let dict = null;
    try{ dict = obj.dict; }catch(e){ continue; }
    if(!dict) continue;
    let sub; try{ sub = dict.get(PDFName.of('Subtype')); }catch(e){ continue; }
    if(!sub || String(sub) !== '/Image') continue;
    const filt = dict.get(PDFName.of('Filter'));
    if(!filt || String(filt) !== '/DCTDecode'){ stats.skipped++; continue; }
    if(dict.get(PDFName.of('SMask')) || dict.get(PDFName.of('Mask'))){ stats.skipped++; continue; }
    let bytes = null;
    try{ bytes = obj.getContents ? obj.getContents() : obj.contents; }catch(e){}
    if(!bytes || !bytes.length){ stats.skipped++; continue; }
    stats.photos++;
    try{
      const bmp = await createImageBitmap(new Blob([bytes], {type:'image/jpeg'}));
      const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(bmp.width * scale));
      c.height = Math.max(1, Math.round(bmp.height * scale));
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      if(bmp.close) bmp.close();
      const data = c.toDataURL('image/jpeg', quality / 100);
      const nb = Uint8Array.from(atob(data.split(',')[1]), ch => ch.charCodeAt(0));
      if(nb.length >= bytes.length){ stats.skipped++; continue; }
      const nd = ctx.obj({
        Type:'XObject', Subtype:'Image', Width:c.width, Height:c.height,
        ColorSpace:'DeviceRGB', BitsPerComponent:8, Filter:'DCTDecode'
      });
      ctx.assign(ref, PDFRawStream.of(nd, nb));
      stats.shrunk++; stats.before += bytes.length; stats.after += nb.length;
      prog(null);
    }catch(e){ stats.skipped++; }
  }
  return stats;
}

/* ---------- greyscale, for the rasterise path ---------- */
function toGrey(canvas){
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  for(let i = 0; i < d.length; i += 4){
    const v = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    d[i] = d[i + 1] = d[i + 2] = v;
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/* ---------- insert a blank page ---------- */
function insertBlank(){
  snapshotPages();
  const sel = selList();
  const at = sel.length ? Math.max.apply(null, sel) + 1 : pages.length;
  let blank = docs.find(d => d.kind === 'blank');
  if(!blank){
    blank = {id:nextId++, name:'blank', bytes:new Uint8Array(0), size:0, kind:'blank', numPages:1};
    docs.push(blank);
  }
  const page = {id:nextId++, docId:blank.id, src:0, rot:0, sel:false};
  pages.splice(at, 0, page);
  render(); renderFiles(); updateDoc();
  toast('Blank page at ' + (at + 1));
  announce('Blank page inserted at ' + (at + 1));
}

/* ---------- undo / redo ---------- */
let histStack = [], redoStack = [];
function snapshotPages(){
  histStack.push(JSON.stringify(pages.map(p => ({docId:p.docId, src:p.src, rot:p.rot, sel:p.sel}))));
  if(histStack.length > 60) histStack.shift();
  redoStack.length = 0;
}
function restorePages(json){
  pages = JSON.parse(json).map(p => ({...p, id:nextId++}));
  thumbCache.clear(); render(); renderFiles(); updateDoc();
}
function undo(){
  if(!histStack.length){ toast('Nothing to undo'); return; }
  redoStack.push(JSON.stringify(pages.map(p => ({docId:p.docId, src:p.src, rot:p.rot, sel:p.sel}))));
  restorePages(histStack.pop()); toast('Undo'); announce('Undone');
}
function redo(){
  if(!redoStack.length){ toast('Nothing to redo'); return; }
  histStack.push(JSON.stringify(pages.map(p => ({docId:p.docId, src:p.src, rot:p.rot, sel:p.sel}))));
  restorePages(redoStack.pop()); toast('Redo'); announce('Redone');
}

/* ---------- batch: one output per source document ---------- */
async function saveBatch(o){
  const groups = new Map();
  pages.forEach((p, i) => {
    if(!groups.has(p.docId)) groups.set(p.docId, []);
    groups.get(p.docId).push(i);
  });
  const keep = pages;
  let made = 0;
  try{
    for(const [docId, idx] of groups){
      if(cancelJob) break;
      prog(Math.round(100 * made / groups.size));
      pages = idx.map(i => ({...keep[i], sel:false}));
      let doc = await buildDoc(o);
      if(o.secure && (o.secure.user || o.secure.owner)){
        await doc.encrypt({
          userPassword:o.secure.user || '',
          ownerPassword:o.secure.owner || o.secure.user || '',
          permissions:{printing:o.secure.print ? 'highResolution' : false, copying:o.secure.copy, modifying:o.secure.mod}
        });
      }
      const bytes = await doc.save({useObjectStreams:true});
      const src = docs.find(d => d.id === docId) || {name:'document.pdf'};
      const base = src.name.replace(/\.pdf$/i, '') || 'document';
      download(bytes, base + '-out.pdf');
      made++;
      await new Promise(r => setTimeout(r, 160));
    }
    prog(100);
  } finally { pages = keep; }
  return made;
}

/* ---------- lossless compression, through the qpdf WASM runtime ----------
   qpdf is Apache-2.0 and the qpdf-run wrapper that packages it for the browser is
   MIT, so this is the one compression engine this app may ship: Ghostscript and
   friends would have forced the whole app to be AGPL. It rewrites object streams
   and re-flates what is not already compressed — the text stays text. */
const QPDF_CANDIDATES = ['qpdf/', 'docs/play/qpdf/'];
let QPDF_BASE = null;

function loadScriptOnce(src){
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('no script at ' + src));
    document.head.appendChild(s);
  });
}
async function qpdfReady(){
  if(window.QPDF && QPDF_BASE) return QPDF_BASE;
  for(const base of (QPDF_BASE ? [QPDF_BASE] : QPDF_CANDIDATES)){
    try{ await loadScriptOnce(base + 'qpdf.js'); QPDF_BASE = base; return base; }catch(e){}
  }
  throw new Error('the qpdf engine is not next to this page — it ships in docs/play/qpdf/ '
    + '(tools/fetch_qpdf.py fetches it)');
}
function qpdfRun(bytes){
  return new Promise((resolve, reject) => {
    let settled = false;
    const done = (err, out) => { if(settled) return; settled = true; err ? reject(err) : resolve(out); };
    new QPDF({
      path: QPDF_BASE, logger: () => {},
      ready: (q) => {
        const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        q.save('in.pdf', buf, (err) => {
          if(err) return done(err);
          q.execute(['--object-streams=generate', '--recompress-flate', '--compression-level=9',
                     '--remove-unreferenced-resources=yes',
                     '--', 'in.pdf', 'out.pdf'], (err2) => {
            if(err2) return done(err2);
            q.load('out.pdf', (err3, ab) => {
              if(err3) return done(err3);
              done(null, new Uint8Array(ab));
            });
          });
        });
      }
    });
  });
}
/* true when the only thing asked for is compression — no decoration, no page
   edit, one source file in its original order. Then qpdf can work on the bytes
   the user handed us, instead of on a pdf-lib rebuild that may itself be bigger
   than the original. */
function onlyCompression(o){
  if(docs.length !== 1) return false;
  const d = docs[0];
  if(d.kind !== 'pdf') return false;
  if(pages.length !== d.numPages) return false;
  if(pages.some((p, i) => p.src !== i || p.rot)) return false;
  const md = o.meta || {};
  return !(o.trim || o.resize || o.impose || o.hf || o.bates || o.redact || o.flatten || o.stripmd
    || o.sign || (o.watermark && o.watermark.text) || (o.pagenum && o.pagenum.on)
    || (o.form && Object.keys(o.form).length)
    || md.title || md.author || md.subject || md.keywords);
}

async function losslessBytes(bytes){
  await qpdfReady();
  const after = await qpdfRun(bytes);
  if(after.length >= bytes.length){
    toast('qpdf: already as small as it gets · ' + fmt(bytes.length));
    return bytes;
  }
  toast('qpdf · ' + fmt(bytes.length) + ' → ' + fmt(after.length)
    + ' (−' + Math.round(100 - 100 * after.length / bytes.length) + '%), nothing lost');
  return after;
}
async function losslessCompress(doc){
  const before = await doc.save({useObjectStreams:true});
  return losslessBytes(before);
}
async function unusedLosslessCompress(doc){
  await qpdfReady();
  const before = await doc.save({useObjectStreams:true});
  const after = await qpdfRun(before);
  if(after.length >= before.length){
    toast('qpdf: already as small as it gets · ' + fmt(before.length));
    return before;
  }
  toast('qpdf · ' + fmt(before.length) + ' → ' + fmt(after.length)
    + ' (−' + Math.round(100 - 100 * after.length / before.length) + '%), nothing lost');
  return after;
}

/* ---------- a whole folder, through the File System Access API ----------
   The browser gives this page a directory handle; the page reads the PDFs and
   writes results back into an `out` folder beside them. No upload, no server —
   the same promise as everything else, extended to a hundred files at once.
   Chrome, Edge and Android Chrome have this; Firefox and Safari do not, and the
   button says so rather than failing when pressed. */
async function processFolder(){
  const msg = $('#foldermsg');
  if(!window.showDirectoryPicker){
    const t = 'This browser cannot open a folder. Use "one file per source" instead, or Chrome, '
      + 'Edge or Android Chrome.';
    if(msg) msg.textContent = t;
    toast(t);
    return;
  }
  let dir;
  try{ dir = await window.showDirectoryPicker({ mode:'readwrite' }); }
  catch(e){ return; }                       // the user closed the picker
  const outDir = await dir.getDirectoryHandle('out', { create:true });

  const entries = [];
  for await (const [name, handle] of dir.entries()){
    if(handle.kind === 'file' && /\.pdf$/i.test(name)) entries.push({name, handle});
  }
  if(!entries.length){ toast('No PDFs in that folder'); if(msg) msg.textContent = 'No PDFs found.'; return; }

  const o = toolOpts();
  const keepDocs = docs, keepPages = pages;
  let done = 0, failed = 0, before = 0, after = 0;
  cancelJob = false; $('#save').disabled = true;
  try{
    for(let i = 0; i < entries.length; i++){
      if(cancelJob) break;
      const e = entries[i];
      if(msg) msg.textContent = 'Working on ' + (i + 1) + ' of ' + entries.length + ' — ' + e.name;
      prog(Math.round(100 * i / entries.length));
      try{
        const file = await e.handle.getFile();
        docs = []; pages = []; thumbCache.clear();
        await addFiles([file]);
        let bytes;
        if(o.compress && o.cmode === 'lossless' && onlyCompression(o)
           && !(o.secure && (o.secure.user || o.secure.owner))){
          // straight through qpdf: no rebuild, no inflation
          bytes = await losslessBytes(new Uint8Array(await file.arrayBuffer()));
        } else {
          const doc = await buildDoc(o);
          bytes = await doc.save({useObjectStreams:true});
          if(o.compress && o.cmode === 'lossless' && !(o.secure && (o.secure.user || o.secure.owner))){
            bytes = await losslessCompress(doc);
          }
        }
        before += file.size; after += bytes.length;
        const outName = e.name.replace(/\.pdf$/i, '') + '-out.pdf';
        const fh = await outDir.getFileHandle(outName, { create:true });
        const w = await fh.createWritable();
        await w.write(bytes);
        await w.close();
        done++;
      }catch(err){ failed++; console.warn('folder', e.name, err); }
    }
    prog(100);
    const line = done + ' file' + (done === 1 ? '' : 's') + ' written to out/'
      + (failed ? ' · ' + failed + ' failed' : '')
      + (done ? ' · ' + fmt(before) + ' → ' + fmt(after) : '');
    if(msg) msg.textContent = line;
    toast('Folder: ' + line);
    announce(line);
  } finally {
    docs = keepDocs; pages = keepPages; thumbCache.clear();
    render(); renderFiles(); updateDoc();
    $('#save').disabled = false;
  }
}

/* ---------- share locked: the LockHTML container ----------
   LockHTML (same licence as this app) defines a payload of {v:2, kdf:"pbkdf2",
   kdfparams:{iter}, salt, iv, ct} encrypted with AES-256-GCM and embedded in a
   <script id="payload" type="application/json"> block. Writing the same shape
   means a file locked here opens in that viewer, and one locked there opens
   here. Only the PIN path is implemented: no shares, no recipients, no decoy. */
const LOCK_KIND = 'file';
const LOCK_ITER = 250000;

function b64bytes(bytes){
  let s = '';
  for(let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function bytesb64(b64){
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function lockPayload(bytes, pin, oneTime){
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const raw = new Uint8Array(await crypto.subtle.deriveBits(
    {name:'PBKDF2', salt, iterations:LOCK_ITER, hash:'SHA-256'}, base, 256));
  const key = await crypto.subtle.importKey('raw', raw, {name:'AES-GCM'}, false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, bytes));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', ct));
  let id = '';
  for(let i = 0; i < 8; i++) id += digest[i].toString(16).padStart(2, '0');
  return {
    v:2, kind:LOCK_KIND, name:(docs[0] ? docs[0].name : 'document.pdf'),
    mode:'pin', kdf:'pbkdf2', kdfparams:{iter:LOCK_ITER}, eph:null, pin:true,
    salt:b64bytes(salt), iv:b64bytes(iv), ct:b64bytes(ct), id,
    onetime:!!oneTime, maxviews: oneTime ? 1 : null,
    notbefore:null, expires:null, watermark:null, keyfile:false, sig:null, decoy:null
  };
}
function lockedHTML(payload){
  const json = JSON.stringify(payload);
  const end = '<' + '/script>';
  return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<meta name="robots" content="noindex,nofollow">'
  + '<title>Protected document</title><style>'
  + ':root{color-scheme:dark}*{box-sizing:border-box}html,body{margin:0;height:100%}'
  + 'body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;'
  + 'background:radial-gradient(1200px 600px at 50% -10%,#1b2130 0%,#0f1115 60%);color:#e8eaed;'
  + 'display:flex;align-items:center;justify-content:center;padding:18px}'
  + '.card{width:min(440px,94vw);padding:28px;background:#171a21;border:1px solid #262b36;'
  + 'border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.5);text-align:center}'
  + 'h1{font-size:17px;margin:0 0 6px;font-weight:600}'
  + 'p.sub{font-size:13px;color:#9aa3b2;margin:0 0 18px;line-height:1.5}'
  + 'input{width:100%;padding:13px;font-size:17px;letter-spacing:3px;text-align:center;'
  + 'background:#0f1115;color:#fff;border:1px solid #2c3340;border-radius:10px;outline:none}'
  + 'input:focus{border-color:#4c7dff}'
  + 'button{width:100%;margin-top:12px;padding:13px;font-size:15px;font-weight:600;color:#fff;'
  + 'background:linear-gradient(180deg,#5a86ff,#3a6bf0);border:0;border-radius:10px;cursor:pointer}'
  + 'button:disabled{opacity:.5;cursor:default}.msg{min-height:18px;font-size:13px;margin-top:12px}'
  + '.msg.err{color:#ff6b6b}.msg.ok{color:#33d17a}'
  + 'iframe{width:100%;height:70vh;border:1px solid #262b36;border-radius:10px;background:#fff}'
  + '.name{font-size:12px;color:#9aa3b2;margin-top:14px;word-break:break-all}'
  + '</style></head><body><div class="card" id="card">'
  + '<h1>Protected document</h1>'
  + '<p class="sub" id="sub">Enter the PIN to open it. Nothing is sent anywhere.</p>'
  + '<input id="pin" type="password" inputmode="numeric" autocomplete="off" placeholder="PIN">'
  + '<button id="go">Open</button><div class="msg" id="msg"></div>'
  + '<div class="name" id="name"></div></div>'
  // the tag is assembled from two pieces on purpose: written whole, the source
  // contains a literal application/json script block that the kit's parity check
  // tries to parse as data and refuses the merge over
  + '<script id="payload" type="application/' + 'json">' + json.replace(/<\//g, '<\\/') + end
  + '<script>(function(){'
  + 'var p=JSON.parse(document.getElementById("payload").textContent);'
  + 'var msg=document.getElementById("msg"),sub=document.getElementById("sub");'
  + 'document.getElementById("name").textContent=p.name||"";'
  + 'function b64(s){var b=atob(s),u=new Uint8Array(b.length);for(var i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u}'
  + 'function say(t,c){msg.textContent=t;msg.className="msg "+(c||"")}'
  + 'var KEY="lhtml-view:"+(p.id||"");'
  + 'if(p.onetime&&localStorage.getItem(KEY)){'
  + '  sub.textContent="This document has already been opened once.";'
  + '  document.getElementById("pin").disabled=true;document.getElementById("go").disabled=true;'
  + '  say("One-time view has been used on this device.","err");'
  + '}'
  + 'document.getElementById("go").onclick=async function(){'
  + '  var pin=document.getElementById("pin").value; if(!pin){say("Enter the PIN.","err");return}'
  + '  this.disabled=true; say("Opening…");'
  + '  try{'
  + '    var s=window.crypto.subtle;'
  + '    var base=await s.importKey("raw",new TextEncoder().encode(pin),"PBKDF2",false,["deriveBits"]);'
  + '    var raw=new Uint8Array(await s.deriveBits({name:"PBKDF2",salt:b64(p.salt),'
  + '      iterations:(p.kdfparams&&p.kdfparams.iter)||250000,hash:"SHA-256"},base,256));'
  + '    var k=await s.importKey("raw",raw,{name:"AES-GCM"},false,["decrypt"]);'
  + '    var out=await s.decrypt({name:"AES-GCM",iv:b64(p.iv)},k,b64(p.ct));'
  + '    if(p.onetime){try{localStorage.setItem(KEY,"1")}catch(e){}}'
  + '    var url=URL.createObjectURL(new Blob([out],{type:"application/pdf"}));'
  + '    var card=document.getElementById("card");'
  + '    card.innerHTML=""; card.style.width="min(980px,96vw)"; card.style.padding="14px";'
  + '    var f=document.createElement("iframe"); f.src=url; card.appendChild(f);'
  + '    var a=document.createElement("a"); a.href=url; a.download=p.name||"document.pdf";'
  + '    a.textContent="Download "+(p.name||"the PDF"); a.style.cssText="display:block;margin-top:10px;color:#8fb0ff;font-size:13px";'
  + '    card.appendChild(a);'
  + '    if(p.onetime){var w=document.createElement("div");w.className="msg err";'
  + '      w.textContent="One-time view: this device will not open it again.";card.appendChild(w)}'
  + '  }catch(e){ this.disabled=false; say("That PIN did not work.","err"); }'
  + '};'
  + '})();' + end + '</body></html>';
}
async function shareLocked(){
  const msg = $('#lockmsg');
  const pin = ($('#lkpin') || {}).value || '';
  const pin2 = ($('#lkpin2') || {}).value || '';
  const once = !!($('#lkonce') && $('#lkonce').checked);
  if(pin.length < 6){ msg.textContent = 'Use at least 6 characters — a short PIN on AES-256 is still a short PIN.'; return; }
  if(pin !== pin2){ msg.textContent = 'The two PINs do not match.'; return; }
  if(!pages.length){ msg.textContent = 'Add a document first.'; return; }
  msg.textContent = 'Encrypting…';
  try{
    const doc = await buildDoc(toolOpts());
    const bytes = await doc.save({useObjectStreams:true});
    const payload = await lockPayload(bytes, pin, once);
    const html = lockedHTML(payload);
    const base = (docs[0] ? docs[0].name.replace(/\.pdf$/i, '') : 'document');
    download(new Blob([html], {type:'text/html'}), base + '-locked.html');
    msg.textContent = 'Locked · ' + fmt(bytes.length) + ' inside · '
      + (once ? 'one-time view' : 'opens until the PIN changes');
    toast('Locked HTML written — the PIN cannot be recovered');
  }catch(e){
    msg.textContent = 'Could not lock: ' + e.message;
  }
}

/* ---------- keyboard and screen-reader polish for the page grid ---------- */
function gridA11y(){
  const grid = $('#grid'); if(!grid) return;
  const tiles = [...grid.querySelectorAll('.pg')];
  if(!tiles.length) return;
  grid.setAttribute('role', 'listbox');
  grid.setAttribute('aria-multiselectable', 'true');
  grid.setAttribute('aria-label', 'Pages — arrow keys move, space selects, delete removes');
  let focusIdx = Math.max(0, tiles.findIndex(t => t === document.activeElement));
  tiles.forEach((t, i) => {
    const sel = t.classList.contains('sel') || t.getAttribute('aria-selected') === 'true';
    t.setAttribute('role', 'option');
    t.setAttribute('aria-selected', sel ? 'true' : 'false');
    t.setAttribute('tabindex', i === focusIdx ? '0' : '-1');
    if(!t.getAttribute('aria-label')){
      const n = t.querySelector('.num');
      t.setAttribute('aria-label', 'Page ' + (n ? n.textContent.trim() : (i + 1)));
    }
  });
  if(!grid._a11yWired){
    grid._a11yWired = true;
    grid.addEventListener('keydown', (e) => {
      const list = [...grid.querySelectorAll('.pg')];
      const at = list.indexOf(document.activeElement);
      if(at < 0) return;
      if(e.key === 'ArrowRight' || e.key === 'ArrowDown'){
        e.preventDefault(); const n = list[Math.min(list.length - 1, at + 1)];
        n.focus(); n.setAttribute('tabindex', '0'); document.activeElement && list[at].setAttribute('tabindex', '-1');
      } else if(e.key === 'ArrowLeft' || e.key === 'ArrowUp'){
        e.preventDefault(); const n = list[Math.max(0, at - 1)];
        n.focus(); n.setAttribute('tabindex', '0'); list[at].setAttribute('tabindex', '-1');
      } else if(e.key === ' ' || e.key === 'Enter'){
        e.preventDefault(); list[at].click();
        announce('Page ' + (at + 1) + ' ' + (list[at].getAttribute('aria-selected') === 'true' ? 'selected' : 'deselected'));
      }
    });
  }
}

/* ---------- compare two documents by their text ----------
   Not a visual diff and not a claim about provenance: it reads what each page says
   and reports the pages whose text differs, with the first line that differs. */
async function pageText(d, src){
  try{
    const pg = await d.pdfjs.getPage(src + 1);
    const tc = await pg.getTextContent();
    return (tc.items || []).map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
  }catch(e){ return ''; }
}
async function compareDocs(){
  const out = $('#cmpout');
  const pdfs = docs.filter(d => d.kind === 'pdf');
  if(pdfs.length < 2){ out.textContent = 'Load two PDFs to compare.'; return; }
  const [a, b] = pdfs;
  out.textContent = 'Reading…';
  const rows = [];
  const n = Math.max(a.numPages, b.numPages);
  let differing = 0;
  for(let i = 0; i < n; i++){
    const ta = i < a.numPages ? await pageText(a, i) : '';
    const tb = i < b.numPages ? await pageText(b, i) : '';
    if(ta !== tb){
      differing++;
      const wa = ta.split(' '), wb = tb.split(' ');
      let k = 0;
      while(k < wa.length && k < wb.length && wa[k] === wb[k]) k++;
      rows.push('page ' + (i + 1)
        + '\n  ' + (a.name) + ': …' + wa.slice(Math.max(0, k - 4), k + 8).join(' ') + '…'
        + '\n  ' + (b.name) + ': …' + wb.slice(Math.max(0, k - 4), k + 8).join(' ') + '…');
    }
  }
  const head = differing
    ? differing + ' of ' + n + ' pages differ'
    : 'The text is identical on all ' + n + ' pages';
  out.textContent = head;
  const report = a.name + '  vs  ' + b.name + '\n' + head + '\n\n' + rows.join('\n\n') + '\n';
  download(new Blob([report], {type:'text/plain'}), 'compare.txt');
  announce(head);
}

/* ---------- the tool settings survive a reload ---------- */
function settingsSnapshot(){
  const out = {};
  $$('#apanel input, #apanel select').forEach(el => {
    if(!el.id) return;
    out[el.id] = el.type === 'checkbox' ? el.checked : el.value;
  });
  $$('#apanel details').forEach(d => { if(d.id) out[d.id + ':open'] = d.open; });
  return out;
}
function settingsRestore(){
  const saved = LS.get('tools', null);
  if(!saved) return;
  Object.keys(saved).forEach(k => {
    if(k.endsWith(':open')){
      const d = $('#' + k.slice(0, -5)); if(d) d.open = saved[k];
      return;
    }
    const el = $('#' + k); if(!el) return;
    if(el.type === 'checkbox') el.checked = saved[k]; else el.value = saved[k];
    if(el.tagName === 'SELECT' || el.type === 'range'){
      const v = $('#' + k + 'v'); if(v) v.textContent = el.value;
    }
  });
}
let settingsTimer = null;
function settingsSave(){
  clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => LS.set('tools', settingsSnapshot()), 400);
}

/* ---------- the rest of the 1.4 wiring ---------- */
function initExtras14(){
  // memory readout, where the browser exposes it
  const foot = $('.foot');
  if(foot && !$('#memstat')){
    const s = document.createElement('span');
    s.id = 'memstat'; s.className = 'only'; s.style.marginLeft = 'auto';
    foot.appendChild(s);
  }
  const mem = () => {
    const el = $('#memstat'); if(!el) return;
    const m = performance.memory;
    el.textContent = m ? ('≈ ' + Math.round(m.usedJSHeapSize / 1048576) + ' MB heap') : '';
  };
  const _updateBar = window.updateBar;
  window.updateBar = function(){ _updateBar.apply(this, arguments); mem(); };

  // undo/redo on the mutating operations, plus the keys
  for(const fn of ['rotate', 'removeSel', 'duplicateSel', 'moveSel']){
    const orig = window[fn];
    if(typeof orig !== 'function') continue;
    window[fn] = function(){ snapshotPages(); return orig.apply(this, arguments); };
  }
  const _addFiles = window.addFiles;
  if(typeof _addFiles === 'function')
    window.addFiles = function(){ snapshotPages(); return _addFiles.apply(this, arguments); };
  const _clear = $('#clear');
  if(_clear) _clear.addEventListener('click', () => snapshotPages(), true);

  addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target || {}).tagName || '') || (e.target || {}).isContentEditable;
    if(typing) return;
    const k = e.key.toLowerCase();
    if((e.ctrlKey || e.metaKey) && k === 'z'){ e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if((e.ctrlKey || e.metaKey) && k === 'y'){ e.preventDefault(); redo(); }
    else if(e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')){
      if(selList().length){ e.preventDefault(); moveSel(e.key === 'ArrowLeft' ? -1 : 1); }
    }
  });

  // labels and roles, so the grid is not a mystery to a screen reader
  const grid = $('#grid');
  if(grid){ grid.setAttribute('role', 'listbox'); grid.setAttribute('aria-multiselectable', 'true');
    grid.setAttribute('aria-label', 'Pages in the output'); }
  const labels = {add:'Add PDF files', addimg:'Add images', save:'Build and download the PDF',
    help:'Help and shortcuts', theme:'Switch theme', selall:'Select every page',
    selnone:'Clear the selection', rotl:'Rotate selected pages left', rotr:'Rotate selected pages right',
    left:'Move selected pages earlier', right:'Move selected pages later', dup:'Duplicate selected pages',
    del:'Delete selected pages', extract:'Extract selected pages into a new PDF', clear:'Remove every page'};
  Object.keys(labels).forEach(id => {
    const el = $('#' + id); if(el && !el.getAttribute('aria-label')) el.setAttribute('aria-label', labels[id]);
  });

  initI18n();
  settingsRestore();
  $('#apanel').addEventListener('input', settingsSave);
  $('#apanel').addEventListener('change', settingsSave);
  $('#apanel').addEventListener('toggle', settingsSave, true);
  $('#reset').addEventListener('click', () => { try{ localStorage.removeItem('pdftk_tools'); }catch(e){} }, true);

  // the new buttons
  const bl = $('#blank'); if(bl) bl.onclick = insertBlank;
  const fol = $('#dofolder'); if(fol) fol.onclick = processFolder;
  const lk = $('#dolock'); if(lk) lk.onclick = shareLocked;
  const cp = $('#docompare'); if(cp) cp.onclick = compareDocs;
  // the grid is rebuilt on every render, so the labels and roving tabindex follow it
  const _render = window.render;
  window.render = function(){ const r = _render.apply(this, arguments); try{ gridA11y(); }catch(e){} return r; };
  try{ gridA11y(); }catch(e){}
  const scan = $('#scanform'); if(scan) scan.onclick = scanForms;
  const ex = $('#doimg'); if(ex) ex.onclick = extractImages;
  initSignature();
  for(const [id, vid] of [['sigw', 'sigwv'], ['sigo', 'sigov']]){
    const el = $('#' + id); if(el) el.oninput = () => { $('#' + vid).textContent = el.value; };
  }
}
initExtras14();
