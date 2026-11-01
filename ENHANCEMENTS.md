# Enhancements

What this app could do next, under one rule: **it must stay offline, and it must not gain a
dependency.** No CDN, no API key, no package that has to be installed at runtime, no service that
has to be reachable. Anything that fails that test is listed at the end as a non-goal rather than
smuggled into the roadmap.

Status as of **1.7.0**: the app makes no external request, speaks three languages, does the job it
claims, and compresses losslessly with qpdf. What is left is the larger performance work and the
folder flavour of batch mode. What is left is written down
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
- ~~**Batch mode.**~~ Done in 1.5.0 as *one file per source*: the same tools, one output per loaded
  document. What is still missing is the folder variant — pick a directory, apply a preset, get a
  per-file result list — which needs the File System Access API and a progress UI that survives one
  bad file in the middle.
- **Drag-rectangle selection** and a *select every N* helper.

## 5. Big files, weak devices

The practical ceiling is memory, and the app now warns at 150 MB but does not manage it.

- **`OffscreenCanvas`** for thumbnails and compression, so the interface does not freeze while a
  hundred pages render.
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
