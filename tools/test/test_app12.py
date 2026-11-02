#!/usr/bin/env python3
"""1.15 checks: the launcher — the catalogue, the sheet, the cold-start path,
and the session list. Driven in a real browser like every other suite."""
import base64
import json
import os
import sys
import tempfile

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
        # watch the blob and stop the anchor, so the app's own download() runs
        # (stubbing download() itself would remove the funnel under test)
        br.ev("""window.__files=[]; window.__objs=[];
          const _cou=URL.createObjectURL.bind(URL);
          URL.createObjectURL=function(b){ try{ window.__objs.push(b); }catch(e){} return _cou(b); };
          const _click=HTMLAnchorElement.prototype.click;
          HTMLAnchorElement.prototype.click=function(){ if(this.download) return; return _click.apply(this,arguments); };""")

        # ---- the launcher is the empty state ----
        note("the empty state is the launcher", br.ev("!!document.querySelector('#empty.launcher .hero')"))
        note("four core tools are offered", br.ev("document.querySelectorAll('#home-grid .tcard').length") == 4,
             br.ev("[...document.querySelectorAll('#home-grid .tcard')].map(c=>c.dataset.tool).join(',')"))
        note("each card carries its category",
             br.ev("document.querySelectorAll('#home-grid .cat-edit,#home-grid .cat-optimize,"
                   "#home-grid .cat-secure,#home-grid .cat-convert').length") == 4)
        note("the idle page bar is out of the way", br.ev("document.querySelector('#pbar').classList.contains('idle')"))

        # ---- one catalogue: the sidebar's own summaries are the names ----
        note("the catalogue covers every panel",
             br.ev("TOOLS.filter(t=>t.panel).length") >= 20, "%d panels" % br.ev("TOOLS.filter(t=>t.panel).length"))
        note("names come from the panels, not a second list",
             br.ev("TOOL_BY_ID.text.name") == br.ev("$('#s-text').querySelector('summary').firstChild.textContent.trim()"),
             br.ev("TOOL_BY_ID.text.name"))
        note("every panel in the catalogue has a category dot",
             br.ev("document.querySelectorAll('.sec[data-cat]').length") >= 18,
             "%d sections" % br.ev("document.querySelectorAll('.sec[data-cat]').length"))
        note("a known panel is tinted by its family",
             br.ev("$('#s-redact').dataset.cat") == "secure", br.ev("$('#s-redact').dataset.cat"))

        # ---- the all-tools sheet ----
        br.ev("$('#all-tools').click()")
        note("the sheet opens", br.ev("$('#bd').classList.contains('open')"))
        cards = br.ev("document.querySelectorAll('#catout .tcard').length")
        note("it lists every tool", cards == br.ev("TOOLS.length"), "%d cards" % cards)
        note("it is grouped by category", br.ev("document.querySelectorAll('#catout .cat-head').length") >= 5)
        br.ev("$('#catq').value='ocr'; $('#catq').dispatchEvent(new Event('input'))")
        note("search narrows it", br.ev("document.querySelectorAll('#catout .tcard').length") == 1,
             "%d after 'ocr'" % br.ev("document.querySelectorAll('#catout .tcard').length"))
        br.ev("$('#catq').value='zzz'; $('#catq').dispatchEvent(new Event('input'))")
        note("an empty search says so", br.ev("document.querySelectorAll('#catout .tcard').length") == 0)

        # ---- cold start: a tool card asks for a file, then opens itself ----
        br.ev("closeModal()")
        br.ev("launchTool('cmp')")
        note("a tool with no document asks for one first",
             br.ev("pendingTool") == "cmp" and br.ev("$('#s-cmp').open") == False, br.ev("pendingTool"))
        br.ev("""(async()=>{ const b=await (await fetch('../assets/sample-outline.pdf')).arrayBuffer();
          await addFiles([new File([b],'report.pdf',{type:'application/pdf'})]); })()""")
        br.wait("document.querySelectorAll('#grid .pg').length>=4", 40, "pages")
        note("the file lands and the waiting tool opens", br.ev("$('#s-cmp').open") == True)
        note("the launcher steps aside once a document is open",
             br.ev("document.querySelector('#empty').style.display") == "none")
        note("the page bar comes back", not br.ev("document.querySelector('#pbar').classList.contains('idle')"))

        # ---- the session list ----
        br.ev("window.__objs=[]")
        br.ev("(async()=>{ await save(); })()")
        br.wait("window.__objs.length>0", 60, "a saved file")
        note("a saved file is written", br.ev("window.__objs.length") == 1)
        rec = json.loads(br.ev("JSON.stringify(recentsList())"))
        note("the session list remembers it", len(rec) == 1 and rec[0]["size"] > 500,
             "%s · %s · %s" % (rec[0]["tool"], rec[0]["name"], rec[0]["size"]) if rec else "empty")
        note("it names the tool that made it", rec and rec[0]["tool"] == "Compress", rec[0]["tool"] if rec else "")
        note("it is session storage, not localStorage",
             br.ev("localStorage.getItem('pdftk_session_output')") is None)
        note("no bytes are kept", rec and "b64" not in rec[0] and "bytes" not in rec[0])

        # a text/OCR/locked output is a Blob, not an array: its size must still land
        br.ev("download(new Blob(['hello there'],{type:'text/plain'}),'notes.txt')")
        rec2 = json.loads(br.ev("JSON.stringify(recentsList())"))
        note("a Blob output keeps its size", rec2 and rec2[0]["size"] == 11,
             rec2[0]["size"] if rec2 else "empty")

        # a tool that is waiting for a file must stop waiting if none arrives
        br.ev("pages.length=0; docs.length=0; render()")
        br.ev("launchTool('cmp')")
        waiting = br.ev("pendingTool")
        br.ev("(async()=>{ await addFiles([]); })()")
        note("a cancelled picker drops the wait",
             waiting == "cmp" and br.ev("pendingTool") is None,
             "was %s, now %s" % (waiting, br.ev("pendingTool")))

        br.ev("render()")  # back to the launcher, since the grid still holds pages
        br.ev("pages.length=0; docs.length=0; render()")
        br.wait("document.querySelector('#empty').style.display!=='none'", 20, "launcher")
        note("the list shows on the launcher", br.ev("!document.querySelector('#rec').hidden"))
        br.ev("$('#rec-clear').click()")
        note("clear empties it", br.ev("recentsList().length") == 0 and br.ev("document.querySelector('#rec').hidden"))
    finally:
        br.close()
        srv.stop()
    print("\n%d/%d checks passed" % (sum(1 for r in results if r[1]), len(results)))
    return 0 if all(r[1] for r in results) else 1


if __name__ == "__main__":
    sys.exit(main())
