#!/usr/bin/env python3
"""1.10 checks: the LockHTML container.

Two things are being proved, and only the second one matters much:
  1. the file this app writes opens with its own PIN;
  2. the payload is *the same shape* LockHTML writes, so its viewer opens our
     file too — and that is checked against LockHTML's own template, not mine.
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
import re
import sys
import time

from cdp import Browser, Server  # noqa: E402

OUT = tempfile.mkdtemp(prefix="pdftk-test-")
os.makedirs(OUT, exist_ok=True)
results = []


def note(name, ok, extra=""):
    results.append((name, ok, extra))
    print(("  PASS  " if ok else "  FAIL  ") + name + ((" — " + str(extra)) if extra else ""))


STUB = """
window.__files=[]; window.__blobs=[];
window.download=function(bytes,name){
  if(bytes instanceof Blob){ window.__blobs.push({name:name, blob:bytes}); return; }
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  window.__files.push({name:name, size:u8.length});
};
const _click=HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click=function(){ if(this.download) return; return _click.apply(this,arguments); };
"""


def main():
    srv = Server(DOCS)
    br = Browser(1280, 1000)
    try:
        br.goto("http://127.0.0.1:%d/play/index.html" % srv.port)
        br.wait("document.readyState==='complete'", 40)
        br.ev(STUB)
        br.ev("""(async()=>{const b=await (await fetch('../assets/sample-discharge-summary.pdf')).arrayBuffer();
          await addFiles([new File([b],'summary.pdf',{type:'application/pdf'})]);})()""")
        br.wait("document.querySelectorAll('#grid .pg').length>=3", 40, "pages")

        # ---- make one ----
        br.ev("$('#s-lock').open=true; $('#lkpin').value='482113'; $('#lkpin2').value='482113';")
        br.ev("window.__blobs=[]")
        br.ev("document.querySelector('#dolock').click()")
        br.wait("window.__blobs.length>0", 60, "locked html")
        html = br.ev("""(async()=>{ const b=window.__blobs[window.__blobs.length-1]; return await b.blob.text(); })()""")
        note("a locked HTML is produced", bool(html) and '<script id="payload"' in html, "%d bytes" % len(html or ""))

        payload = json.loads(re.search(r'<script id="payload" type="application/json">(.*?)</script>', html, re.S).group(1).replace('<\\/', '</'))
        note("the payload is the LockHTML shape",
             payload.get("v") == 2 and payload.get("kdf") == "pbkdf2"
             and payload.get("kdfparams", {}).get("iter") == 250000
             and all(k in payload for k in ("salt", "iv", "ct", "mode", "pin")),
             "v=%s kdf=%s iter=%s" % (payload.get("v"), payload.get("kdf"), payload.get("kdfparams", {}).get("iter")))
        note("the plaintext is not in the file", "Discharge summary" not in html)

        # ---- our viewer opens it ----
        open(os.path.join(DOCS, "__locked.html"), "w", encoding="utf-8").write(html)
        br.goto("http://127.0.0.1:%d/__locked.html" % srv.port)
        br.wait("document.readyState==='complete'", 30)
        br.ev("document.querySelector('#pin').value='0000'; document.querySelector('#go').click()")
        time.sleep(1.2)
        note("a wrong PIN is refused", "did not work" in br.ev("document.querySelector('#msg').textContent"),
             br.ev("document.querySelector('#msg').textContent"))
        br.ev("document.querySelector('#pin').value='482113'; document.querySelector('#go').click()")
        br.wait("document.querySelector('iframe')!==null", 20, "decrypted view")
        note("the right PIN opens it", br.ev("!!document.querySelector('iframe')"))

        # ---- and LockHTML's own viewer opens it too ----
        tplpath = os.path.join(os.environ.get("LOCKHTML", "/scratch/repos/lockhtml"),
                               "lockhtml", "templates", "viewer.src.html")
        if not os.path.exists(tplpath):
            note("LockHTML's own viewer opens our file", False,
                 "lockhtml is not in /scratch/repos — fetch it first (this check must use THEIR file)")
            raise SystemExit(1)
        tpl = open(tplpath, encoding="utf-8").read()
        theirs = tpl.replace("__PAYLOAD__", json.dumps(payload, separators=(",", ":")))
        open(os.path.join(DOCS, "__interop.html"), "w", encoding="utf-8").write(theirs)
        br.goto("http://127.0.0.1:%d/__interop.html" % srv.port)
        br.wait("document.readyState==='complete'", 30)
        time.sleep(0.6)
        br.ev("""(function(){ const i=document.querySelector('input[type=password]');
          i.value='482113';
          const b=[...document.querySelectorAll('button')].find(x=>/open|unlock|decrypt/i.test(x.textContent))||document.querySelector('button');
          b.click(); })()""")
        time.sleep(2.5)
        got = br.ev("!!document.querySelector('iframe,embed,object') || document.body.textContent.indexOf('summary')>=0")
        note("LockHTML's own viewer opens our file", bool(got),
             br.ev("document.body.textContent.slice(0,80)").replace("\n", " "))
    finally:
        br.close()
        srv.stop()
        for f in (os.path.join(DOCS, "__locked.html"), os.path.join(DOCS, "__interop.html")):
            try:
                os.remove(f)
            except OSError:
                pass

    print("\n%d/%d checks passed" % (sum(1 for r in results if r[1]), len(results)))
    return 0 if all(r[1] for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
