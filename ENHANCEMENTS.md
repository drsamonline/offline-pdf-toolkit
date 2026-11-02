# Enhancements

What this app could do next, under one rule: **it must stay offline, and it must not gain a
dependency.** No CDN, no API key, no package that has to be installed at runtime, no service that
has to be reachable. Anything that fails that test is listed at the end as a non-goal rather than
smuggled into the roadmap.

Status as of **1.8.0**: the app makes no external request, speaks three languages, does the job it
claims, compresses losslessly with qpdf, and processes a whole folder. What is left is one piece of
performance work that needs a different engine, and a human read of the translations. What is left is written down
here with the reason it is left, so the next session starts where this one stopped.

---

## Shipped in 1.3.0

| What | Where |
|---|---|
| Trim margins (`CropBox`), resize to A4 / Letter with rotation preserved | Page size & trim |
| 2-up, 4-up and saddle-stitch booklet on A4 landscape | Impose (N-up) |
| Header & footer with `{n}`, `{total}`, `{date}`, `{file}` | Header & footer |
| Bates numbering: prefix, start, zero-padded digits, four positions | Bates numbering |
| Split by every N pages, one file per page, or ranges | Split & export |
| Every page as a PNG at any DPI | Split & export |
| Redaction from pdf.js text coordinates, with a rasterising rebuild so the text is gone | Redaction |
| Flatten form fields, remove metadata | Document & self-test |
| A live count and list of every request the page makes | Network |
| Six-check self-test that proves merge / rotate / crop / AES-256 in the tab | Document & self-test |
| Command palette over every tool (`Ctrl-K`) | anywhere |
| Cancel for compression, redaction rebuild, splitting and PNG export | progress bar |
| Size guard above 150 MB | on load |
| Version and build stamp in Help | Help |
| Libraries vendored with `SHA256SUMS`, verified before inlining; one-command rebuild | `vendor/`, `pipeline/build_pdf.py` |
| Fill AcroForm fields, with appearances built before flattening | Form fields |
| Signature: draw or load, trimmed to its ink, placed where you choose | Signature |
| Extract the images a PDF stores inside itself, at full resolution | Extract images |
| Compress the photographs only, leaving the text as text; optional greyscale | Compress |
| Undo / redo over every page operation | `Ctrl-Z` |
| A Content-Security-Policy that names the only two origins allowed | built page |
| Memory readout, grid roles and labels, keyboard page moves | footer, grid |

## 1. ~~The one remaining network dependency: OCR~~ — done in 1.5.0

The engine ships beside the app in `docs/play/ocr/` (~10 MB: wrapper, worker, two LSTM-only WASM
cores, fast English data), fetched once by `tools/fetch_ocr.py` and committed. The page reaches no
other origin, and the CSP says so. Adding a second language is the same script with a different
`traineddata` file — the UI already lists six.

## 2. ~~Make the offline claim structural~~ — done in 1.5.0

The built page carries a CSP with `connect-src 'self' blob: data:` and no external origin named.
Combined with the network panel, the claim is both enforced and checkable.

## 3. Still missing from the toolkit

| Feature | Why people need it | Effort |
|---|---|---|
| **PDF → Word / text with layout** | Text extraction is flat today. | L |
| ~~**A real lossless compression pass**~~ | Done in 1.7.0 with the qpdf WASM runtime. Its ceiling is modest on an already-compressed file and larger on a badly generated one; it never grows the file. | — |

## 4. Working on many pages without losing your place

- ~~**Undo / redo across every operation.**~~ Done in 1.4.0: a 60-step stack over rotate, delete,
  duplicate, move and loading files.
- **A resumable workspace.** The tool settings are now stored and restored (1.5.0). The page list
  is deliberately not: keeping your documents between visits is the one thing this app promises not
  to do.
- ~~**Batch mode.**~~ Done: *one file per source* in 1.5.0, and *a whole folder* in 1.8.0 — the
  picker, the per-file result line, and one bad file not stopping the rest.
- **Drag-rectangle selection** and a *select every N* helper.

## 5. Big files, weak devices

The practical ceiling is memory, and the app now warns at 150 MB but does not manage it.

- ~~**`OffscreenCanvas`** for thumbnails and compression.~~ Deliberately not done: on the main
  thread it moves no work off the thread, so it would be theatre. What the freeze actually needed
  was yielding, which 1.8.0 added (every 25 pages, with Cancel honoured).
- **Streaming page-by-page saves** instead of holding the whole output twice.
- **A memory readout** next to the page count, using `performance.memory` where it exists.

Effort M–L. Risk: the render path is shared by thumbnails, compress, redaction and OCR — one
helper, four callers, so a change needs a regression pass on all four.

## 6. Reach and manners

- ~~**English / हिन्दी / ગુજરાતી** in the interface.~~ Done in 1.6.0 for the whole interface, with
  the Help text deliberately left in English until a native speaker reads it. Corrections live in
  one file of string pairs.
- **Accessibility pass.** The grid is drag-only for reordering, and the new panels need a
  keyboard route; there is an `aria-live` line now, but focus order and labels are unchecked.
- **File System Access API**: open a file and save back to it, where the browser supports it.

## 7. Release and repository hygiene

- ~~**Versioned releases from `CHANGELOG.md`**~~ — done: `v1.3.0` is tagged, with its own notes and
  icons, while `app-latest` stays the rolling build the download links use.
- **`SHA256SUMS` per release**, so a downloaded file can be checked.
- **Screenshots regenerated by CI** rather than by hand: `tools/shot.py` is the tool, and the
  workflow already has a screenshot job that only knows about the landing page.

## 8. Non-goals

Kept out on purpose, and worth writing down so nobody adds them later:

- **PDF/A conversion, Ghostscript, PyMuPDF, CoherentPDF** — AGPL, and the licence here is
  PolyForm Noncommercial.
- **Server-side anything**: upload endpoints, accounts, sync, share links, "AI" features that need
  an API.
- **Cloud OCR / cloud translation.**
- **A build step that installs packages at runtime** — the artefact is one file you can keep on a
  USB stick for a decade.

---

## If you only do three things

1. **Vendor the OCR engine** (§1) — the last thing standing between this app and a completely true
   offline claim.
2. **Add the CSP** (§2) once that is done, so the promise is enforced by the browser.
3. **Undo/redo plus batch mode** (§4) — the two features that turn a demo into a daily tool.

## What ziptastic taught us about PDF compression

`ziptastic` is the CHCE engine — a different job (archival compression, one binary, codecs
embedded). Its PDF work is worth reading because it measured the thing everyone guesses at.

**What it does.** It finds the FlateDecode streams inside `stream … endstream`, inflates them,
runs them through the normal pipeline, and stores a *preflate recipe* that reconstructs the
original Deflate bytes exactly. The output is a `.hzpkg` that `heavenzip` turns back into a
bit-identical PDF.

**Why none of that can be used here.** The recipe approach exists so the original bytes come back
byte for byte. This app has to hand back a PDF that opens in Acrobat, not an archive that needs a
second tool — so a container is the wrong shape, and a lossless *re-encode* is the right one.
qpdf's `--recompress-flate` does exactly that: inflate, re-deflate at level 9, keep the document
openable. It cannot beat preflate's ratio because it cannot store a recipe, but it produces the
thing the user actually asked for.

**What its benchmarks confirm.** Two rows, and both match what this app sees:

| file | before | after | verdict |
|---|---|---|---|
| `poor.pdf` (weak, level-1 Deflate) | 31,452 | **6,562** (−79%) | worth doing |
| `big.pdf` (already level-9) | 6,034 | 6,034 | declined, correctly |

The win is entirely in the streams the *producer* left uncompressed. A PDF whose bytes are mostly
a JPEG barely moves: measured here on a 233 KB photo page, qpdf returned 238,566 from 238,858 —
**0.1%**. That is not a defect; it is where the bytes are. Shrinking those is a lossy decision the
user makes with the quality slider, in *photos only* mode, not something a "lossless" button should
do behind their back.

**What was adopted.** The discipline, mainly: check whether the transform engaged instead of
trusting the output size, and say plainly when a file declined. Concretely, the lossless pass now
also runs `--remove-unreferenced-resources=yes` (safe: it drops only what nothing points at) and
keeps the original whenever qpdf's output is not smaller. `--optimize-images` was tested and left
out — it moved 8 bytes on the photo page and its effect on image data is not something this app is
willing to call lossless.

**Not applicable, for the record.** ziptastic's lossless JPEG recompression (`jpeg_wrap`) and its
content-defined dedup both need the archive round-trip to be useful. Inside an openable PDF they
would have to be expanded again before any viewer could read the page, which puts the bytes back.

## Refused with evidence: a "Repair" button

qpdf looks like it should repair a damaged PDF — it is the tool people reach for. It cannot, in this
build, and the attempt is recorded here so nobody adds the button again without re-testing.

| damage | what qpdf said |
|---|---|
| `startxref` pointing at a wrong offset | `in.pdf (offset 999999): xref not found` |
| the trailer cut off (truncated download) | `in.pdf: can't find startxref` |
| `--ignore-xref-streams` on either | same failures |

Both are the cases a Repair button would exist for, and both fail. The button was written, tested,
and removed rather than shipped greyed out with an apology. The lossless pass already covers what
qpdf *can* do — rebuild object streams and drop what nothing references — so nothing is lost by the
removal. If a recovery engine is wanted later it needs to scan for `N N obj` and rebuild the xref
itself, which is a different piece of work.
