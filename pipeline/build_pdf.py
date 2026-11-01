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


def minify_js(js):
    js = re.sub(r"/\*.*?\*/", "", js, flags=re.S)
    js = re.sub(r"(?m)^\s*//.*$", "", js)
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


def main():
    verify_vendor()
    tpl = open(TPL, encoding="utf-8").read()
    for ph in LIBS:
        if ph not in tpl:
            sys.exit("placeholder %s missing from template" % ph)

    for ph, f in (("<!--APPEXTRAS_UI-->", "app_extras_ui.html"), ("/*__APPEXTRAS__*/", "app_extras.js")):
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

    for ph, path in LIBS.items():
        code = open(path, encoding="utf-8").read()
        if "</script" in code:
            sys.exit("%s contains </script — needs escaping" % path)
        html = html.replace(ph, code, 1)

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
