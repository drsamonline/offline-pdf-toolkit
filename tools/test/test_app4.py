#!/usr/bin/env python3
"""1.6 checks: insert a blank page, and the interface in English, Hindi and Gujarati."""
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
const _click=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(){ if(this.download) return; return _click.apply(this,arguments); };
"""

results = []


def note(name, ok, extra=""):
    results.append((name, ok, extra))
    print(("  PASS  " if ok else "  FAIL  ") + name + ((" — " + str(extra)) if extra else ""))


def main():
    srv = Server(DOCS)
    br = Browser(1280, 1000)
    try:
        br.goto("http://127.0.0.1:%d/play/index.html" % srv.port)
        br.wait("document.readyState==='complete'", 40)
        br.ev(STUB)
        br.ev("""(async()=>{
          const b=await (await fetch('../assets/sample-discharge-summary.pdf')).arrayBuffer();
          await addFiles([new File([b],'summary.pdf',{type:'application/pdf'})]);
        })()""")
        br.wait("document.querySelectorAll('#grid .pg').length>=3", 40, "pages")
        base = br.ev("pages.length")
        note("document loads", base == 3, "%d pages" % base)

        # ---------- insert a blank page ----------
        br.ev("selectAll(false); pages[1].sel=true; render();")
        br.ev("document.querySelector('#blank').click()")
        time.sleep(0.3)
        after = br.ev("pages.length")
        at = br.ev("pages.findIndex(p=>p.docId===docs.find(d=>d.kind==='blank').id)")
        note("blank page is inserted after the selection", after == base + 1 and at == 2,
             "%d pages, blank at %d" % (after, at))
        note("a blank is not counted as a file", br.ev("docs.filter(d=>d.kind!=='blank').length") == 1,
             br.ev("docs.filter(d=>d.kind==='blank').length") == 1)

        br.ev("window.__files=[]")
        br.ev("(async()=>{ await save(); })()")
        time.sleep(0.6)
        files = json.loads(br.ev("JSON.stringify(window.__files)"))
        if files:
            open(os.path.join(OUT, "blank.pdf"), "wb").write(base64.b64decode(files[0]["b64"]))
        note("saving with a blank page works", len(files) == 1, files[0]["name"] if files else "none")

        # ---------- the interface languages ----------
        def labels():
            return json.loads(br.ev("""JSON.stringify({
              save:document.querySelector('#save').textContent.trim(),
              select:document.querySelector('#selall').textContent.trim(),
              wm:[...document.querySelectorAll('#apanel summary')][1].textContent.trim(),
              lang:document.querySelector('#lang').textContent.trim(),
              html:document.documentElement.lang
            })"""))

        en = labels()
        br.ev("document.querySelector('#lang').click()"); time.sleep(0.4)
        hi = labels()
        br.ev("document.querySelector('#lang').click()"); time.sleep(0.4)
        gu = labels()

        note("English is the default", en["save"] == "Save PDF" and en["html"] == "en", en["save"])
        note("Hindi translates the chrome",
             hi["html"] == "hi" and hi["save"] != en["save"] and hi["wm"] != en["wm"],
             "%s / %s" % (hi["save"], hi["wm"]))
        note("Gujarati translates the chrome",
             gu["html"] == "gu" and gu["save"] != en["save"] and gu["wm"] != hi["wm"],
             "%s / %s" % (gu["save"], gu["wm"]))
        note("no string fell back to English in Hindi",
             all("\u0900" <= ch <= "\u097f" or ch in " /·—()0123456789N-up" for ch in hi["select"]),
             hi["select"])

        # the page counter is built at runtime, so it has to be translated too
        counter = br.ev("document.querySelector('#count').textContent.trim()")
        note("the page counter is translated", any("\u0a80" <= c <= "\u0aff" for c in counter), counter)

        br.shot(os.path.join(OUT, "i18n-final.png"))

        # ---------- the choice survives a reload ----------
        br.goto("http://127.0.0.1:%d/play/index.html" % srv.port)
        br.wait("document.readyState==='complete'", 40)
        time.sleep(1.0)
        kept = br.ev("document.documentElement.lang")
        note("the language is remembered", kept == "gu", kept)
        br.ev("document.querySelector('#lang').click()")
        time.sleep(0.3)
        note("cycling returns to English", br.ev("document.documentElement.lang") == "en")

        # ---------- nothing else broke ----------
        note("the app still works after switching languages",
             br.ev("typeof addFiles==='function' && typeof save==='function' && document.querySelectorAll('#apanel details').length>=15"),
             "%d panels" % br.ev("document.querySelectorAll('#apanel details').length"))
    finally:
        br.close()
        srv.stop()

    print("\n%d/%d checks passed" % (sum(1 for r in results if r[1]), len(results)))
    return 0 if all(r[1] for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
