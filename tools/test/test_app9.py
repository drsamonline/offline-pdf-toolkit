#!/usr/bin/env python3
"""1.11 checks: open a password-protected PDF, and redact by pattern."""
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
        br.ev("""window.__files=[]; window.download=function(b,n){
          const u8=b instanceof Uint8Array?b:new Uint8Array(b); let s='';
          for(let i=0;i<u8.length;i++) s+=String.fromCharCode(u8[i]);
          window.__files.push({name:n||'o.pdf', b64:btoa(s), size:u8.length});};""")

        # ---------- a password-protected PDF ----------
        made = br.ev("""(async()=>{
          await ensurePdfLib();
          const d=await PDFDocument.create();
          const p=d.addPage([595,842]);
          const f=await d.embedFont(StandardFonts.Helvetica);
          p.drawText('Protected discharge summary',{x:50,y:760,size:16,font:f});
          p.drawText('Asha Rao, Aadhaar 1234 5678 9012, phone 9876543210, asha@example.org',{x:50,y:730,size:10,font:f});
          await d.encrypt({userPassword:'openme',ownerPassword:'own',permissions:{printing:'highResolution',copying:true}});
          const bytes=await d.save();
          window.__locked=btoa(String.fromCharCode(...new Uint8Array(bytes)));
          return bytes.length;
        })()""")
        note("a protected PDF is built", made > 500, "%d bytes" % made)

        # no password given -> nothing loads, and the app does not crash
        br.ev("window.prompt=function(){ return null; };")
        br.ev("""(async()=>{
          const raw=Uint8Array.from(atob(window.__locked), c=>c.charCodeAt(0));
          await addFiles([new File([raw],'locked.pdf',{type:'application/pdf'})]);
        })()""")
        time.sleep(1.2)
        note("refusing the password loads nothing", br.ev("pages.length") == 0, "%d pages" % br.ev("pages.length"))

        # with the password -> it opens
        br.ev("window.prompt=function(){ return 'openme'; };")
        br.ev("""(async()=>{
          const raw=Uint8Array.from(atob(window.__locked), c=>c.charCodeAt(0));
          await addFiles([new File([raw],'locked.pdf',{type:'application/pdf'})]);
        })()""")
        br.wait("document.querySelectorAll('#grid .pg').length>=1", 40, "protected page")
        note("the right password opens it", br.ev("pages.length") == 1, "%d pages" % br.ev("pages.length"))
        note("the password is kept for the writer", br.ev("!!(docs[0] && docs[0].password)"))

        # and it can be re-saved through pdf-lib (the writer needs the password too)
        br.ev("window.__files=[]")
        br.ev("(async()=>{ await save(); })()")
        br.wait("window.__files.length>0", 60, "saved protected file")
        f = json.loads(br.ev("JSON.stringify(window.__files)"))[0]
        open(os.path.join(OUT, "from-protected.pdf"), "wb").write(base64.b64decode(f["b64"]))
        note("a protected file can be edited and saved", f["size"] > 500, "%d bytes" % f["size"])

        # ---------- redaction by pattern ----------
        br.ev("""(async()=>{ const b=await (await fetch('../assets/sample-uncompressed.pdf')).arrayBuffer();
          await addFiles([new File([b],'plain.pdf',{type:'application/pdf'})]); })()""")
        br.wait("document.querySelectorAll('#grid .pg').length>=3", 40, "plain pages")

        # a page carrying the shapes, built with pdf-lib
        br.ev("""(async()=>{
          await ensurePdfLib();
          const d=await PDFDocument.create();
          const p=d.addPage([595,842]);
          const f=await d.embedFont(StandardFonts.Helvetica);
          p.drawText('Patient Asha Rao',{x:50,y:760,size:12,font:f});
          p.drawText('Aadhaar 1234 5678 9012',{x:50,y:735,size:12,font:f});
          p.drawText('Mobile 9876543210',{x:50,y:710,size:12,font:f});
          p.drawText('Email asha.rao@example.org',{x:50,y:685,size:12,font:f});
          p.drawText('PAN ABCDE1234F',{x:50,y:660,size:12,font:f});
          const bytes=await d.save();
          await addFiles([new File([bytes],'identifiers.pdf',{type:'application/pdf'})]);
        })()""")
        br.wait("document.querySelectorAll('#grid .pg').length>=4", 40, "identifier page")

        br.ev("""selectAll(false); pages.forEach((p,i)=>{ p.sel = (i === pages.length-1); }); render();""")
        br.ev("""$('#s-redact').open=true; $('#rdt').value='Asha'; $('#rdaadhaar').checked=true;
                $('#rdphone').checked=true; $('#rdemail').checked=true; $('#rdpan').checked=true;
                $('#rdraster').checked=true;""")
        br.ev("window.__files=[]")
        br.ev("(async()=>{ await save(); })()")
        br.wait("window.__files.length>0", 120, "redacted file")
        f = json.loads(br.ev("JSON.stringify(window.__files)"))[0]
        open(os.path.join(OUT, "redacted.pdf"), "wb").write(base64.b64decode(f["b64"]))
        note("pattern redaction saves", f["size"] > 500, "%d bytes" % f["size"])
    finally:
        br.close(); srv.stop()
    print("\n%d/%d checks passed" % (sum(1 for r in results if r[1]), len(results)))
    return 0 if all(r[1] for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
