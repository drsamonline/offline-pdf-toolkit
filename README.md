# Offline PDF Toolkit

Merge, split, rotate, reorder, watermark, number and compress PDFs — and turn images into PDFs —
**entirely inside your browser**. No upload, no account, no server, no tracking.

**[Open the toolkit →](https://drsamonline.github.io/offline-pdf-toolkit/)** · works offline after the first load.

---

## Why it exists

The files people merge and split are usually the ones they should not hand to a stranger's server —
patient reports, contracts, statements, identity documents. Every "free PDF tool" online uploads
your file. This one cannot: it is a single HTML file with the PDF engine compiled into it, and there
is no backend to send anything to. Unplug the network and it still works.

## Features

| | |
|---|---|
| **Merge** | Add several PDFs; they lay out in order. Drag any page to reorder. |
| **Split / extract** | Select pages (shift-click for a range) and pull them into a new PDF. |
| **Rotate** | 90° steps, left or right, per page or for a whole selection. |
| **Reorder / duplicate / delete** | Drag and drop, or move selections earlier/later. |
| **Watermark** | Text, centre / tiled / corner, with size, opacity, angle and colour. |
| **Page numbers** | Four formats, four positions, starting number, size. |
| **Metadata** | Title, author, subject, keywords. |
| **Compress** | Renders each page to JPEG at a chosen DPI and quality, then rebuilds. |
| **Images → PDF** | PNG and JPEG, one image per page. |
| **Password protect** | AES-256, with user/owner passwords and permissions for printing, copying, modifying. |
| **Unlock** | Remove a password you already know, in the browser. |
| **Extract text** | From a digital PDF → `.txt`. |
| **OCR** | From a scan. Engine downloaded once (~7 MB) then cached; the document is never uploaded. |
| **Credits** | All bundled libraries credited in-app and in `THIRD-PARTY-NOTICES.md`. |
| **Themes** | Dark, light, high-contrast. |
| **Shortcuts** | `a` select all · `d` deselect · `[` `]` rotate · `Delete` remove · `t` theme · `?` help |

## Not included, deliberately

- **PDF/A conversion** and **Ghostscript-class compression.** These need AGPL-licensed components
  (Ghostscript, PyMuPDF, CoherentPDF). Using them would force this app to be AGPL, which is
  incompatible with the licence below. Compress here means rasterise-and-rebuild, which is
  permissive and works well on scans.
- **Editing page content.** The toolkit rearranges and annotates pages; it does not edit text inside them.

## Files

```
app.html                     the whole application (one self-contained file, ~1.9 MB)
index.html                   landing page
docs/                        the same site, for a Pages source pointed at /docs
pipeline/app_template.html   the application source (readable)
pipeline/landing.html        the landing page source (readable)
pipeline/build_pdf.py        inlines the libraries + minifies, producing app.html
                             and both landing pages from the one source
```

`build_pdf.py` embeds **pdf-lib**, **pdf.js** and the pdf.js worker directly into the HTML and
minifies the app's own CSS/JS/HTML on the way out. The readable template stays in `pipeline/`.

## Licences

- **App code** © Dr Sohil Momin — free for personal study, teaching and non-commercial practice;
  commercial use requires a licence; educational institutes free or at a discounted rate.
- **pdf-lib** (Cantoo fork) — MIT · **pdf.js** — Apache-2.0 (Mozilla) ·
  **tesseract.js** and **Tesseract OCR** — Apache-2.0. See [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md).
- **No third-party data is bundled** — no corpora, no fonts, no text of its own.

Because the bundled libraries are permissive rather than copyleft, this app can carry normal
commercial licensing terms.

## Privacy

Your documents are read into the browser's memory, processed on your own CPU, and written back to
your disk. Nothing is uploaded, stored or logged, and closing the tab discards everything.

The one exception is OCR: clicking *Load engine* downloads the recognition engine (~7 MB) from a
public CDN and caches it. That is the only network request the app ever makes, and it carries no
part of your document.
