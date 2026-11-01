#!/usr/bin/env python3
"""Take the screenshots this repo ships, with headless Chromium.

Chromium's own `--screenshot` combined with `--virtual-time-budget` freezes worker
timers, which hangs pdf.js — so the app renders as an empty grid. This drives the
browser over the DevTools protocol instead: real timers, and an explicit wait for
the condition we actually care about ("five thumbnails have drawn").

It serves the site over a real HTTP origin first, so the service worker and the
same-origin iframe behave as they do on Pages.

    pip install websocket-client           # a dev tool only; the app has no deps
    python3 tools/shot.py landing          # docs/assets/landing-{desktop,mobile}.png
    python3 tools/shot.py app              # docs/assets/app-{desktop,mobile}.png
    python3 tools/shot.py all

The sample PDFs the app loads are committed; regenerate them with
`python3 tools/make_samples.py`.
"""
import base64, functools, http.server, json, os, shutil, subprocess, sys, tempfile, threading, time

try:
    import websocket
except ImportError:
    sys.exit("needs websocket-client:  pip install websocket-client")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = shutil.which("chromium") or shutil.which("google-chrome") or shutil.which("chromium-browser")

# what the app screenshot does before the shutter: load the two sample files,
# select every page and open the watermark panel, so the shot shows work in progress
APP_JS = """
(async function(){
  function ready(fn){ document.readyState==='complete' ? setTimeout(fn,500) : addEventListener('load',()=>setTimeout(fn,500)); }
  ready(async function(){
    const names=[['../assets/sample-discharge-summary.pdf','Sample discharge summary.pdf'],
                 ['../assets/sample-lab-report.pdf','Sample lab report.pdf']];
    const files=[];
    for(const [u,n] of names){ const r=await fetch(u); files.push(new File([await r.arrayBuffer()],n,{type:'application/pdf'})); }
    await addFiles(files);
    const wm=document.querySelector('#s-wm');
    if(wm && matchMedia('(min-width:900px)').matches){ wm.open=true; document.querySelector('#wmt').value='CONFIDENTIAL'; document.querySelector('#selall').click(); }
  });
})();
"""


class Server:
    def __init__(self):
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=ROOT)

        class Q(http.server.ThreadingHTTPServer):
            daemon_threads = True

            def log_message(self, *a):
                pass

        self.httpd = Q(("127.0.0.1", 0), handler)
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()
        self.port = self.httpd.server_address[1]

    def stop(self):
        self.httpd.shutdown()


class Browser:
    def __init__(self, w, h):
        self.profile = tempfile.mkdtemp(prefix="shot-")
        self.proc = subprocess.Popen(
            [CHROME, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
             "--disable-dev-shm-usage", "--remote-debugging-port=0", "--remote-allow-origins=*",
             "--user-data-dir=" + self.profile, "about:blank"],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        port_file = os.path.join(self.profile, "DevToolsActivePort")
        for _ in range(300):
            if os.path.exists(port_file) and open(port_file).read().strip():
                break
            time.sleep(0.05)
        port = int(open(port_file).read().split("\n")[0])
        import urllib.request
        target = None
        for _ in range(300):
            try:
                tabs = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % port))
                target = [t for t in tabs if t["type"] == "page"]
                if target:
                    break
            except Exception:
                pass
            time.sleep(0.05)
        self.ws = websocket.create_connection(target[0]["webSocketDebuggerUrl"], timeout=120)
        self.id = 0
        self.send("Page.enable")
        self.send("Runtime.enable")
        self.send("Emulation.setDeviceMetricsOverride", width=w, height=h,
                  deviceScaleFactor=1, mobile=w < 600)

    def send(self, method, **params):
        self.id += 1
        self.ws.send(json.dumps({"id": self.id, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.id:
                if "error" in msg:
                    raise RuntimeError("%s -> %s" % (method, msg["error"]))
                return msg.get("result", {})

    def ev(self, js):
        r = self.send("Runtime.evaluate", expression=js, awaitPromise=True, returnByValue=True)
        if r.get("exceptionDetails"):
            raise RuntimeError(json.dumps(r["exceptionDetails"])[:400])
        return r["result"].get("value")

    def wait(self, expr, timeout=60):
        end = time.time() + timeout
        while time.time() < end:
            try:
                if self.ev(expr):
                    return True
            except Exception:
                pass
            time.sleep(0.15)
        return False

    def shot(self, path, full=False):
        p = {"format": "png"}
        if full:
            p["captureBeyondViewport"] = True
        open(path, "wb").write(base64.b64decode(self.send("Page.captureScreenshot", **p)["data"]))

    def close(self):
        try:
            self.send("Browser.close")
        except Exception:
            pass
        self.proc.terminate()
        try:
            self.proc.wait(timeout=10)
        except Exception:
            self.proc.kill()
        shutil.rmtree(self.profile, ignore_errors=True)


def capture(url, out, w, h, inject=None, wait=None, full=False):
    br = Browser(w, h)
    try:
        br.send("Page.navigate", url=url)
        br.wait("document.readyState==='complete'", 45)
        if inject:
            # run it in the page once it is up: the app's own functions exist by then
            br.ev(inject)
        if wait and not br.wait(wait, 60):
            print("  ! condition not reached, shooting anyway:", wait)
        time.sleep(1.2)
        br.shot(out, full)
        print("wrote", out, os.path.getsize(out), "bytes")
    finally:
        br.close()


def main():
    what = sys.argv[1] if len(sys.argv) > 1 else "all"
    srv = Server()
    base = "http://127.0.0.1:%d/" % srv.port
    assets = os.path.join(ROOT, "docs", "assets")
    try:
        if what in ("landing", "all"):
            capture(base + "docs/index.html", os.path.join(assets, "landing-desktop.png"), 1280, 900, full=True)
            capture(base + "docs/index.html", os.path.join(assets, "landing-mobile.png"), 430, 900, full=True)
        if what in ("app", "all"):
            capture(base + "docs/play/index.html", os.path.join(assets, "app-desktop.png"), 1280, 1000,
                    inject=APP_JS, wait="document.querySelectorAll('#grid .thumb img').length>=5")
            capture(base + "docs/play/index.html", os.path.join(assets, "app-mobile.png"), 430, 860,
                    inject=APP_JS, wait="document.querySelectorAll('#grid .thumb img').length>=5")
    finally:
        srv.stop()


if __name__ == "__main__":
    main()
