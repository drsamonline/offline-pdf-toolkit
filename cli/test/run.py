#!/usr/bin/env python3
"""Exercise the CLI against the repo's own samples, then check every file it
wrote with an independent library (PyMuPDF).

    python3 cli/test/run.py

Nothing here trusts the CLI's own report: each check reads the bytes back.
"""
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
CLI = os.path.join(REPO, "cli", "pdfkit.mjs")
A = os.path.join(REPO, "assets", "sample-lab-report.pdf")
B = os.path.join(REPO, "assets", "sample-outline.pdf")
OUT = tempfile.mkdtemp(prefix="pdfkit-cli-")

results = []


def note(name, ok, extra=""):
    results.append((name, ok))
    print(("  PASS  " if ok else "  FAIL  ") + name + ((" — " + str(extra)) if extra else ""))


def run(*args, stdin=None):
    return subprocess.run([sys.executable and "node", CLI, *args], capture_output=True, input=stdin)


def ok(*args, stdin=None):
    r = run(*args, stdin=stdin)
    if r.returncode != 0:
        raise RuntimeError("exit %d: %s" % (r.returncode, r.stderr.decode()[:300]))
    return r.stdout.decode()


def pymupdf():
    import pymupdf
    return pymupdf


def main():
    if not shutil.which("node"):
        print("node is not on PATH")
        return 1
    if not os.path.exists(CLI):
        print("missing", CLI)
        return 1
    p = os.path.join(OUT, "x")

    # ---- help, version, usage ----
    h = ok("help")
    note("help lists the commands", "merge" in h and "impose" in h and "labels" in h)
    note("version prints the repo version",
         ok("version").strip() == open(os.path.join(REPO, "VERSION")).read().strip())
    r = run("delete", A)  # no --pages
    note("a missing flag is a usage error, exit 2", r.returncode == 2, r.returncode)
    r = run("nonsense")
    note("an unknown command is exit 2", r.returncode == 2, r.returncode)

    # ---- info ----
    info = json.loads(ok("info", A, "--json"))
    note("info counts the pages", info["pages"] == 2, info["pages"])
    note("info reports bytes and size", info["bytes"] > 500 and info["size"].endswith("KB"), info["size"])
    note("info keeps a page size", info["pageSizes"][0]["width"] == 595, info["pageSizes"][0])
    note("stdin works", json.loads(ok("info", "-", "--json", stdin=open(A, "rb").read()))["pages"] == 2)

    # ---- text ----
    txt = ok("text", A, "--pages", "1")
    note("text reads the text layer", "Laboratory report" in txt)
    note("text keeps line breaks", txt.count("\n") > 5, txt.count("\n"))
    tpath = os.path.join(OUT, "out.txt")
    ok("text", A, "-o", tpath)
    note("text writes a file", os.path.getsize(tpath) > 200, os.path.getsize(tpath))

    # ---- merge ----
    merged = os.path.join(OUT, "merged.pdf")
    ok("merge", A, B, "-o", merged, "--quiet")
    d = pymupdf().open(merged)
    note("merge keeps every page", d.page_count == 6, d.page_count)
    src_b = pymupdf().open(B)
    note("merge keeps the order",
         d[0].get_text().strip() == pymupdf().open(A)[0].get_text().strip()
         and d[2].get_text().strip() == src_b[0].get_text().strip())

    # ---- rotate ----
    rot = os.path.join(OUT, "rot.pdf")
    ok("rotate", merged, "--right", "--pages", "1-2", "-o", rot)
    d = pymupdf().open(rot)
    note("rotate turns the chosen pages", d[0].rotation == 90 and d[2].rotation == 0,
         [d[i].rotation for i in range(3)])
    r2 = os.path.join(OUT, "rot2.pdf")
    ok("rotate", rot, "--left", "--pages", "1", "-o", r2)
    note("rotate adds up", pymupdf().open(r2)[0].rotation == 0)

    # ---- delete / order ----
    dele = os.path.join(OUT, "del.pdf")
    ok("delete", merged, "--pages", "1-2", "-o", dele)
    d = pymupdf().open(dele)
    note("delete removes exactly those pages", d.page_count == 4, d.page_count)
    note("delete drops their text", "Laboratory report" not in d[0].get_text())

    src = pymupdf().open(merged)
    third = src[2].get_text()[:40]
    ordered = os.path.join(OUT, "ord.pdf")
    ok("order", merged, "--pages", "3,1,2", "-o", ordered)
    d = pymupdf().open(ordered)
    note("order puts page 3 first", d[0].get_text()[:40] == third, d.page_count)

    # ---- split ----
    sp = ok("split", merged, "--each", "-o", os.path.join(OUT, "each"), "--json")
    files = json.loads(sp)["files"]
    note("split --each writes one file per page", len(files) == 6, len(files))
    note("each file holds one page", all(pymupdf().open(f).page_count == 1 for f in files))
    rg = json.loads(ok("split", merged, "--ranges", "1-2,5", "-o", os.path.join(OUT, "rg"), "--json"))
    note("split --ranges honours the ranges",
         [pymupdf().open(f).page_count for f in rg["files"]] == [2, 1],
         [pymupdf().open(f).page_count for f in rg["files"]])

    # ---- watermark ----
    wm = os.path.join(OUT, "wm.pdf")
    ok("watermark", A, "--text", "CONFIDENTIAL", "--size", "40", "-o", wm)
    d = pymupdf().open(wm)
    note("watermark draws the text", "CONFIDENTIAL" in d[0].get_text())
    note("watermark leaves the page count alone", d.page_count == 2)
    tiled = os.path.join(OUT, "wmt.pdf")
    ok("watermark", A, "--text", "DRAFT", "--tiled", "-o", tiled)
    note("a tiled watermark repeats", pymupdf().open(tiled)[0].get_text().count("DRAFT") >= 4,
         pymupdf().open(tiled)[0].get_text().count("DRAFT"))

    # ---- page numbers, with a locale ----
    num = os.path.join(OUT, "num.pdf")
    ok("number", merged, "--format", "{n} / {total}", "--start", "1", "--locale", "en-IN", "-o", num)
    d = pymupdf().open(num)
    note("number writes the token text", "1 / 6" in d[0].get_text(), d[0].get_text()[-20:].strip())
    note("number counts to the end", "6 / 6" in d[5].get_text())
    dated = os.path.join(OUT, "dated.pdf")
    ok("number", A, "--format", "{date}", "--locale", "en-IN", "-o", dated)
    import datetime
    year = str(datetime.date.today().year)
    note("the date token is locale-formatted", year in pymupdf().open(dated)[0].get_text(), year)

    # ---- metadata ----
    m1 = os.path.join(OUT, "meta.pdf")
    ok("meta", A, "--title", "Discharge summary", "--author", "Dr Sohil Momin", "-o", m1)
    md = pymupdf().open(m1).metadata
    note("meta writes the title", md.get("title") == "Discharge summary", md.get("title"))
    note("meta writes the author", md.get("author") == "Dr Sohil Momin")
    stripped = os.path.join(OUT, "strip.pdf")
    ok("meta", m1, "--strip", "-o", stripped)
    note("meta --strip clears it", not pymupdf().open(stripped).metadata.get("title"))

    # ---- page labels ----
    lab = os.path.join(OUT, "lab.pdf")
    ok("labels", B, "--front", "2", "--style", "roman", "-o", lab)
    d = pymupdf().open(lab)
    labels = [d[i].get_label() for i in range(d.page_count)]
    note("labels read back as i, ii, then 1, 2", labels == ["i", "ii", "1", "2"], labels)

    # ---- impose ----
    im = os.path.join(OUT, "impose.pdf")
    ok("impose", merged, "--nup", "4", "-o", im)
    d = pymupdf().open(im)
    note("4-up halves the sheet count", d.page_count == 2, d.page_count)
    note("4-up uses landscape sheets", d[0].rect.width > d[0].rect.height, d[0].rect)
    bk = os.path.join(OUT, "booklet.pdf")
    ok("impose", merged, "--booklet", "-o", bk)
    d = pymupdf().open(bk)
    note("a 6-page booklet needs 4 sheets", d.page_count == 4, d.page_count)
    note("the booklet's first sheet is last-page then first-page",
         pymupdf().open(bk)[0].get_text().strip() != "" )

    # ---- the audit's rules: refusals that would otherwise be silent ----
    enc = os.path.join(OUT, "enc.pdf")
    d = pymupdf().open()
    d.new_page().insert_text((72, 72), "secret")
    d.save(enc, encryption=pymupdf().PDF_ENCRYPT_AES_256, owner_pw="o", user_pw="u")
    r = run("info", enc)
    note("an encrypted file is refused, not half-read",
         r.returncode == 1 and b"encrypted" in r.stderr, r.stderr.decode()[:60])

    r = run("watermark", A, "--text", "\u0917\u094b\u092a\u0928\u0940\u092f", "-o", os.path.join(OUT, "u.pdf"))
    note("text the built-in font cannot draw is refused",
         r.returncode == 1 and b"WinAnsi" in r.stderr, r.stderr.decode()[:60])
    latin = os.path.join(OUT, "lat.pdf")
    r = run("watermark", A, "--text", "\u00e9t\u00e9 \u2014 \u201cquoted\u201d", "--size", "12", "-o", latin)
    note("WinAnsi's own marks still go through", r.returncode == 0, r.stderr.decode()[:60])
    note("and they land on the page",
         "\u00e9t\u00e9" in pymupdf().open(latin)[0].get_text())

    dup = os.path.join(OUT, "dup.pdf")
    ok("order", A, "--pages", "1,1,2", "-o", dup)
    note("order repeats a page when asked", pymupdf().open(dup).page_count == 3,
         pymupdf().open(dup).page_count)

    one = os.path.join(OUT, "only.pdf")
    ok("split", A, "--ranges", "1", "-o", one)
    note("a single split honours the exact -o name", os.path.exists(one))

    rot_src = os.path.join(OUT, "rot-src.pdf")
    ok("rotate", A, "--right", "--pages", "1", "-o", rot_src)
    imp_rot = os.path.join(OUT, "imp-rot.pdf")
    ok("impose", rot_src, "--nup", "2", "-o", imp_rot)
    dirs = [line["dir"] for b in pymupdf().open(imp_rot)[0].get_text("dict")["blocks"]
            if b["type"] == 0 for line in b["lines"]][:6]
    note("impose honours the source page's own rotation",
         bool(dirs) and all(abs(d[0] - 1) < 0.01 and abs(d[1]) < 0.01 for d in dirs), dirs[:3])

    # ---- stdout, json, quiet ----
    r = subprocess.run(["node", CLI, "merge", A, B, "-o", "-"], capture_output=True)
    note("a PDF can go to stdout", r.returncode == 0 and r.stdout[:5] == b"%PDF-", r.stdout[:5])
    q = run("merge", A, B, "-o", os.path.join(OUT, "q.pdf"), "--quiet")
    note("--quiet says nothing", q.returncode == 0 and q.stdout == b"", q.stdout[:40])

    print("\n%d/%d checks passed" % (sum(1 for _, ok_ in results if ok_), len(results)))
    return 0 if all(ok_ for _, ok_ in results) else 1


if __name__ == "__main__":
    sys.exit(main())
