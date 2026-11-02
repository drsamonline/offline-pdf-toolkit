#!/usr/bin/env python3
"""1.5 checks: OCR from the vendored engine, batch save, settings persistence,
and the network guard proving nothing leaves the origin."""
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
window.__files=[]; window.__blobs=[];
window.download=function(bytes,name){
  if(bytes instanceof Blob){ window.__blobs.push({name:name, blob:bytes}); return; }
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s=''; for(let i=0;i<u8.length;i++) s+=String.fromCharCode(u8[i]);
  window.__files.push({name:name||'out.pdf', b64:btoa(s), size:u8.length});
};
const _cou=URL.createObjectURL.bind(URL);
URL.createObjectURL=function(b){ return _cou(b); };
const _click=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(){ if(this.download) return; return _click.apply(this,arguments); };
"""

results = []


def note(name, ok, extra=""):
    results.append((name, ok, extra))
    print(("  PASS  " if ok else "  FAIL  ") + name + ((" — " + str(extra)) if extra else ""))


def make_scan_fixture():
    """A page that is only a picture of text, so OCR has real work to do."""
    import pymupdf
    path = os.path.join(DOCS, "assets", "tmp-scan.pdf")
    src = pymupdf.open(os.path.join(DOCS, "assets", "sample-lab-report.pdf"))
    pix = src[0].get_pixmap(dpi=170)
    png = pix.tobytes("png")
    doc = pymupdf.open()
    page = doc.new_page(width=595, height=842)
    page.insert_image(pymupdf.Rect(0, 0, 595, 842), stream=png)
    doc.save(path)
    return path


def main():
    fixture = make_scan_fixture()
    srv = Server(DOCS)
    br = Browser(1280, 1000)
    try:
        br.goto("http://127.0.0.1:%d/play/index.html" % srv.port)
        br.wait("document.readyState==='complete'", 40)
        br.ev(STUB)

        # ---------- OCR from the engine that ships beside the app ----------
        br.ev("""(async()=>{
          const scan=await (await fetch('../assets/tmp-scan.pdf')).arrayBuffer();
          const text=await (await fetch('../assets/sample-discharge-summary.pdf')).arrayBuffer();
          await addFiles([new File([scan],'scan.pdf',{type:'application/pdf'}),
                          new File([text],'summary.pdf',{type:'application/pdf'})]);
        })()""")
        br.wait("document.querySelectorAll('#grid .pg').length>=4", 40, "pages")
        note("scan + text documents load", br.ev("document.querySelectorAll('#grid .pg').length") >= 4)

        br.ev("$('#s-ocr').open=true; $('#ocrlang').value='eng'; $('#ocrload').click()")
        state = br.wait("document.querySelector('#ocrstate').textContent==='ready'", 180, "ocr engine")
        note("OCR engine loads from this origin", bool(state), br.ev("document.querySelector('#ocrmsg').textContent")[:70])

        # only the scanned page needs OCR
        br.ev("""selectAll(false); pages.forEach((p,i)=>{ p.sel = (i===0); }); render();""")
        br.ev("window.__blobs=[]")
        br.ev("(async()=>{ await ocrExtract(); })()")
        br.wait("window.__blobs.length>0", 180, "ocr text file")
        text = br.ev("""(async()=>{ const b=window.__blobs[window.__blobs.length-1]; return b? await b.blob.text() : ''; })()""")
        words = (text or "").upper()
        note("OCR reads the scan", "LABORATORY" in words or "SAMPLE" in words,
             repr((text or "")[:60].replace("\n", " ")))

        ext = br.ev("document.querySelector('#netcount').textContent")
        note("no request left the origin", ext.strip().startswith("0"), ext)
        listing = br.ev("document.querySelector('#netlist').textContent")
        note("the engine is listed as this-origin", "external" not in listing.lower().replace("0 external", ""),
             listing[:60].replace("\n", " "))

        # ---------- batch: one file per source ----------
        br.ev("selectAll(false); window.__files=[]; window.__blobs=[]")
        br.ev("$('#s-ocr').open=false; $('#batch').checked=true; $('#trim').value=12; $('#s-geom').open=true;")
        br.ev("(async()=>{ await save(); })()")
        time.sleep(2.0)
        files = json.loads(br.ev("JSON.stringify(window.__files)"))
        names = sorted(f["name"] for f in files)
        for i, f in enumerate(files):
            open(os.path.join(OUT, "batch-%d.pdf" % (i + 1)), "wb").write(base64.b64decode(f["b64"]))
        note("batch saves one file per source", len(files) == 2, names)
        note("batch names follow the source", all("out.pdf" in n for n in names), names)

        # ---------- settings survive a reload ----------
        br.ev("""(function(){
          const w=document.querySelector('#wmt'); w.value='PERSISTED'; w.dispatchEvent(new Event('input',{bubbles:true}));
          const q=document.querySelector('#cq'); q.value=55; q.dispatchEvent(new Event('input',{bubbles:true}));
        })()""")
        time.sleep(0.8)
        br.goto("http://127.0.0.1:%d/play/index.html" % srv.port)
        br.wait("document.readyState==='complete'", 40)
        time.sleep(1.2)
        kept = br.ev("JSON.stringify({wmt:document.querySelector('#wmt').value, cq:document.querySelector('#cq').value, trim:document.querySelector('#trim').value})")
        kept = json.loads(kept)
        note("tool settings come back after a reload",
             kept["wmt"] == "PERSISTED" and kept["cq"] == "55" and kept["trim"] == "12", kept)

        # ---------- reset clears them ----------
        br.ev("document.querySelector('#reset').click()")
        time.sleep(0.3)
        note("Reset tools clears the stored settings", br.ev("localStorage.getItem('pdftk_tools')") is None)

    finally:
        br.close()
        srv.stop()
        try:
            os.remove(fixture)
        except OSError:
            pass

    print("\n%d/%d checks passed" % (sum(1 for r in results if r[1]), len(results)))
    return 0 if all(r[1] for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
