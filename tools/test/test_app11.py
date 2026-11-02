#!/usr/bin/env python3
"""1.14 checks: page labels, the labelled-ID pattern, and the About panel."""
import json
import os
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
DOCS = os.path.join(REPO, "docs")
OUT = tempfile.mkdtemp(prefix="pdftk-test-")
sys.path.insert(0, HERE)
from cdp import Browser, Server  # noqa: E402

results = []


def note(n, ok, extra=""):
    results.append((n, ok, extra))
    print(("  PASS  " if ok else "  FAIL  ") + n + ((" — " + str(extra)) if extra else ""))


def main():
    srv = Server(DOCS)
    br = Browser(1280, 1000)
    try:
        br.goto("http://127.0.0.1:%d/play/index.html" % srv.port)
        br.wait("document.readyState==='complete'", 40)
        br.ev("""window.__files=[]; window.download=function(b,n){
          const u8=b instanceof Uint8Array?b:new Uint8Array(b); let s='';
          for(let i=0;i<u8.length;i++) s+=String.fromCharCode(u8[i]);
          window.__files.push({name:n||'o.pdf', b64:btoa(s), size:u8.length});};""")

        # ---- the About panel carries the changelog ----
        items = br.ev("document.querySelectorAll('#whatsnew li').length")
        note("the About panel lists the newest changes", items >= 3, "%d items" % items)
        note("it shows the running version", br.ev("document.querySelector('#aboutver').textContent") == "1.16.0",
             br.ev("document.querySelector('#aboutver').textContent"))

        # ---- page labels ----
        br.ev("""(async()=>{ const b=await (await fetch('../assets/sample-outline.pdf')).arrayBuffer();
          await addFiles([new File([b],'report.pdf',{type:'application/pdf'})]); })()""")
        br.wait("document.querySelectorAll('#grid .pg').length>=4", 40, "pages")
        br.ev("$('#s-labels').open=true; $('#lbmode').value='roman'; $('#lbfront').value=2;")
        br.ev("window.__files=[]")
        br.ev("(async()=>{ await save(); })()")
        br.wait("window.__files.length>0", 60, "labelled file")
        import base64
        f = json.loads(br.ev("JSON.stringify(window.__files)"))[0]
        path = os.path.join(OUT, "labelled.pdf")
        open(path, "wb").write(base64.b64decode(f["b64"]))
        note("a labelled file is written", os.path.getsize(path) > 500, "%d bytes" % os.path.getsize(path))
        note("the app says what it labelled", "Labelled" in br.ev("document.querySelector('#lbmsg').textContent"),
             br.ev("document.querySelector('#lbmsg').textContent"))
        try:
            import pymupdf
            d = pymupdf.open(path)
            labels = [d[i].get_label() for i in range(d.page_count)]
            note("the reader sees i, ii, then 1, 2", labels == ["i", "ii", "1", "2"], labels)
        except Exception as e:
            note("the reader sees i, ii, then 1, 2", False, str(e)[:60])

        # ---- the labelled-ID pattern ----
        br.ev("""(async()=>{
          await ensurePdfLib();
          const d=await PDFDocument.create(); const p=d.addPage([595,842]);
          const f=await d.embedFont(StandardFonts.Helvetica);
          p.drawText('UHID: A-2291/24 and MRN 884213, policy no P-99120',{x:40,y:700,size:11,font:f});
          const bytes=await d.save();
          await addFiles([new File([bytes],'ids.pdf',{type:'application/pdf'})]);
        })()""")
        br.wait("document.querySelectorAll('#grid .pg').length>=5", 40, "id page")
        hits = br.ev("""(function(){
          const s='UHID: A-2291/24 and MRN 884213, policy no P-99120';
          return patternRanges(s, ['labelled']).length;
        })()""")
        note("labelled identifiers match", hits >= 3, "%d ranges" % hits)
        note("it does not fire on ordinary prose",
             br.ev("patternRanges('The patient was seen today and is well.', ['labelled']).length") == 0)
    finally:
        br.close()
        srv.stop()
    print("\n%d/%d checks passed" % (sum(1 for r in results if r[1]), len(results)))
    return 0 if all(r[1] for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
