# Changelog

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
