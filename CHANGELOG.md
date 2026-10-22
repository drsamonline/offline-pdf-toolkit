# Changelog

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
