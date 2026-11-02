#!/usr/bin/env python3
"""1.8 checks: a whole folder, through the File System Access API.

Headless Chrome cannot drive a real directory picker, so the browser API is
mocked with an in-memory directory: three PDFs in, results captured on the way
out. That tests the code path — reading entries, running the tools per file,
writing into out/ — which is the part that can be wrong.
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
results = []


def note(name, ok, extra=""):
    results.append((name, ok, extra))
    print(("  PASS  " if ok else "  FAIL  ") + name + ((" — " + str(extra)) if extra else ""))


MOCK = """
window.__written = {};
window.__picked = 0;
(function(){
  const files = window.__folderFiles || {};
  const outDir = {
    getFileHandle: async (name) => ({
      createWritable: async () => ({
        write: async (b) => { window.__written[name] = b; },
        close: async () => {}
      })
    })
  };
  window.showDirectoryPicker = async (opts) => {
    window.__picked++;
    window.__pickOpts = opts;
    return {
      kind: 'directory',
      entries: async function* () {
        for (const name of Object.keys(files)) {
          yield [name, { kind: 'file', getFile: async () =>
            new File([files[name]], name, { type: 'application/pdf' }) }];
        }
        yield ['notes.txt', { kind: 'file', getFile: async () => new File(['x'], 'notes.txt') }];
      },
      getDirectoryHandle: async (name, o) => outDir
    };
  };
})();
"""


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

        # three PDFs for the mock folder, taken from the demo assets
        br.ev("""(async()=>{
          const a=await (await fetch('../assets/sample-discharge-summary.pdf')).arrayBuffer();
          const b=await (await fetch('../assets/sample-lab-report.pdf')).arrayBuffer();
          window.__folderFiles = {
            'one.pdf': new Uint8Array(a),
            'two.pdf': new Uint8Array(b),
            'three.pdf': new Uint8Array(a)
          };
        })()""")
        br.ev(MOCK)
        note("picker is mocked", br.ev("typeof window.showDirectoryPicker") == "function")

        # a watermark, so the folder run has something to apply
        br.ev("$('#s-wm').open=true; $('#wmt').value='FOLDER-TEST'; $('#s-folder').open=true;")
        br.ev("window.__written={}; window.__picked=0;")
        br.ev("document.querySelector('#dofolder').click()")
        br.wait("Object.keys(window.__written).length>=3", 120, "folder output")

        written = json.loads(br.ev("JSON.stringify(Object.keys(window.__written))"))
        note("one output per PDF, text files skipped", sorted(written) == ["one-out.pdf", "three-out.pdf", "two-out.pdf"], written)
        note("the picker was asked for write access", br.ev("(window.__pickOpts||{}).mode") == "readwrite",
             br.ev("(window.__pickOpts||{}).mode"))

        b64 = br.ev("""(async()=>{ const b=window.__written['one-out.pdf'];
            const u8 = b instanceof Uint8Array ? b : new Uint8Array(b); let s='';
            for(let i=0;i<u8.length;i++) s+=String.fromCharCode(u8[i]); return btoa(s); })()""")
        if b64:
            open(os.path.join(OUT, "one-out.pdf"), "wb").write(base64.b64decode(b64))

        note("the workspace is left as it was", br.ev("pages.length") == 0, "%d pages" % br.ev("pages.length"))
        note("the result line reports what happened", "3 files written" in br.ev("document.querySelector('#foldermsg').textContent"),
             br.ev("document.querySelector('#foldermsg').textContent")[:80])

        # a compression-only folder run must not inflate: it works on the original bytes
        br.ev("$('#wmt').value=''; $('#s-wm').open=false; $('#s-cmp').open=true; $('#cmode').value='lossless';")
        br.ev("window.__written={};")
        br.ev("document.querySelector('#dofolder').click()")
        br.wait("Object.keys(window.__written).length>=3", 120, "folder compress")
        line = br.ev("document.querySelector('#foldermsg').textContent")
        grew = "→" in line and int(line.split("→")[1].split("KB")[0].strip() or 0) > int(line.split("→")[0].split("·")[-1].strip().split("KB")[0].strip() or 0)
        note("compression-only folder run does not inflate", not grew, line[:80])

        # and it says so plainly when the browser has no such API
        br.ev("delete window.showDirectoryPicker")
        br.ev("document.querySelector('#dofolder').click()")
        time.sleep(0.4)
        msg = br.ev("document.querySelector('#toast').textContent")
        note("no picker: it says why instead of failing", "cannot open a folder" in msg, msg[:70])
    finally:
        br.close()
        srv.stop()

    print("\n%d/%d checks passed" % (sum(1 for r in results if r[1]), len(results)))
    return 0 if all(r[1] for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
