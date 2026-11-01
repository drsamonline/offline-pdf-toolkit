# Changelog

## [1.6.0] — 2026-11-01

### Added
- **Insert blank pages** — the landing page has claimed this since 1.3.0 and the app never had it,
  which is the sort of thing a claims audit is for. The blank page takes the size of the page before
  it, so a run of A4 stays A4, and blanks are not counted as files.
- **The interface speaks English, हिन्दी and ગુજરાતી.** A language button in the header cycles them
  and the choice is remembered. Every label, button, panel title, option and the live page counter
  is translated; the Help text and the long explanatory paragraphs stay English on purpose, because
  a mistranslated word in a document tool is worse than an English one and those passages want a
  human read. The strings live in one file, `pipeline/app_i18n.js`.

### Changed
- The page counter is built at runtime, so it now goes through the same string table as the markup
  and refreshes when the language changes.

### Verified
- 12 new browser checks: a blank page lands after the selection and saves as a real page, Hindi and
  Gujarati both replace the chrome (nothing silently falls back to English), the counter follows the
  language, and the choice survives a reload.
- Every produced PDF inspected with PyMuPDF: the saved document is 4 pages, all 595 pt wide.
- The 1.3, 1.4 and 1.5 suites (14 + 16 + 9 checks) and the landing page on both deployments still pass.

## [1.5.0] — 2026-11-01

The release where "offline" stopped needing a footnote.

### Changed
- **OCR no longer touches the network.** The recognition engine — the JS wrapper, its worker, two
  LSTM-only WASM cores and the fast English language data, about 10 MB — now ships beside the app in
  `docs/play/ocr/`. `tools/fetch_ocr.py` fetches it once, for a human with a connection, and verifies
  every file against `SHA256SUMS`; the files are committed, so a fresh clone and every release
  artefact carry them. The first click works with the cable out.
- **The Content-Security-Policy lost its last exception.** `connect-src` is now `'self' blob: data:`,
  with no external origin named anywhere. The browser refuses anything else.
- **The network panel counts honestly**: it separates requests that left this origin from files
  loaded beside the page, and reports `0 external`. The OCR engine appears in the list as *this
  origin*, which is the whole point.

### Added
- **Batch save** — *one file per source*: apply the same tools to every loaded document and get one
  output each, named after its source.
- **Remembered tools** — the tool settings are stored on change and restored on the next visit, and
  *Reset tools* forgets them. (The page list itself is not stored: that would mean keeping your
  documents, which is exactly what this app refuses to do.)

### Fixed
- tesseract.js with `oem=1` asks for the **LSTM-only** cores (`tesseract-core-simd-lstm.wasm.js`),
  not the full ones; vendoring the wrong pair made the engine fail silently with a 404. The right
  pair is 4 MB smaller than the wrong one.

### Verified
- 9 new browser checks: the engine loads from this origin, OCR reads a page that is only a picture
  of text ("SAMPLE DOCUMENT — NOT REAL PATIENT DATA …"), the counter reads `0 external` afterwards,
  batch save produces one file per source, and the tool settings survive a reload.
- Every produced PDF inspected with PyMuPDF: the batch outputs are 1 page and 3 pages with the
  requested 12 pt trim on each.
- The 1.3 and 1.4 suites (14 + 16 checks) and the landing page on both deployments still pass.

## [1.4.0] — 2026-11-01

Everything below runs on the pdf-lib and pdf.js already inside the single file. No new library,
no new request, no new dependency.

### Added
- **Fill form fields** — reads an AcroForm, fills it and flattens the values into the page. Works
  on fields that carry no default appearance, which is where a naive flatten draws nothing.
- **Signature** — draw it on a pad or load a picture; the empty margin is trimmed off the ink,
  then it is stamped on the selected pages at a chosen corner, width and opacity.
- **Extract images** — recovers the pictures a PDF stores inside itself at full resolution,
  through pdf.js's operator list, including images it caches in the shared object store.
- **Compress: photos only** — re-encodes the JPEGs inside the file and leaves the text as text,
  which is the right tool for a document with photographs. On the test document: 234 KB → 155 KB
  with the text still extractable.
- **Greyscale** — an optional pass on the rasterise path; verified to produce R = G = B.
- **Undo / redo** — `Ctrl-Z` and `Shift-Ctrl-Z` over rotate, delete, duplicate, move and loading
  files, with a 60-step stack.
- **A Content-Security-Policy** — `connect-src` names this origin and the OCR CDN and nothing
  else, so the browser refuses any other destination.
- **Memory readout** in the footer where the browser exposes it, and labels/roles for the page
  grid so it is a listbox rather than a mystery to a screen reader.

### Fixed
- **The build's minifier was not safe for real code.** It stripped `/* … */` with a regex, so the
  string `'image/*'` opened a comment that swallowed the next few hundred lines; the version that
  knew about quotes was then fooled by the `"` inside `/[&<>"]/g`. It now scans properly, with
  strings and regular-expression literals both respected — and `build_landing.py` uses the same
  implementation instead of its own copy.
- **Form fields silently did nothing.** The vendored pdf-lib is minified, so its class names are
  mangled (`Tp`, `Sp`); type checks by constructor name matched nothing. Both the field scan and
  the fill now ask what a field can *do* (`setText`, `check`, `select`).
- **A signature never reached the page** unless another decoration was also selected — the
  post-pass in `buildDoc` did not list `opts.sign` among its triggers.
- Imposition drew pages at full size inside smaller cells (fixed in 1.3.1's maths, covered here by
  the same test).

### Verified
- 16 browser checks in headless Chromium: form scan and fill, signature trimming and stamping,
  image extraction, both compression modes, greyscale, undo and redo, the memory readout, grid
  roles, the CSP, and that the palette still lists every action.
- Every produced PDF inspected with PyMuPDF: the filled value present as text with zero widgets
  left, a signature image on all three pages, 234 KB → 155 KB with "Report with a photograph" and
  the body paragraph still extractable, a rendered page whose channels are identical, and a
  1600 × 1200 PNG recovered from the embedded JPEG.
- The 1.3 suite still green: 14 checks, and the landing page verified on both deployments.

### Credits
Two ideas — re-encoding embedded JPEGs instead of rasterising, and trimming a signature to its ink —
come from [PaperKnife](https://github.com/potatameister/PaperKnife) (AGPL-3.0). No code was taken;
it is AGPL and this app is not, so both were written fresh against pdf-lib and pdf.js.

## [1.3.0] — 2026-11-01

The tools release. Everything below runs on the pdf-lib and pdf.js already inside the
single file — no new library, no new request, no new dependency.

### Added
- **Trim & resize** — cut the same margin off every edge (`CropBox`, so nothing is
  rasterised), or re-lay mixed page sizes onto A4 portrait, A4 landscape or Letter, scaled to
  fit with rotation preserved.
- **Imposition** — 2-up and 4-up on A4 landscape sheets with a configurable gap, and a
  saddle-stitch **booklet** order so a two-sided print folds into reading order.
- **Header & footer** — six positions with `{n}`, `{total}`, `{date}` and `{file}` tokens.
- **Bates numbering** — prefix, start, zero-padded digit count and four positions.
- **Split** — every N pages, one file per page, or explicit ranges (`1-3, 4, 8-10`).
- **Export pages as PNG** — any DPI, one file per page.
- **Redaction** — every match of the words you list is covered, positioned from pdf.js's own
  text coordinates. With *rebuild pages as images* on, the page is rasterised afterwards, so
  the text under the box is really gone rather than merely hidden.
- **Flatten form fields** and **remove metadata** on save.
- **Network panel** — every `fetch` and `XMLHttpRequest` is counted and listed. A fresh copy
  reads `0 requests`, which is the privacy claim made checkable instead of asserted.
- **Self-test** — six checks run in the tab: create pages, rotate, crop, AES-256 round trip,
  pdf.js text read-back, and the network guard.
- **Command palette** (`Ctrl-K`) over every tool.
- **Cancel** for compression, redaction rebuild, splitting and PNG export.
- **A size guard** that warns above 150 MB, where a tab starts running out of memory.
- **A build stamp and version** in the Help panel.

### Fixed
- **The build was not reproducible from the repository.** `build_pdf.py` read its libraries
  from a scratch directory that only existed on one machine, so a fresh clone could not rebuild
  `app.html`. The libraries now live in `vendor/`, are verified against `vendor/SHA256SUMS`,
  and the build writes `app.html` and `docs/play/index.html` in one step.
- **The readable source had drifted from the shipped file.** `pipeline/app_template.html` was
  missing the kit's export/restore/undo/keyboard block and one `#aside` rule that the released
  `app.html` contained — a rebuild would have silently removed them. Both are back in the
  source, and a rebuild is now byte-identical to the shipped file.
- Imposition drew every page at its original size inside a smaller cell, so 2-up sheets
  overflowed; booklet padding could point past the last page.

### Verified
- 14 browser checks in headless Chromium over a real HTTP origin: trim, resize, 2-up, booklet,
  split by count and by ranges, PNG export, self-test, command palette, watermark regression,
  rotation regression, and a clean page reporting zero requests.
- Every produced PDF inspected independently with PyMuPDF: `CropBox` at 24 pt on all sides,
  A4 at 595.3 × 841.9 with text still selectable, 5 pages → 3 sheets at 2-up and 4 sheets as a
  booklet with every source page appearing exactly once, `ABC-00007` and `1 / 5` present as
  text, the redacted word absent from the rebuilt pages and still present when only boxes are
  drawn, split parts of 2 / 2 / 1 pages, and a 794 × 1123 PNG at 96 DPI.

## [1.2.0] — 2026-11-01

The presentation release: the app is unchanged, but the way it is published,
described and installed was rebuilt.

### Added
- **A landing page designed for this project**, at `docs/index.html` and the repo root. Paper,
  ink and one rubber-stamp red — deliberately nothing like the app's dark interface, so the two
  read as a page and a product rather than the same thing twice.
- **The demo is the app, embedded.** A same-origin iframe of `docs/play/` that auto-loads two
  generated sample PDFs, with guided buttons (load the sample, select all, open watermark,
  password protect, reset) that drive the real application. On a wide screen the frame renders the
  app at its own 1280px width and scales it, so the toolbar never wraps in a narrow frame. A poster
  screenshot sits behind it and is only covered once the frame has loaded.
- **Local badges** — `tools/badges.py` draws `docs/assets/badge-*.svg`. The README no longer
  fetches a badge from shields.io: an offline-first app should not need an image service to
  describe itself.
- **Screenshots of the real app** — `docs/assets/app-desktop.png` and `app-mobile.png`, taken from
  the built app with five sample pages loaded.
- **Icons for the releases** — `docs/assets/icon-192.png`, `icon-512.png` and `icon-180.png`
  generated from the existing icon, referenced by both manifests, and attached to the release
  alongside the EXE, APK and Linux binary. The README and landing page carry a platform icon per
  download.
- **`ENHANCEMENTS.md`** — what to build next under the rule that the app must stay offline with no
  new dependency, and the non-goals that are refused on purpose.
- **A build stamp in the landing page footer** (`v1.2.0 · built <date> · <sha>`), because a
  cache-first service worker makes "am I on the new one?" otherwise unanswerable.
- `pipeline/build_landing.py` — one source (`pipeline/landing.html`) emits both landing pages.

### Fixed
- **The service worker was never registered.** `sw.js` shipped and nothing called it, so
  "works offline after the first load" was not true for a first-time visitor. Both the app and the
  landing page now register it, from the same directory or one level up, and call `update()` on
  every load.
- **The offline cache pointed at a file that does not exist** in the Pages deployment
  (`./app.html`), and its `addAll` would have failed as one block. Each core path is now added on
  its own, and both deployments' paths are covered.
- **`docs/manifest.webmanifest` opened a 404** — `start_url` was `./app.html`, which is not where
  the app lives under `docs/`. It is now `./play/`, with PNG icons at 192 and 512.
- **`VERSION` said 1.0.0** while the changelog was at 1.1.2 and the build stamped 1.1.2. Now 1.2.0
  everywhere, including the app's `app-version` meta tag.

### Verified
- Both deployments loaded in headless Chromium over a real HTTP origin: every image resolves, the
  demo frame comes alive and loads five sample pages, the guided buttons open the watermark panel
  with `CONFIDENTIAL`, the theme toggles and remembers under its own key, and the service worker
  reaches `active`.
- The app still loads and renders after the patch: two files → two pages, thumbnails drawn by
  pdf.js, service worker active at the site scope.

## [1.1.2] — 2026-10-22

### Fixed
- **On phones, the stage toolbar and the page grid were painting over the Tools panel.**
  Two causes: `#stage` had no `overflow`, so anything taller than the stage escaped it; and on
  mobile **both** panels were rendered at once, so on a 320×568 screen the stage was squeezed to
  **99 px** while its own toolbar needed ~143 px — the toolbar overflowed straight into the panel
  below. The stage now clips (`overflow:hidden`) and mobile shows **one panel at a time**, driven
  from a single `setView()` so the tab state can never disagree with what is on screen.
  The stage now gets the full height: **418 px** at 320×568 instead of 99.
- The page footer no longer wraps to three lines on a phone (the long privacy line is hidden
  below 920 px; the page/size counter stays).

### Changed
- Mobile panel sizing no longer uses `vh` for a single panel, so the layout cannot exceed the
  viewport.

### Verified
- Document height equals viewport height at 320×568, 360×640, 390×844, 768×1024, 1024×768,
  1440×900 and 2560×1440; no horizontal scroll; nothing escapes the stage at any size.
- Switching Pages ↔ Tools on mobile: the correct panel fills the screen and scrolls internally.
- Full functional regression still green: merge, thumbnails, AES-256 encrypt, unlock, extract
  text, compress, watermark, page numbers.

## [1.1.1] — 2026-10-22
### Fixed
- Removed a dead variable (`v0`) left in the compression path.
- The build reported its version as `1.0.0` while shipping 1.1.0 — corrected.

### Changed
- **De-duplicated the page-rendering code.** The block that turns a page (or image) into
  a canvas existed twice, in Compress and in OCR. Both now call one `pageToCanvas()` helper.
- **The landing page is now generated, not hand-maintained.** `pipeline/landing.html` is the
  single source; the build emits `index.html` (root) and `docs/index.html` (Pages source)
  from it, swapping the app link automatically.
- **Minified at build time** — the app's own CSS/JS/HTML goes 46,654 → 43,196 bytes (−7%), and
  the landing page 19,028 → 18,349 (−4%). The bundled libraries were already minified.

## [1.1.0] — 2026-10-22

### Added
- **Password protect** — AES-256 encryption with user and owner passwords, and
  permission controls for printing, copying and modifying. Applied on save.
- **Unlock a PDF** — remove a password you already know. The file is decrypted in
  the browser by re-writing its pages; nothing is uploaded.
- **Extract text** — pull the text out of a digital PDF, one `.txt` per source file.
- **OCR** — read text out of scans. The engine (~7 MB) is downloaded once and then
  cached by the browser, so it works offline afterwards. Your document is never
  uploaded; only the engine is downloaded.
- **Credits & licences** panel in the app, and a Credits section on the landing page.

### Changed
- Swapped `pdf-lib` for the **Cantoo fork** (still MIT) — the same API plus PDF
  encryption. +91 KB, and it replaced a 2.3 MB WebAssembly detour through qpdf.
- `THIRD-PARTY-NOTICES.md` now covers all four libraries with full licence texts.

### Notes
- OCR is the one feature that touches the network, and only to fetch the engine.
  The document itself is never sent anywhere.

## [1.0.0] — 2026-10-22
- First release: merge, split, extract, rotate, reorder, duplicate, delete,
  watermark, page numbers, metadata, compress and images→PDF, all client-side.
