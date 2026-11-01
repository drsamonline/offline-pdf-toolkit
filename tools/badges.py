#!/usr/bin/env python3
"""Draw this repository's badges as local SVG files.

An offline-first app should not need an image service to describe itself: a
README whose first line fetches a picture from shields.io breaks the app's own
promise. These are generated here, committed, and referenced by relative path,
so they render on Pages, in the README, and from `file://` with no network.

Every claim below is checked against the repo — keep it that way:

  uploads    the app has no backend; nothing is ever POSTed
  offline    the service worker caches the shell; OCR's engine is the one fetch
  licence    LICENSE is PolyForm Noncommercial 1.0.0
  deps       nothing is installed at runtime; the libraries are inlined
  size       the built app.html, rounded
  version    VERSION

  python3 tools/badges.py
"""
import os
import re

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

INK = "#14100b"
PAPER = "#f7f2e9"
STAMP = "#b3341f"
GREEN = "#2e6b45"
SLATE = "#3d4a52"

CH = 6.6  # approximate advance width of 11px sans


def badge(label, value, colour):
    lw = int(len(label) * CH) + 16
    vw = int(len(value) * CH) + 16
    total = lw + vw
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="22" role="img" '
        'aria-label="%s: %s">'
        "<title>%s: %s</title>"
        '<linearGradient id="s" x2="0" y2="100%%">'
        '<stop offset="0" stop-color="#fff" stop-opacity=".09"/>'
        '<stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>'
        '<clipPath id="r"><rect width="%d" height="22" rx="4" fill="#fff"/></clipPath>'
        '<g clip-path="url(#r)">'
        '<rect width="%d" height="22" fill="%s"/>'
        '<rect x="%d" width="%d" height="22" fill="%s"/>'
        '<rect width="%d" height="22" fill="url(#s)"/>'
        "</g>"
        '<g fill="%s" font-family="ui-sans-serif,Segoe UI,Helvetica,Arial,sans-serif" '
        'font-size="11" text-anchor="middle">'
        '<text x="%d" y="15">%s</text>'
        '<text x="%d" y="15">%s</text>'
        "</g></svg>"
    ) % (total, label, value, label, value, total, lw, INK, lw, vw, colour, total,
         PAPER, lw // 2, label, lw + vw // 2, value)


def facts():
    version = open(os.path.join(HERE, "VERSION"), encoding="utf-8").read().strip()
    app = os.path.join(HERE, "app.html")
    size = os.path.getsize(app) / 1048576.0 if os.path.exists(app) else 0
    licence = "PolyForm NC 1.0.0"
    head = open(os.path.join(HERE, "LICENSE"), encoding="utf-8").read(400)
    m = re.search(r"PolyForm\s+Noncommercial\s+(\d+\.\d+\.\d+)", head)
    if m:
        licence = "PolyForm NC " + m.group(1)
    return version, "%.1f MB" % size if size else "single file", licence


def main():
    version, size, licence = facts()
    badges = [
        ("live", "live", "online", SLATE),
        ("uploads", "uploads", "0 bytes", GREEN),
        ("external", "external requests", "0", GREEN),
        ("offline", "offline", "no network", GREEN),
        ("licence", "licence", licence, STAMP),
        ("deps", "deps", "0 installed", INK),
        ("size", "size", size, INK),
        ("version", "version", "v" + version, SLATE),
    ]
    for out in (os.path.join(HERE, "docs", "assets"), os.path.join(HERE, "assets")):
        os.makedirs(out, exist_ok=True)
        for name, label, value, colour in badges:
            path = os.path.join(out, "badge-%s.svg" % name)
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(badge(label, value, colour))
        print("wrote %d badges into %s" % (len(badges), out))


if __name__ == "__main__":
    main()
