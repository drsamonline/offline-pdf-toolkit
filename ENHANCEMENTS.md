# Enhancements

What this app could do next, under one rule: **it must stay offline, and it must not gain a
dependency.** No CDN, no API key, no package that has to be installed at runtime, no service that
has to be reachable. Anything that fails that test is listed at the end as a non-goal rather than
smuggled into the roadmap.

Status as of **1.4.0**: everything except the OCR engine, batch mode, translation, and the
larger performance work is shipped. What is left is written down
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

## 1. The one remaining network dependency: OCR

OCR is now the only thing that touches the network: `tesseract.js`, its core and the language data
come from `cdn.jsdelivr.net`. Everything else is already offline. This is the gap between
"offline-first" and "offline, full stop".

| Option | What it means | Effort | Weight |
|---|---|---|---|
| **A. Bundle the engine** | Inline `tesseract.js` + core + `eng.traineddata` (fast) the way pdf-lib already is. OCR works with the cable out, first try. | M | +12–14 MB on the app file |
| **B. Ship an OCR pack** | Keep the app lean; add `ocr-eng.zip` as a **release asset**. The app asks for a local file once, caches the bytes in IndexedDB, never asks again. | M | 0 in the app, ~4 MB in the release |
| **C. Load a `.traineddata` from disk** | The smallest step: a *Choose language file…* button. No download at all, but tesseract.js itself still needs a home. | S | 0 |
| **D. Drop OCR from the core** | It is the one feature that is not really a PDF-toolkit job. Move it to a sibling app. | S | −40 KB |

**Recommendation: B, then A.** B keeps the single file small and makes the offline path explicit;
A is the honest end state for the EXE and APK, where 12 MB costs nothing.

## 2. Make the offline claim structural

The network panel counts requests, which is evidence. A Content-Security-Policy would make it a
guarantee: `default-src 'self'; connect-src 'self' https://cdn.jsdelivr.net` today, and
`connect-src 'none'` the day OCR is vendored. The CSP has to be added to the built HTML rather than
the template, because the pdf.js worker needs a blob: origin.

Effort S. Do it together with §1, not before — a CSP that has to allow the CDN is a weaker claim
than the panel already makes.

## 3. Still missing from the toolkit

| Feature | Why people need it | Effort |
|---|---|---|
| **PDF → Word / text with layout** | Text extraction is flat today. | L |
| **A real lossless compression pass** | The photos-only mode re-encodes JPEGs, but object streams, fonts and duplicate resources are untouched. qpdf is Apache-2.0 (unlike Ghostscript), so a WASM build of it would not change this app's licence — that is the one route worth investigating. | L |

## 4. Working on many pages without losing your place

- ~~**Undo / redo across every operation.**~~ Done in 1.4.0: a 60-step stack over rotate, delete,
  duplicate, move and loading files.
- **A resumable workspace.** Autosave the page list *and* the tool settings to IndexedDB, offer
  *Restore* next visit, let the user discard it. The buttons exist; the tool settings are not in them.
- **Batch mode across a folder.** One watermark, one numbering scheme or one compression preset
  applied to many files, with a per-file result list. Effort L, and the difference between a
  utility and a tool people keep.
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

- **English / हिन्दी / ગુજરાતી** in the interface, following the estate's `web-kit` i18n pattern.
  Strings live in the app; no font download, no translation service. Effort M.
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
