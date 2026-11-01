#!/usr/bin/env python3
"""Fetch the OCR engine into docs/play/ocr/ and verify it against SHA256SUMS.

OCR used to be the one feature that reached the network: tesseract.js, its WASM
core and the English language data all came from a CDN. That made "works offline"
true for everything except the feature people reach for on a scan.

The engine now lives beside the app. It is fetched once, here, by a human with a
network connection — and from then on the app loads it from its own origin, so the
page makes no external request at all and the Content-Security-Policy can say
`connect-src 'self'` and mean it.

    python3 tools/fetch_ocr.py            # download anything missing
    python3 tools/fetch_ocr.py --sums     # rewrite SHA256SUMS after a version bump
    python3 tools/fetch_ocr.py --verify   # check what is on disk, change nothing

The files are committed, because a release that has to download its own OCR
engine is not offline. The total is about 7 MB: the JS wrapper, the worker, two LSTM-only
WASM cores (SIMD and the portable fallback) and the fast English language data.
"""
import argparse
import hashlib
import os
import sys
import urllib.request

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEST = os.path.join(HERE, "docs", "play", "ocr")
SUMS = os.path.join(DEST, "SHA256SUMS")

TESSERACT = "5.1.1"
CORE = "6.1.2"
TESSDATA = "4.0.0_fast"

FILES = {
    "tesseract.min.js":
        "https://cdn.jsdelivr.net/npm/tesseract.js@%s/dist/tesseract.min.js" % TESSERACT,
    "worker.min.js":
        "https://cdn.jsdelivr.net/npm/tesseract.js@%s/dist/worker.min.js" % TESSERACT,
    # oem=1 means LSTM only, and tesseract.js then asks for the -lstm cores
    "tesseract-core-simd-lstm.wasm.js":
        "https://cdn.jsdelivr.net/npm/tesseract.js-core@%s/tesseract-core-simd-lstm.wasm.js" % CORE,
    "tesseract-core-lstm.wasm.js":
        "https://cdn.jsdelivr.net/npm/tesseract.js-core@%s/tesseract-core-lstm.wasm.js" % CORE,
    "eng.traineddata.gz":
        "https://cdn.jsdelivr.net/gh/naptha/tessdata@gh-pages/%s/eng.traineddata.gz" % TESSDATA,
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
    lines = ["# sha256 of the vendored OCR engine, checked by tools/fetch_ocr.py",
             "# regenerate with: python3 tools/fetch_ocr.py --sums"]
    for name in sorted(FILES):
        path = os.path.join(DEST, name)
        if os.path.exists(path):
            lines.append("%s  %s" % (sha(path), name))
    open(SUMS, "w", encoding="utf-8").write("\n".join(lines) + "\n")
    print("wrote", SUMS)


def verify():
    want = read_sums()
    bad = 0
    for name in sorted(FILES):
        path = os.path.join(DEST, name)
        if not os.path.exists(path):
            print("  missing  ", name)
            bad += 1
            continue
        got = sha(path)
        if name in want and want[name] != got:
            print("  CHANGED  ", name, "\n    expected", want[name], "\n    got     ", got)
            bad += 1
        else:
            print("  ok       ", name, "%.1f MB" % (os.path.getsize(path) / 1048576))
    return bad


def fetch():
    os.makedirs(DEST, exist_ok=True)
    want = read_sums()
    for name, url in FILES.items():
        path = os.path.join(DEST, name)
        if os.path.exists(path) and name in want and want[name] == sha(path):
            print("  have     ", name)
            continue
        print("  fetching ", name, "…", flush=True)
        tmp = path + ".part"
        urllib.request.urlretrieve(url, tmp)
        os.replace(tmp, path)
        print("  got      ", name, "%.1f MB" % (os.path.getsize(path) / 1048576))
    if not os.path.exists(SUMS):
        write_sums()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sums", action="store_true", help="rewrite SHA256SUMS from what is on disk")
    ap.add_argument("--verify", action="store_true", help="check the files, change nothing")
    a = ap.parse_args()
    if a.sums:
        write_sums()
        return 0
    if a.verify:
        return 1 if verify() else 0
    fetch()
    print()
    return 1 if verify() else 0


if __name__ == "__main__":
    sys.exit(main())
