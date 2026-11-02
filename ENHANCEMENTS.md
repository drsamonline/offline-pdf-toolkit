# Enhancements

What this app could still gain, what it has already gained, and what was refused with a reason.
A refusal is a decision, not a gap — the point of writing it down is that nobody re-litigates it from
memory.

Status: **1.16.0**. The app is a small page (about 40 KB gzipped) plus the engines it loads on demand:
pdf.js, pdf-lib, qpdf and OCR. Everything runs in the tab; nothing is uploaded, and the network panel
proves it.

## Shipped

| Version | What |
|---|---|
| 1.2.0 | The presentation: landing page, live demo, local SVG badges, headless screenshots |
| 1.3.0 | Page surgery: trim, resize, impose 2-up/4-up/booklet, header/footer, Bates, split, PNG export, redaction, flatten, strip metadata, palette, self-test, cancel |
| 1.4.0 | AcroForm fill and flatten, signature pad, image extraction, photos-only compression, undo/redo, CSP, memory readout |
| 1.5.0 | OCR engine vendored and offline, batch save, remembered tool settings |
| 1.6.0 | Insert blank pages, English/Hindi/Gujarati interface |
| 1.7.0 | Lossless compression with qpdf |
| 1.8.0 | A whole folder at once, compression on the original bytes, a build that yields |
| 1.9.0 | First load 118 KB instead of 2,093 KB — engines on demand, worker as a real file |
| 1.9.1 | Two more samples, shipped and reproducible |
| 1.10.0 | Share locked (LockHTML's container), keyboard/ARIA grid, CI shell-size budget |
| 1.11.0 | Open a protected PDF and keep its protection, redaction by shape, SHA256SUMS per release |
| 1.12.0 | The suites live in the repo and run in CI, split by bookmark, compare, remembered signature |
| 1.13.0 | What's-new band on the landing page, skip link and focus ring, the writer prefetched |
| 1.14.0 | Logical page labels (i, ii then 1, 2), labelled-ID redaction, About panel in the app |
| 1.15.0 | The front door: launcher in the empty state, one tool catalogue in data, all-tools sheet, session list, category tints |
| 1.16.0 | `pdfkit`, a CLI over the same vendored engines — twelve commands, stdin/stdout, `--json`, 37 checks, a packaged tarball |

## Open, and cheap

Nothing. The three that were here — page labels, labelled-ID redaction and the in-app what's-new
panel — shipped in 1.14.0.

## Open, and cheap

- **A five-item bottom nav on the phone** (Home · Pages · Tools · Session · More). The launcher made
  Home unnecessary as a tab for now — it is where the pages grid already is when it is empty — but a
  real tab bar would let a thumb move between the grid and the panels without the current
  `Pages │ Tools` strip. It waits because the grid is a labelled listbox with its own focus order,
  and a new bar is exactly the thing that breaks that quietly.
- **A success screen instead of a toast.** The session list is the first half; the second is the
  screen that shows what was written — name, pages, before/after size, Save · Share · Start over —
  and gives Compress somewhere to say "declined, 0.1 %" rather than returning a same-size file
  silently.

## Open, and not cheap

- **Virtualised page grid, thumbnails rendered in a worker.** The real fix for a thousand-page
  document. It needs a thousand-page document to measure against, and a rewrite of the render path
  that is easy to get subtly wrong.
- **Outline editing.** pdf-lib cannot write outlines at all — verified while building split-by-
  bookmark, which needed a PyMuPDF fixture because of it. This needs a different writer.
- **Lite vs Full builds** — dropping the 10 MB OCR engine from the APK. The packaging lives in the
  shared app-builder kit, so it is a second pipeline there, not a change here.

## Read by a person

- **The Hindi and Gujarati interface strings** were read by a native speaker on 2 November 2026
  against a numbered review sheet (100 pairs, the real screens in both languages, and the
  translations flagged where they run long for their button). No corrections were needed. This is
  the one item on this list that a model could not close on its own.
- **47 labels added after 1.6.0 are still English** — the folder panel, Share locked, page labels,
  Compare, the redaction patterns. They arrived after the translation pass and need a second one,
  with the same review sheet treatment rather than a silent machine pass.

## Refused, with the evidence

- **A Repair button.** qpdf refuses both damage cases it would exist for: `xref not found` when
  `startxref` points at the wrong offset, `can't find startxref` when the tail is truncated, and
  `--ignore-xref-streams` helps with neither. It was written, tested and removed.
- **Streaming saves.** pdf-lib builds the whole output in memory and has no incremental writer. The
  app warns at 150 MB instead of pretending.
- **`OffscreenCanvas` on the main thread.** Moves no work off the thread. Yielding every 25 pages is
  what actually keeps the interface alive.
- **JPEG → WebP/AVIF inside a PDF.** No viewer reads them; the file would stop opening.
- **Font subsetting.** The biggest remaining win on some documents, and every permissive option is
  either unmaintained or licensed incompatibly.
- **PDF → Word.** Text extraction works; layout reconstruction is a different product.
- **Preflate-style archival compression** (ziptastic). It produces a container that must be
  decompressed, not a PDF that opens. Its benchmarks do confirm ours: −79% on a weakly deflated file,
  nothing on one that is mostly JPEG. See the section below.

## What ziptastic taught us about PDF compression

`ziptastic` finds the FlateDecode streams inside `stream … endstream`, inflates them, runs them
through the CHCE pipeline, and stores a preflate recipe that reconstructs the original bytes exactly.
The output is a `.hzpkg` that `heavenzip` turns back into a bit-identical PDF.

None of that can be used here, because the shape is wrong: this app must hand back a PDF that opens
in Acrobat, not an archive that needs a second tool. qpdf's `--recompress-flate` does the right thing
instead — inflate, re-deflate at level 9, keep the document openable.

Its benchmarks confirm what this app sees:

| file | before | after | verdict |
|---|---|---|---|
| `poor.pdf` (weak, level-1 Deflate) | 31,452 | **6,562** (−79%) | worth doing |
| `big.pdf` (already level-9) | 6,034 | 6,034 | declined, correctly |

A PDF whose bytes are mostly a JPEG barely moves: measured here on a 233 KB photo page, qpdf returned
238,566 from 238,858 — **0.1%**. That is not a defect; it is where the bytes are. Shrinking those is
a lossy decision the user makes with the quality slider, not something a "lossless" button should do
behind their back.

What was adopted: the discipline of checking whether a transform engaged rather than trusting the
output size, and saying plainly when a file declined. The lossless pass also runs
`--remove-unreferenced-resources=yes`. `--optimize-images` was tested and left out — it moved 8 bytes
on the photo page.
