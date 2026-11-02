#!/usr/bin/env python3
"""A tiny Chrome DevTools Protocol driver — enough to load a page, wait for a
condition, run JS in it and capture a screenshot, with real timers.

Chromium's --screenshot + --virtual-time-budget freezes worker timers, which
hangs pdf.js; driving the browser over CDP gives real time and lets us wait for
an explicit condition instead of guessing.

  python3 cdp.py <root> <path> <out.png> <width> <height> [wait.js] [inject.js] [full]
"""
import base64, functools, http.server, json, os, shutil, socket, subprocess, sys, tempfile, threading, time

import websocket

CHROME = shutil.which("chromium") or shutil.which("google-chrome")


class Server:
    def __init__(self, root):
        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=root)

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
    def __init__(self, width, height):
        self.profile = tempfile.mkdtemp(prefix="cdp-")
        self.args = [CHROME, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
                     "--disable-dev-shm-usage", "--remote-debugging-port=0", "--remote-allow-origins=*",
                     "--user-data-dir=" + self.profile, "about:blank"]
        self.proc = subprocess.Popen(self.args,
                                     stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        # A cold CI runner can take several seconds to start Chrome, and the first
        # version gave up after 10 — which is how the browser-tests job failed the
        # first time it ran anywhere but this machine. Wait properly, and say what
        # happened if the process dies instead of dying on a bare FileNotFoundError.
        portfile = os.path.join(self.profile, "DevToolsActivePort")
        deadline = time.time() + 45
        while time.time() < deadline:
            if os.path.exists(portfile) and os.path.getsize(portfile) > 4:
                break
            if self.proc.poll() is not None:
                raise RuntimeError("Chrome exited before it opened a debugging port (code %s). "
                                   "Command: %s" % (self.proc.returncode, " ".join(self.args[:3])))
            time.sleep(0.1)
        if not os.path.exists(portfile):
            raise RuntimeError("Chrome did not open a debugging port within 45 s")
        port = int(open(portfile).read().split("\n")[0])
        for _ in range(200):
            try:
                import urllib.request
                tabs = json.load(urllib.request.urlopen("http://127.0.0.1:%d/json" % port))
                page = [t for t in tabs if t["type"] == "page"]
                if page:
                    break
            except Exception:
                pass
            time.sleep(0.05)
        self.ws = websocket.create_connection(page[0]["webSocketDebuggerUrl"], timeout=120)
        self.id = 0
        self.send("Page.enable")
        self.send("Runtime.enable")
        self.resize(width, height)

    def send(self, method, **params):
        self.id += 1
        self.ws.send(json.dumps({"id": self.id, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.id:
                if "error" in msg:
                    raise RuntimeError("%s -> %s" % (method, msg["error"]))
                return msg.get("result", {})

    def resize(self, w, h):
        self.send("Emulation.setDeviceMetricsOverride", width=w, height=h,
                  deviceScaleFactor=1, mobile=w < 600)

    def goto(self, url):
        self.send("Page.navigate", url=url)

    def ev(self, js, await_promise=True):
        r = self.send("Runtime.evaluate", expression=js, awaitPromise=await_promise,
                      returnByValue=True, userGesture=True)
        if r.get("exceptionDetails"):
            raise RuntimeError(json.dumps(r["exceptionDetails"])[:600])
        return r["result"].get("value")

    def wait(self, expr, timeout=45, label=""):
        end = time.time() + timeout
        last = None
        while time.time() < end:
            try:
                v = self.ev(expr)
                if v:
                    return v
            except Exception as e:
                last = e
            time.sleep(0.15)
        raise RuntimeError("timeout waiting for %s %s" % (label or expr, last or ""))

    def shot(self, path, full=False):
        p = {"format": "png"}
        if full:
            p["captureBeyondViewport"] = True
        r = self.send("Page.captureScreenshot", **p)
        open(path, "wb").write(base64.b64decode(r["data"]))

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


def main():
    a = sys.argv[1:]
    root, path, out, w, h = a[0], a[1], a[2], int(a[3]), int(a[4])
    wait_js = a[5] if len(a) > 5 and a[5] != "-" else None
    inject = a[6] if len(a) > 6 and a[6] != "-" else None
    full = len(a) > 7 and a[7] == "full"

    srv = Server(root)
    br = Browser(w, h)
    tmp = None
    try:
        url = "http://127.0.0.1:%d/%s" % (srv.port, path.lstrip("/"))
        if inject:
            src = os.path.join(root, path.lstrip("/"))
            tmp = src.replace(".html", "__shot.html")
            html = open(src, encoding="utf-8", errors="surrogateescape").read()
            html = html.replace("</body>", "<script>%s</script></body>"
                                % open(inject, encoding="utf-8").read())
            open(tmp, "w", encoding="utf-8", errors="surrogateescape").write(html)
            url = url.replace(".html", "__shot.html")
        br.goto(url)
        br.wait("document.readyState==='complete'", 45, "load")
        if wait_js:
            br.wait(wait_js, 60, "condition")
        time.sleep(0.8)
        br.shot(out, full)
        print("wrote %s (%d bytes)" % (out, os.path.getsize(out)))
    finally:
        br.close()
        srv.stop()
        if tmp and os.path.exists(tmp):
            os.remove(tmp)


if __name__ == "__main__":
    main()
