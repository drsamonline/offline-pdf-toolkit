#!/usr/bin/env python3
"""Build the landing page from its one source.

`pipeline/landing.html` is the readable source. This emits the two copies the
repository actually serves:

    index.html         the repository root (app at app.html)
    docs/index.html    the Pages source   (app at play/)

The only difference between them is the app link, which is rewritten here — so
the page can never drift between the two deployments. It also stamps the build
in the footer, because "am I looking at the new one?" should be answerable from
the page itself.

    python3 pipeline/build_landing.py
"""
import datetime
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
SRC = os.path.join(HERE, "landing.html")


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
    try:
        return open(os.path.join(REPO, "VERSION"), encoding="utf-8").read().strip()
    except OSError:
        return "0.0.0"


def stamp():
    v = version()
    day = datetime.date.today().isoformat()
    sha = ""
    try:
        sha = subprocess.run(["git", "-C", REPO, "rev-parse", "--short", "HEAD"],
                             capture_output=True, text=True, timeout=10).stdout.strip()
    except Exception:
        pass
    parts = ["v" + v, "built " + day]
    if sha:
        parts.append(sha)
    return " · ".join(parts)


def build(quiet=False):
    src = open(SRC, encoding="utf-8").read()
    land = src.replace("__BUILD__", stamp())

    style = re.search(r"<style>(.*?)</style>", land, re.S)
    script = re.search(r"<script>\n\(function\(\)\{(.*?)</script>", land, re.S)
    if style:
        land = land.replace(style.group(1), minify_css(style.group(1)), 1)
    if script:
        land = land.replace("(function(){" + script.group(1),
                            "(function(){" + minify_js(script.group(1)), 1)
    land = minify_html(land)

    root_page = land
    docs_page = land.replace('href="app.html"', 'href="play/"').replace(
        'src="app.html"', 'src="play/"')

    open(os.path.join(REPO, "index.html"), "w", encoding="utf-8").write(root_page)
    open(os.path.join(REPO, "docs", "index.html"), "w", encoding="utf-8").write(docs_page)
    if not quiet:
        print("landing source : %d bytes" % len(src))
        print("landing built  : %d bytes" % len(land))
        print("stamp          : %s" % stamp())
        print("written        : index.html, docs/index.html")
    return len(src), len(land)


if __name__ == "__main__":
    build()
    sys.exit(0)
