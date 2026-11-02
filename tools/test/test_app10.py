#!/usr/bin/env python3
"""1.12 checks: remembered signature, split by bookmark, compare, extra patterns."""
import base64, json, os, sys, time
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
DOCS = os.path.join(REPO, "docs")
OUT = tempfile.mkdtemp(prefix="pdftk-test-")
sys.path.insert(0, HERE)

from cdp import Browser, Server

OUT = tempfile.mkdtemp(prefix="pdftk-test-"); os.makedirs(OUT, exist_ok=True)
results = []


def note(n, ok, extra=""):
    results.append((n, ok, extra))
    print(("  PASS  " if ok else "  FAIL  ") + n + ((" — " + str(extra)) if extra else ""))


def main():
    srv = Server(DOCS); br = Browser(1280, 1000)
    try:
        br.goto("http://127.0.0.1:%d/play/index.html" % srv.port)
        br.wait("document.readyState==='complete'", 40)
        br.ev("""window.__files=[]; window.__blobs=[];
          window.download=function(b,n){
            if(b instanceof Blob){ window.__blobs.push({name:n, blob:b}); return; }
            const u8=b instanceof Uint8Array?b:new Uint8Array(b); let s='';
            for(let i=0;i<u8.length;i++) s+=String.fromCharCode(u8[i]);
            window.__files.push({name:n||'o.pdf', b64:btoa(s), size:u8.length});};""")

        # ---------- a document with bookmarks ----------
        made = br.ev("""(async()=>{
          await ensurePdfLib();
          const d=await PDFDocument.create();
          const f=await d.embedFont(StandardFonts.Helvetica);
          const titles=['Cover','Findings','Plan','Appendix'];
          const kids=[];
          for(let i=0;i<titles.length;i++){
            const p=d.addPage([595,842]);
            p.drawText(titles[i]+' page',{x:50,y:760,size:16,font:f});
            kids.push({title:titles[i], dest:null, pageIdx:i});
          }
          // pdf-lib cannot write outlines, so the bookmark test uses the app's own reader
          const bytes=await d.save();
          window.__plain=btoa(String.fromCharCode(...new Uint8Array(bytes)));
          return titles.length;
        })()""")
        note("a four-page document is built", made == 4)

        # pdf-lib has no outline API, so build the outline with PyMuPDF is not possible in-page.
        # Instead: verify the split mode exists and reports honestly with no bookmarks.
        br.ev("""(async()=>{
          const raw=Uint8Array.from(atob(window.__plain), c=>c.charCodeAt(0));
          await addFiles([new File([raw],'outlined.pdf',{type:'application/pdf'})]);
        })()""")
        br.wait("document.querySelectorAll('#grid .pg').length>=4", 40, "pages")
        br.ev("$('#s-split').open=true; $('#splitmode').value='bookmark'; window.__files=[]")
        br.ev("document.querySelector('#dosplit').click()")
        time.sleep(1.2)
        note("no bookmarks: it says so instead of splitting",
             "no bookmarks" in br.ev("document.querySelector('#toast').textContent").lower(),
             br.ev("document.querySelector('#toast').textContent")[:60])

        # ---------- split by bookmark, for real ----------
        br.ev("""(async()=>{
          const b=await (await fetch('../assets/sample-outline.pdf')).arrayBuffer();
          await addFiles([new File([b],'outline.pdf',{type:'application/pdf'})]);
        })()""")
        br.wait("document.querySelectorAll('#grid .pg').length>=8", 40, "outline pages")
        br.ev("""selectAll(false); const first=pages.findIndex(p=>p.docId===docs[docs.length-1].id);
                pages.forEach((p,i)=>{ p.sel = (i>=first); }); render();""")
        br.ev("$('#s-split').open=true; $('#splitmode').value='bookmark'; window.__files=[]")
        br.ev("document.querySelector('#dosplit').click()")
        br.wait("window.__files.length>=4", 90, "bookmark splits")
        names = json.loads(br.ev("JSON.stringify(window.__files.map(f=>f.name))"))
        note("splitting by bookmark makes one file per section", len(names) >= 4, names)
        sizes = json.loads(br.ev("JSON.stringify(window.__files.map(f=>f.size))"))
        note("each part is a real file", all(s > 400 for s in sizes), sizes)

        # ---------- compare ----------
        br.ev("""(async()=>{
          await ensurePdfLib();
          const d=await PDFDocument.create();
          const f=await d.embedFont(StandardFonts.Helvetica);
          const p=d.addPage([595,842]);
          p.drawText('Cover page',{x:50,y:760,size:16,font:f});
          p.drawText('The plan has changed since the last visit.',{x:50,y:720,size:11,font:f});
          const bytes=await d.save();
          await addFiles([new File([bytes],'edited.pdf',{type:'application/pdf'})]);
        })()""")
        br.wait("document.querySelectorAll('#grid .pg').length>=5", 40, "second doc")
        br.ev("$('#s-compare').open=true; window.__files=[]; window.__blobs=[]")
        br.ev("document.querySelector('#docompare').click()")
        br.wait("window.__blobs.length>0 || window.__files.length>0", 60, "compare report")
        report = br.ev("""(async()=>{ const b=window.__blobs[window.__blobs.length-1];
            return b ? await b.blob.text() : ''; })()""")
        note("a compare report is written", "vs" in (report or ""), (report or "")[:60].replace("\n", " "))
        note("it names the differing page", "page 1" in (report or "").lower())
        note("the summary is on screen", "differ" in br.ev("document.querySelector('#cmpout').textContent").lower(),
             br.ev("document.querySelector('#cmpout').textContent")[:50])

        # ---------- remembered signature ----------
        br.ev("$('#s-sign').open=true; $('#sigremember').checked=true;")
        br.ev("""(function(){
          const c=document.querySelector('#sigpad'), ctx=c.getContext('2d');
          ctx.strokeStyle='#000'; ctx.lineWidth=3; ctx.beginPath();
          ctx.moveTo(60,120); ctx.bezierCurveTo(150,40,260,180,380,90); ctx.stroke();
          c.dispatchEvent(new PointerEvent('pointerdown',{clientX:60,clientY:120,bubbles:true}));
          c.dispatchEvent(new PointerEvent('pointerup',{clientX:60,clientY:120,bubbles:true}));
        })()""")
        time.sleep(0.6)
        saved = br.ev("!!localStorage.getItem('pdftk_sig')")
        note("the signature is stored when asked", saved)
        br.goto("http://127.0.0.1:%d/play/index.html" % srv.port)
        br.wait("document.readyState==='complete'", 40)
        time.sleep(1.6)
        note("it comes back on the next visit", br.ev("!!sigDataUrl"),
             "%s chars" % br.ev("sigDataUrl ? sigDataUrl.length : 0"))
        br.ev("localStorage.removeItem('pdftk_sig')")

        # ---------- the extra patterns exist ----------
        pats = br.ev("JSON.stringify(Object.keys(REDACT_PATTERNS))")
        note("date and IFSC patterns are registered", all(k in pats for k in ("date", "ifsc")), pats)
        note("a date-shaped string matches",
             br.ev("(REDACT_PATTERNS.date.lastIndex=0, REDACT_PATTERNS.date.test('seen on 04/11/2026 at noon'))") is True)
    finally:
        br.close(); srv.stop()
    print("\n%d/%d checks passed" % (sum(1 for r in results if r[1]), len(results)))
    return 0 if all(r[1] for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
