#!/usr/bin/env python3
"""Exercise every new feature in a real browser, then keep the PDFs it produced
so they can be validated independently with PyMuPDF.

The app's download() is stubbed to collect bytes instead of saving files, so each
scenario ends with a real PDFDocument that we can inspect.
"""
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
  let b64;
  if(bytes instanceof Blob){ }
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


def run(br, js):
    return br.ev(js)


def save_pdf(br, out_name, setup=""):
    """Set the UI up, save, and write whatever came out."""
    br.ev("window.__files=[]")
    if setup:
        br.ev(setup)
    br.ev("(async()=>{ await save(); })()")
    time.sleep(0.4)
    files = br.ev("JSON.stringify(window.__files)")
    got = json.loads(files)
    paths = []
    for i, f in enumerate(got):
        p = os.path.join(OUT, "%s%s" % (out_name, "" if len(got) == 1 else "-%d" % (i + 1)))
        ext = ".pdf" if "pdf" in f["name"] or f["name"].endswith(".pdf") else os.path.splitext(f["name"])[1]
        p = p + ext
        open(p, "wb").write(base64.b64decode(f["b64"]))
        paths.append(p)
    return paths, [g["name"] for g in got]


def main():
    srv = Server(DOCS)
    br = Browser(1280, 1000)
    results = []

    def note(name, ok, extra=""):
        results.append((name, ok, extra))
        print(("  PASS  " if ok else "  FAIL  ") + name + ((" — " + str(extra)) if extra else ""))

    try:
        br.goto("http://127.0.0.1:%d/play/index.html" % srv.port)
        br.wait("document.readyState==='complete'", 40)
        br.ev(STUB)

        # load the two sample documents (5 pages)
        br.ev("""(async()=>{
          const names=[['../assets/sample-discharge-summary.pdf','Sample discharge summary.pdf'],
                       ['../assets/sample-lab-report.pdf','Sample lab report.pdf']];
          const files=[];
          for(const [u,n] of names){ const r=await fetch(u); files.push(new File([await r.arrayBuffer()],n,{type:'application/pdf'})); }
          await addFiles(files);
        })()""")
        br.wait("document.querySelectorAll('#grid .pg').length>=5", 40, "5 pages")
        note("loads 5 pages", br.ev("document.querySelectorAll('#grid .pg').length") == 5)
        # thumbnails are the thing a broken render path silently takes away
        br.wait("document.querySelectorAll('#grid .thumb img').length>=5", 30, "thumbnails")
        note("every page draws a thumbnail", br.ev("document.querySelectorAll('#grid .thumb img').length") == 5,
             "%d drawn" % br.ev("document.querySelectorAll('#grid .thumb img').length"))

        # ---------- 1. trim ----------
        p, _ = save_pdf(br, "01-trim", "$('#trim').value=24; $('#s-geom').open=true;")
        note("trim produces a file", len(p) == 1, p)

        # ---------- 2. resize ----------
        p2, _ = save_pdf(br, "02-a4", "$('#trim').value=0; $('#resize').value='a4';")
        note("resize produces a file", len(p2) == 1, p2)

        # ---------- 3. impose 2-up ----------
        p3, _ = save_pdf(br, "03-impose2", "$('#resize').value=''; $('#impose').value='2'; $('#s-impose').open=true;")
        note("2-up produces a file", len(p3) == 1, p3)

        # ---------- 4. booklet ----------
        p4, _ = save_pdf(br, "04-booklet", "$('#impose').value='bk';")
        note("booklet produces a file", len(p4) == 1, p4)

        # ---------- 5. header/footer + bates ----------
        p5, _ = save_pdf(br, "05-hf-bates",
                         "$('#impose').value=''; $('#s-impose').open=false;"
                         "$('#hfl').value='{file}'; $('#hfor').value='{n} / {total}'; $('#hfo').value='{date}';"
                         "$('#s-bates').open=true; $('#btp').value='ABC-'; $('#bts').value=7; $('#btd').value=5;")

        # ---------- 6. redaction (raster) ----------
        p6, _ = save_pdf(br, "06-redact",
                         "$('#hfl').value=''; $('#hfor').value=''; $('#hfo').value=''; $('#s-bates').open=false;"
                         "$('#rdt').value='sample'; $('#s-redact').open=true; $('#rdraster').checked=true;")

        # ---------- 7. redaction without raster ----------
        p7, _ = save_pdf(br, "07-redact-box", "$('#rdraster').checked=false;")

        # ---------- 8. split every 2 ----------
        br.ev("$('#rdt').value=''; $('#s-redact').open=false; window.__files=[]")
        br.ev("$('#splitmode').value='n'; $('#splitn').value=2; $('#s-split').open=true;")
        br.ev("(async()=>{ await splitNow(); })()")
        time.sleep(1.2)
        got = json.loads(br.ev("JSON.stringify(window.__files)"))
        paths = []
        for i, f in enumerate(got):
            fp = os.path.join(OUT, "08-split-%d.pdf" % (i + 1))
            open(fp, "wb").write(base64.b64decode(f["b64"]))
            paths.append(fp)
        note("split every 2 pages", len(got) == 3, "%d files" % len(got))

        # ---------- 9. split by ranges ----------
        br.ev("window.__files=[]; $('#splitmode').value='ranges'; $('#splitr').value='1-2,5';")
        br.ev("(async()=>{ await splitNow(); })()")
        time.sleep(1.0)
        got = json.loads(br.ev("JSON.stringify(window.__files)"))
        for i, f in enumerate(got):
            open(os.path.join(OUT, "09-ranges.pdf"), "wb").write(base64.b64decode(f["b64"]))
        note("split by ranges", len(got) == 1, "%d files" % len(got))

        # ---------- 10. export PNG ----------
        br.ev("window.__objs=[]")
        br.ev("$('#pngdpi').value=96;")
        br.ev("(async()=>{ await exportPng(); })()")
        time.sleep(1.2)
        b64 = br.ev("""(async()=>{ const b=window.__objs[window.__objs.length-1]; if(!b) return '';
            const buf=await b.arrayBuffer(); const u8=new Uint8Array(buf); let s='';
            for(let i=0;i<u8.length;i++) s+=String.fromCharCode(u8[i]); return btoa(s); })()""")
        n = br.ev("window.__objs.length")
        if b64:
            open(os.path.join(OUT, "10-page.png"), "wb").write(base64.b64decode(b64))
        note("export pages as PNG", n >= 5 and len(b64) > 2000, "%d images, last %d bytes" % (n, len(b64) * 3 // 4))

        # ---------- 11. self-test ----------
        br.ev("$('#selftest').click()")
        br.wait("document.querySelectorAll('#selftestout .stat').length>=6", 40, "self-test")
        rows = br.ev("""JSON.stringify([...document.querySelectorAll('#selftestout .stat span')].map(s=>s.textContent))""")
        rows = json.loads(rows)
        fails = [r for r in rows if "FAIL" in r]
        note("self-test passes", not fails, rows if fails else "%d checks green" % len(rows))

        # ---------- 12. command palette ----------
        br.ev("document.querySelector('#help')")  # ensure modal machinery loaded
        br.ev("dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true}))")
        br.wait("document.querySelector('#palq')!==null", 10, "palette")
        br.ev("document.querySelector('#palq').value='bates'; document.querySelector('#palq').dispatchEvent(new Event('input'))")
        time.sleep(0.2)
        n = br.ev("document.querySelectorAll('#palout [data-i]').length")
        br.ev("closeModal()")
        note("command palette filters", n == 1, "%d match for 'bates'" % n)

        # ---------- 13. regression: the old tools still work ----------
        br.ev("window.__files=[]")
        br.ev("$('#s-wm').open=true; $('#wmt').value='CONFIDENTIAL'; $('#s-pn').open=true; $('#selall').click();")
        p13, _ = save_pdf(br, "13-regression", "")
        note("watermark + numbers still save", len(p13) == 1, p13)

        # ---------- 14. network counter ----------
        net = br.ev("document.querySelector('#netcount').textContent")
        note("network counter reports honestly", "0 external" in net, net)

        # ---------- 15. rotate / delete still work ----------
        br.ev("$('#rotl').click()")
        rot = br.ev("pages.filter(p=>p.rot).length")
        note("rotate still applies", rot == 5, "%d rotated" % rot)

        # ---------- 16. a clean page makes no requests at all ----------
        br.ev("localStorage.clear()")
        br.goto("http://127.0.0.1:%d/play/index.html" % srv.port)
        br.wait("document.readyState==='complete'", 40)
        time.sleep(1.0)
        clean = br.ev("document.querySelector('#netcount').textContent")
        note("a fresh page makes 0 requests", clean.strip().startswith("0"), clean)

    finally:
        br.close()
        srv.stop()

    print("\n%d/%d checks passed" % (sum(1 for r in results if r[1]), len(results)))
    return 0 if all(r[1] for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
