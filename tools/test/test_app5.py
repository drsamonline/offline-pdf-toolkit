#!/usr/bin/env python3
"""1.7 checks: the lossless qpdf pass."""
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

OUT = tempfile.mkdtemp(prefix="pdftk-test-")
os.makedirs(OUT, exist_ok=True)
results = []


def note(name, ok, extra=""):
    results.append((name, ok, extra))
    print(("  PASS  " if ok else "  FAIL  ") + name + ((" — " + str(extra)) if extra else ""))


def fixture():
    import pymupdf
    path = os.path.join(DOCS, "assets", "sample-uncompressed.pdf")
    if os.path.exists(path):
        return path
    d = pymupdf.open()
    for i in range(3):
        p = d.new_page(width=595, height=842)
        p.insert_text((60, 100), "Uncompressed report page %d" % (i + 1), fontsize=18)
        for y in range(140, 760, 16):
            p.insert_text((60, y), "Line %d of body text that has to survive compression intact, "
                          "with enough repetition to make a stream worth deflating." % y, fontsize=9)
    d.save(path, deflate=False, garbage=0, clean=False)
    return path


def main():
    fx = fixture()
    srv = Server(DOCS)
    br = Browser(1280, 1000)
    try:
        br.goto("http://127.0.0.1:%d/play/index.html" % srv.port)
        br.wait("document.readyState==='complete'", 40)
        br.ev("""window.__files=[]; window.download=function(b,n){
          const u8=b instanceof Uint8Array?b:new Uint8Array(b); let s='';
          for(let i=0;i<u8.length;i++) s+=String.fromCharCode(u8[i]);
          window.__files.push({name:n||'o.pdf', b64:btoa(s), size:u8.length});};""")
        br.ev("""(async()=>{const b=await (await fetch('../assets/sample-uncompressed.pdf')).arrayBuffer();
          await addFiles([new File([b],'uncompressed.pdf',{type:'application/pdf'})]);})()""")
        br.wait("document.querySelectorAll('#grid .pg').length>=3", 40)
        src = os.path.getsize(fx)

        # lossless mode
        br.ev("$('#s-cmp').open=true; $('#cmode').value='lossless';")
        br.ev("window.__files=[]; (async()=>{ await save(); })()")
        br.wait("window.__files.length>0", 120, "qpdf output")
        f = json.loads(br.ev("JSON.stringify(window.__files)"))[0]
        open(os.path.join(OUT, "lossless.pdf"), "wb").write(base64.b64decode(f["b64"]))
        note("lossless mode produces a file", f["size"] > 1000, "%d KB" % (f["size"] // 1024))
        note("lossless never grows the file", f["size"] <= src, "%d → %d bytes" % (src, f["size"]))
        note("the name says what it did", "lossless" in f["name"], f["name"])

        ext = br.ev("document.querySelector('#netcount').textContent")
        note("qpdf runs from this origin", ext.strip().startswith("0"), ext)

        # password + lossless must not silently do the wrong thing
        br.ev("$('#s-sec').open=true; $('#secuser').value='secret'; window.__files=[];")
        br.ev("(async()=>{ await save(); })()")
        time.sleep(1.5)
        toast = br.ev("document.querySelector('#toast').textContent")
        note("lossless and a password say which one won", "lossless skipped" in toast.lower(), toast)
        br.ev("$('#s-sec').open=false; $('#secuser').value='';")

        # a normal save still works afterwards
        br.ev("$('#cmode').value='photos'; window.__files=[];")
        br.ev("(async()=>{ await save(); })()")
        br.wait("window.__files.length>0", 60, "normal save")
        note("the ordinary path still works", True)
    finally:
        br.close()
        srv.stop()
        # shipped asset — not deleted

    print("\n%d/%d checks passed" % (sum(1 for r in results if r[1]), len(results)))
    return 0 if all(r[1] for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
