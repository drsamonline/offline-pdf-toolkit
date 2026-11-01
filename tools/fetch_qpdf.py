#!/usr/bin/env python3
"""Fetch the qpdf WASM runtime into docs/play/qpdf/ and verify it against SHA256SUMS.

Why this and not Ghostscript: qpdf is Apache-2.0 and the `qpdf-run` wrapper that
packages it for the browser is MIT. Neither is copyleft, so bundling them does not
change this app's licence — which is the reason the README has always refused
Ghostscript, PyMuPDF and CoherentPDF.

What it buys: a compression pass that is lossless. It re-writes object streams and
re-flates the ones that are not already compressed, so the text stays text and
nothing is rasterised. On a file that was written uncompressed it is dramatic; on
one that is already compressed it is modest, and the app says which it got.

    python3 tools/fetch_qpdf.py            # download anything missing
    python3 tools/fetch_qpdf.py --sums     # rewrite SHA256SUMS
    python3 tools/fetch_qpdf.py --verify   # check what is on disk
"""
import argparse
import hashlib
import io
import os
import sys
import tarfile
import urllib.request

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(HERE, "docs", "play", "qpdf")
SUMS = os.path.join(DEST, "SHA256SUMS")

PACKAGE = "qpdf-run"
VERSION = "0.2.1"
TARBALL = "https://registry.npmjs.org/%s/-/%s-%s.tgz" % (PACKAGE, PACKAGE, VERSION)

# where each file lives inside the tarball, and where it goes here
FILES = {
    "package/vendor/qpdf/qpdf.js": "qpdf.js",
    "package/vendor/qpdf/qpdf-worker.js": "qpdf-worker.js",
    "package/vendor/qpdf/lib/qpdf.js": "lib/qpdf.js",
    "package/vendor/qpdf/lib/qpdf.wasm": "lib/qpdf.wasm",
    "package/LICENSE": "LICENSE-qpdf-run.txt",
}


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def read_sums():
    want = {}
    if os.path.exists(SUMS):
        for line in open(SUMS, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#"):
                digest, name = line.split(None, 1)
                want[name.strip()] = digest
    return want


def write_sums():
    lines = ["# sha256 of the vendored qpdf runtime, checked by tools/fetch_qpdf.py",
             "# qpdf itself is Apache-2.0; the qpdf-run wrapper is MIT",
             "# regenerate with: python3 tools/fetch_qpdf.py --sums"]
    for root, _, files in os.walk(DEST):
        for n in sorted(files):
            if n == "SHA256SUMS":
                continue
            p = os.path.join(root, n)
            lines.append("%s  %s" % (sha(p), os.path.relpath(p, DEST)))
    open(SUMS, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print("wrote", SUMS)


def verify():
    want = read_sums()
    bad = 0
    for rel in sorted(set(FILES.values())):
        path = os.path.join(DEST, rel)
        if not os.path.exists(path):
            print("  missing  ", rel); bad += 1; continue
        got = sha(path)
        if rel in want and want[rel] != got:
            print("  CHANGED  ", rel); bad += 1
        else:
            print("  ok       ", rel, "%.1f MB" % (os.path.getsize(path) / 1048576))
    return bad


def fetch():
    os.makedirs(os.path.join(DEST, "lib"), exist_ok=True)
    want = read_sums()
    if all(os.path.exists(os.path.join(DEST, r)) and want.get(r) == sha(os.path.join(DEST, r))
           for r in FILES.values()):
        print("everything is already here")
        return
    print("fetching", TARBALL, "…")
    data = urllib.request.urlopen(TARBALL, timeout=120).read()
    tar = tarfile.open(fileobj=io.BytesIO(data), mode="r:gz")
    for member, dest in FILES.items():
        fh = tar.extractfile(member)
        if fh is None:
            print("  ! not in the tarball:", member); continue
        path = os.path.join(DEST, dest)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        open(path, "wb").write(fh.read())
        print("  got      ", dest, "%.1f MB" % (os.path.getsize(path) / 1048576))
    write_sums()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sums", action="store_true")
    ap.add_argument("--verify", action="store_true")
    a = ap.parse_args()
    if a.sums:
        write_sums(); return 0
    if a.verify:
        return 1 if verify() else 0
    fetch()
    print()
    return 1 if verify() else 0


if __name__ == "__main__":
    sys.exit(main())
