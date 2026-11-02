#!/usr/bin/env python3
"""1.10 checks: repair a damaged PDF, and the page grid's keyboard/ARIA surface."""
import base64, json, os, re, sys, time
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


def broken_pdf():
    """A PDF whose startxref points nowhere — the classic truncation damage."""
    src = open(os.path.join(DOCS, "assets", "sample-discharge-summary.pdf"), "rb").read()
    i = src.rfind(b"startxref")
    j = src.find(b"\n", i)
    out = src[:i] + b"startxref\n999999\n" + src[j + 1:]
    p = os.path.join(DOCS, "assets", "__broken.pdf")
    open(p, "wb").write(out)
    return p


def main():
    bp = broken_pdf()
    srv = Server(DOCS); br = Browser(1280, 1000)
    try:
        br.goto("http://127.0.0.1:%d/play/index.html" % srv.port)
        br.wait("document.readyState==='complete'", 40)
        br.ev("""window.__files=[]; window.download=function(b,n){
          const u8=b instanceof Uint8Array?b:new Uint8Array(b); let s='';
          for(let i=0;i<u8.length;i++) s+=String.fromCharCode(u8[i]);
          window.__files.push({name:n||'o.pdf', b64:btoa(s), size:u8.length});};""")

        # ---- accessibility of the grid ----
        br.ev("""(async()=>{const b=await (await fetch('../assets/sample-discharge-summary.pdf')).arrayBuffer();
          await addFiles([new File([b],'s.pdf',{type:'application/pdf'})]);})()""")
        br.wait("document.querySelectorAll('#grid .pg').length>=3", 40, "pages")
        time.sleep(0.6)
        note("the grid is a listbox", br.ev("document.querySelector('#grid').getAttribute('role')") == "listbox",
             br.ev("document.querySelector('#grid').getAttribute('role')"))
        note("every tile is an option with a label",
             br.ev("document.querySelectorAll('#grid .pg[role=option]').length") == 3
             and br.ev("document.querySelector('#grid .pg').getAttribute('aria-label')") == "Page 1",
             br.ev("document.querySelector('#grid .pg').getAttribute('aria-label')"))
        note("exactly one tile is in the tab order",
             br.ev("[...document.querySelectorAll('#grid .pg')].filter(t=>t.getAttribute('tabindex')==='0').length") == 1)
        br.ev("""(function(){ const t=document.querySelector('#grid .pg'); t.focus();
          t.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true})); })()""")
        time.sleep(0.3)
        note("arrow keys move the focus",
             br.ev("document.activeElement.getAttribute('aria-label')") == "Page 2",
             br.ev("document.activeElement.getAttribute('aria-label')"))
        br.ev("""document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}))""")
        time.sleep(0.4)
        # the click re-renders the grid, so look at the fresh tiles
        note("space selects the focused page",
             br.ev("document.querySelectorAll('#grid .pg[aria-selected=true]').length") == 1,
             "%d tile(s) marked selected" % br.ev("document.querySelectorAll('#grid .pg[aria-selected=true]').length"))
    finally:
        br.close(); srv.stop()
        try: os.remove(bp)
        except OSError: pass
    print("\n%d/%d checks passed" % (sum(1 for r in results if r[1]), len(results)))
    return 0 if all(r[1] for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
