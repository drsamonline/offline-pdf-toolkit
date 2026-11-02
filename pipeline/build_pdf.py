#!/usr/bin/env python3
"""Build the single-file Offline PDF Toolkit.

Inlines pdf-lib (Cantoo fork), pdf.js and the pdf.js worker into one HTML file so
the whole tool works from a USB stick with no network.

The libraries live in `vendor/` and are verified against `vendor/SHA256SUMS`
before they are inlined, so a build either uses the exact bytes that were
audited or refuses to run. They were extracted from a released app.html (they
are the same bytes, in the same order, that this script would have inlined).

    python3 pipeline/build_pdf.py

Outputs: app.html (site root) and docs/play/index.html (Pages), both identical.
"""
import hashlib
import os
import re
import sys

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TPL = os.path.join(HERE, "pipeline", "app_template.html")
VENDOR = os.path.join(HERE, "vendor")
SUMS = os.path.join(VENDOR, "SHA256SUMS")
OUT = os.path.join(HERE, "app.html")
OUT_DOCS = os.path.join(HERE, "docs", "play", "index.html")

LIBS = {
    "__PDFLIB__": os.path.join(VENDOR, "cantoo-pdf-lib.min.js"),
    "__PDFJS__": os.path.join(VENDOR, "pdf.min.js"),
    "__PDFWORKER__": os.path.join(VENDOR, "pdf.worker.min.js"),
}


def minify_css(css):
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
    css = re.sub(r"\s+", " ", css)
    css = re.sub(r"\s*([{};:,])\s*", r"\1", css)
    return css.replace(";}", "}").strip()


def strip_js_comments(js):
    """Remove comments without touching strings OR regular expressions.

    The previous version was three regexes, and `'image/*'` — an ordinary string —
    opened a block comment that swallowed the next few hundred lines of the app.
    The version after that knew about quotes and was fooled by the `"` inside the
    character class of `/[&<>"]/g`. This one knows about both: a `/` after an
    operator position starts a regex literal, and everything inside it is copied
    verbatim.
    """
    out = []
    i, n, quote, prev = 0, len(js), None, ""
    while i < n:
        c = js[i]
        if quote:
            out.append(c)
            if c == "\\" and i + 1 < n:
                out.append(js[i + 1]); i += 2; continue
            if c == quote:
                quote = None
            i += 1; continue
        if c in "\"'`":
            quote = c; out.append(c); prev = c; i += 1; continue
        if c == "/" and i + 1 < n and js[i + 1] == "*":
            j = js.find("*/", i + 2)
            i = n if j < 0 else j + 2
            continue
        if c == "/" and i + 1 < n and js[i + 1] == "/":
            j = js.find("\n", i)
            i = n if j < 0 else j
            continue
        if c == "/" and (prev == "" or prev in "(,=:[!&|?{};+-*%<>~^"):
            out.append(c); i += 1
            in_class = False
            while i < n:
                d = js[i]
                if d == "\\" and i + 1 < n:
                    out.append(d); out.append(js[i + 1]); i += 2; continue
                if d == "[":
                    in_class = True
                elif d == "]":
                    in_class = False
                elif d == "/" and not in_class:
                    out.append(d); i += 1; break
                out.append(d); i += 1
            while i < n and js[i].isalpha():
                out.append(js[i]); i += 1
            prev = "x"
            continue
        out.append(c)
        if not c.isspace():
            prev = c
        i += 1
    return "".join(out)


def minify_js(js):
    js = strip_js_comments(js)
    js = re.sub(r"(?m)^[ \t]+", "", js)
    return re.sub(r"\n{2,}", "\n", js).strip()


def minify_html(h):
    h = re.sub(r"(?m)^[ \t]+", "", h)
    return re.sub(r"\n{2,}", "\n", h)


def version():
    return open(os.path.join(HERE, "VERSION"), encoding="utf-8").read().strip()


def verify_vendor():
    """Refuse to build from libraries that are not the ones on record."""
    if not os.path.exists(SUMS):
        sys.exit("missing %s — run: python3 pipeline/vendor_libs.py --sums" % SUMS)
    want = {}
    for line in open(SUMS, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#"):
            digest, name = line.split(None, 1)
            want[name.strip()] = digest
    for name, path in [(os.path.basename(p), p) for p in LIBS.values()]:
        if not os.path.exists(path):
            sys.exit("missing library: %s" % path)
        got = hashlib.sha256(open(path, "rb").read()).hexdigest()
        if want.get(name) != got:
            sys.exit("checksum mismatch for %s\n  expected %s\n  got      %s"
                     % (name, want.get(name), got))


def changelog_json(limit=4):
    """The newest changelog points, as a JSON array for the app's About panel."""
    import json as _json
    path = os.path.join(HERE, "CHANGELOG.md")
    try:
        text = open(path, encoding="utf-8").read()
    except OSError:
        return "[]"
    m = re.search(r"^## \[([^\]]+)\][^\n]*$", text, re.M)
    if not m:
        return "[]"
    body = text[m.end():]
    nxt = re.search(r"^## \[", body, re.M)
    if nxt:
        body = body[:nxt.start()]
    items, buf = [], None
    for line in body.splitlines():
        if line.startswith("- "):
            if buf:
                items.append(buf)
            buf = line[2:].strip()
        elif buf and line.startswith("  ") and line.strip():
            buf += " " + line.strip()
        elif not line.strip() and buf:
            items.append(buf)
            buf = None
    if buf:
        items.append(buf)

    def fmt(t):
        t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
        t = re.sub(r"`(.+?)`", r"<code>\1</code>", t)
        t = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"<a href=\"\2\">\1</a>", t)
        return t
    return _json.dumps([fmt(i) for i in items[:limit]], ensure_ascii=False)


def main():
    verify_vendor()
    tpl = open(TPL, encoding="utf-8").read()

    for ph, f in (("<!--APPEXTRAS_UI-->", "app_extras_ui.html"), ("/*__APPEXTRAS__*/", "app_extras.js"),
                                 ("/*__LAUNCHER__*/", "app_launcher.js"),
                                 ("/*__I18N__*/", "app_i18n.js")):
        fp = os.path.join(HERE, "pipeline", f)
        if not os.path.exists(fp):
            sys.exit("missing %s" % fp)
        if ph not in tpl:
            sys.exit("placeholder %s missing from template" % ph)
        tpl = tpl.replace(ph, open(fp, encoding="utf-8").read().strip(), 1)

    before = len(tpl)
    style = re.search(r"<style>(.*?)</style>", tpl, re.S)
    appjs = re.search(r'<script>\n"use strict";(.*?)</script>', tpl, re.S)
    html = tpl
    if style:
        html = html.replace(style.group(1), minify_css(style.group(1)), 1)
    if appjs:
        html = html.replace('"use strict";' + appjs.group(1),
                            '"use strict";' + minify_js(appjs.group(1)), 1)
    html = minify_html(html)
    after = len(html)

    # The engines are no longer inlined: they are written beside the app and
    # fetched on demand. That took the first load from 654 KB gzipped to about
    # 30 KB, and the 1 MB pdf.js worker is now a real file the browser caches
    # instead of a blob rebuilt from HTML text on every visit.
    # the app carries its own "what's new": the top of the changelog, inlined as a
    # JSON block so the About panel cannot drift from the release notes.
    html = html.replace("__WHATS_NEW__", changelog_json(), 1)

    libdir = os.path.join(HERE, "docs", "play", "lib")
    os.makedirs(libdir, exist_ok=True)
    for name, path in (("pdf-lib.min.js", LIBS["__PDFLIB__"]),
                       ("pdf.min.js", LIBS["__PDFJS__"]),
                       ("pdf.worker.min.js", LIBS["__PDFWORKER__"])):
        data = open(path, "rb").read()
        open(os.path.join(libdir, name), "wb").write(data)
        print("  lib %-18s %8d bytes -> docs/play/lib/%s" % (name, len(data), name))
    for ph in LIBS:
        if ph in html:
            sys.exit("placeholder %s still in the template — the engines are side files now" % ph)

    extras = os.path.join(HERE, "pipeline", "kit_extras.html")
    if os.path.exists(extras):
        html = html.replace("<!--KIT_EXTRAS-->", open(extras, encoding="utf-8").read().strip(), 1)

    html = html.replace('<title>', '<meta name="app-version" content="%s">\n<title>' % version(), 1)
    for out in (OUT, OUT_DOCS):
        os.makedirs(os.path.dirname(out), exist_ok=True)
        open(out, "w", encoding="utf-8").write(html)

    print("app code    : %d -> %d bytes (-%d)" % (before, after, before - after))
    for ph, path in LIBS.items():
        print("  inline %-14s %8d bytes  %s" % (ph, os.path.getsize(path), os.path.basename(path)))
    print("output      : %.2f MB -> app.html + docs/play/index.html" % (len(html) / 1048576))

    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import build_landing
    before_l, after_l = build_landing.build(quiet=True)
    print("landing     : %d -> %d bytes -> index.html + docs/index.html" % (before_l, after_l))


if __name__ == "__main__":
    main()


if __name__ == "__main__":
    main()
