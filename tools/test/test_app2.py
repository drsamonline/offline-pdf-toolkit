#!/usr/bin/env python3
"""Exercise the 1.4 features: forms, signature, image extraction, real compression,
greyscale, undo/redo, and the CSP that has to not break any of it."""
import base64
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
DOCS = os.path.join(REPO, "docs")
OUT = tempfile.mkdtemp(prefix="pdftk-test-")
sys.path.insert(0, HERE)

import json
import os
import sys
import time

from cdp import Browser, Server  # noqa: E402

OUT = tempfile.mkdtemp(prefix="pdftk-test-")
os.makedirs(OUT, exist_ok=True)

STUB = """
window.__files=[];
window.download=function(bytes,name){
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s=''; for(let i=0;i<u8.length;i++) s+=String.fromCharCode(u8[i]);
  window.__files.push({name:name||'out.pdf', b64:btoa(s), size:u8.length});
};
window.__objs=[];
const _cou=URL.createObjectURL.bind(URL);
URL.createObjectURL=function(b){ try{ window.__objs.push(b); }catch(e){} return _cou(b); };
const _click=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(){ if(this.download) return; return _click.apply(this,arguments); };
"""

results = []


def note(name, ok, extra=""):
    results.append((name, ok, extra))
    print(("  PASS  " if ok else "  FAIL  ") + name + ((" — " + str(extra)) if extra else ""))


def grab(br, tag):
    files = json.loads(br.ev("JSON.stringify(window.__files)"))
    paths = []
    for i, f in enumerate(files):
        p = os.path.join(OUT, "%s-%d.pdf" % (tag, i + 1))
        open(p, "wb").write(base64.b64decode(f["b64"]))
        paths.append(p)
    return paths, files


def ensure_photo_fixture():
    """A two-page PDF with a real JPEG in it, for extraction and condensation."""
    import io, random
    import pymupdf
    from PIL import Image, ImageDraw
    path = os.path.join(DOCS, "assets", "sample-photo.pdf")
    if os.path.exists(path):
        return path
    W, H = 1600, 1200
    im = Image.new("RGB", (W, H)); d = ImageDraw.Draw(im); random.seed(7)
    for y in range(0, H, 40):
        for x in range(0, W, 40):
            d.rectangle([x, y, x + 40, y + 40], fill=(random.randint(0, 255), random.randint(0, 255), random.randint(0, 255)))
    buf = io.BytesIO(); im.save(buf, "JPEG", quality=95)
    doc = pymupdf.open()
    for title in ("Report with a photograph", "Second page, also text"):
        pg = doc.new_page(width=595, height=842)
        pg.insert_text((60, 80), title, fontsize=18)
        pg.insert_image(pymupdf.Rect(60, 110, 535, 600), stream=buf.getvalue())
        pg.insert_text((60, 650), "The paragraph above stays as text when photos are condensed.", fontsize=11)
    doc.save(path)
    return path


def main():
    fixture = ensure_photo_fixture()
    srv = Server(DOCS)
    br = Browser(1280, 1000)
    try:
        br.goto("http://127.0.0.1:%d/play/index.html" % srv.port)
        br.wait("document.readyState==='complete'", 40)
        br.ev(STUB)

        # ---- build an AcroForm in the page, then load it like a user would ----
        made = br.ev("""(async()=>{
          await ensurePdfLib();
          const d=await PDFDocument.create(); const p=d.addPage([595,842]);
          const f=d.getForm();
          const t=f.createTextField('patient_name'); t.addToPage(p,{x:60,y:700,width:300,height:24});
          const c=f.createCheckBox('consent'); c.addToPage(p,{x:60,y:660,width:16,height:16});
          const font=await d.embedFont(StandardFonts.Helvetica);
          p.drawText('Consent form',{x:60,y:760,size:18,font});
          const b=await d.save();
          return b.length;
        })()""")
        note("pdf-lib can create a form", bool(made), made)

        br.ev("""(async()=>{
          await ensurePdfLib();
          const d=await PDFDocument.create(); const p=d.addPage([595,842]);
          const f=d.getForm();
          const t=f.createTextField('patient_name'); t.addToPage(p,{x:60,y:700,width:300,height:24});
          const c=f.createCheckBox('consent'); c.addToPage(p,{x:60,y:660,width:16,height:16});
          const font=await d.embedFont(StandardFonts.Helvetica);
          p.drawText('Consent form',{x:60,y:760,size:18,font});
          const b=await d.save();
          const photo=await (await fetch('../assets/sample-photo.pdf')).arrayBuffer();
          await addFiles([new File([b],'form.pdf',{type:'application/pdf'}),
                          new File([photo],'photo.pdf',{type:'application/pdf'})]);
        })()""")
        br.wait("document.querySelectorAll('#grid .pg').length>=2", 40, "2 pages")
        note("form + photo pdf load", br.ev("document.querySelectorAll('#grid .pg').length") == 2,
             "%d pages" % br.ev("document.querySelectorAll('#grid .pg').length"))

        # ---- form fields ----
        br.ev("$('#s-form').open=true; $('#scanform').click()")
        br.wait("document.querySelectorAll('#formfields [data-field]').length>=2", 20, "fields")
        nfields = br.ev("document.querySelectorAll('#formfields [data-field]').length")
        note("form fields are found", nfields >= 2, "%d fields" % nfields)

        br.ev("""(function(){
          const t=document.querySelector('#formfields [data-field="patient_name"]');
          if(t) t.value='Asha Rao';
          const c=document.querySelector('#formfields [data-field="consent"]');
          if(c) c.checked=true;
        })()""")
        br.ev("window.__files=[]")
        br.ev("(async()=>{ await save(); })()")
        time.sleep(0.5)
        fp, _ = grab(br, "form")
        note("filled form saves", len(fp) == 1, fp)

        # ---- signature ----
        br.ev("""(function(){
          const c=document.querySelector('#sigpad'); const ctx=c.getContext('2d');
          ctx.lineWidth=3; ctx.strokeStyle='#101010'; ctx.beginPath();
          ctx.moveTo(40,120); ctx.bezierCurveTo(140,20,220,190,320,90);
          ctx.bezierCurveTo(420,20,500,150,560,70); ctx.stroke();
          sigDataUrl=trimCanvasToInk(c);
          return sigDataUrl? sigDataUrl.length : 0;
        })()""")
        siglen = br.ev("sigDataUrl ? sigDataUrl.length : 0")
        note("signature is trimmed to its ink", siglen > 200, "%d chars of PNG" % (siglen or 0))

        br.ev("$('#s-form').open=false; $('#s-sign').open=true; $('#sigpos').value='br'; $('#sigw').value=30;")
        br.ev("window.__files=[]")
        br.ev("(async()=>{ await save(); })()")
        time.sleep(0.5)
        sp, _ = grab(br, "sign")
        note("signature stamps the pages", len(sp) == 1, sp)

        # ---- extract images ----
        br.ev("$('#s-sign').open=false; sigDataUrl=null; window.__objs=[]")
        br.ev("selectAll(false); pages.forEach((p,i)=>{ p.sel = (i===1); }); render();")
        br.ev("(async()=>{ await extractImages(); })()")
        time.sleep(1.5)
        nobj = br.ev("window.__objs.length")
        imgs = br.ev("""(async()=>{ const b=window.__objs[window.__objs.length-1]; if(!b) return '';
            const buf=await b.arrayBuffer(); const u8=new Uint8Array(buf); let s='';
            for(let i=0;i<u8.length;i++) s+=String.fromCharCode(u8[i]); return btoa(s); })()""")
        if imgs:
            open(os.path.join(OUT, "extracted.png"), "wb").write(base64.b64decode(imgs))
        note("embedded image is recovered", nobj >= 1 and len(imgs) > 5000,
             "%d image(s), last %d KB" % (nobj, len(imgs) * 3 // 4000))

        # ---- compress: photos only (keeps text) ----
        br.ev("selectAll(false); pages.forEach(p=>p.sel=false); render();")
        br.ev("$('#s-cmp').open=true; $('#cmode').value='photos'; $('#cdpi').value=120; $('#cq').value=60;")
        br.ev("window.__files=[]")
        br.ev("(async()=>{ await save(); })()")
        time.sleep(0.8)
        cp, cf = grab(br, "condense")
        note("photos-only compress saves", len(cp) == 1, "%d KB" % ((cf[0]['size'] // 1024) if cf else 0))

        # ---- compress: raster + greyscale ----
        br.ev("$('#cmode').value='raster'; $('#cgray').checked=true; $('#cdpi').value=96; $('#cq').value=60;")
        br.ev("window.__files=[]")
        br.ev("(async()=>{ await save(); })()")
        time.sleep(1.2)
        gp, _ = grab(br, "grey")
        note("raster + greyscale saves", len(gp) == 1, gp)
        br.ev("$('#cgray').checked=false; $('#s-cmp').open=false;")

        # ---- undo / redo ----
        before = br.ev("pages[0].rot")
        br.ev("selectAll(true); $('#rotl').click(); $('#rotl').click();")
        rotated = br.ev("pages[0].rot")
        br.ev("undo(); undo();")
        undone = br.ev("pages[0].rot")
        br.ev("redo(); redo()")
        redone = br.ev("pages[0].rot")
        note("undo restores rotation", before != rotated and undone == before,
             "%s -> %s -> %s" % (before, rotated, undone))
        note("redo re-applies it", redone == rotated, "%s after two redos" % redone)
        br.ev("selectAll(false)")

        # ---- memory readout and labels ----
        mem = br.ev("(document.querySelector('#memstat')||{}).textContent || ''")
        note("memory readout present", "MB" in mem, mem)
        aria = br.ev("document.querySelector('#save').getAttribute('aria-label')")
        role = br.ev("document.querySelector('#grid').getAttribute('role')")
        note("grid has a role and buttons have labels", role == "listbox" and bool(aria), "%s / %s" % (role, aria))

        # ---- the CSP is in force and did not break anything ----
        csp = br.ev("(document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]')||{}).content||''")
        note("CSP present", "connect-src" in csp, csp[:60] + "…")
        note("app still functional under CSP",
             br.ev("typeof pdfjsLib==='object' && typeof addFiles==='function' && pages.length>=2"))

        # ---- command palette still lists the new tools ----
        br.ev("dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true}))")
        br.wait("document.querySelector('#palq')!==null", 10, "palette")
        pal = br.ev("document.querySelectorAll('#palout [data-i]').length")
        br.ev("closeModal()")
        note("palette lists every action", pal >= 25, "%d actions" % pal)

    finally:
        br.close()
        srv.stop()
        pass   # shipped asset — never deleted by a test

    print("\n%d/%d checks passed" % (sum(1 for r in results if r[1]), len(results)))
    return 0 if all(r[1] for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
