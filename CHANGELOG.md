# Changelog

## [Unreleased]

### Fixed — the CLI

- **A page selection that lands on no page was written anyway.** `--pages 90-100` in a six-page file
  ran to completion: `delete` and `rotate` reported success and wrote the file unchanged, and
  `order` and `split --ranges` wrote a document with no pages. All four now refuse with exit 2 and
  write nothing. A range that only runs off the end still clamps, the way `head -n` does — that is
  the case `--pages 1-99` means, and it is unchanged.
- **A flag at the end of the line took the next thing it found.** `--pages` with no value silently
  meant *every page* (`rotate --pages` turned the whole file), and `-o` with no value fell back to
  the default name and wrote it beside the input. Both are usage errors now.
- **Writing onto a directory printed `EISDIR: illegal operation on a directory, open '…'`.** It says
  which path and why: `cannot write <path>: that path is a directory`.

## [1.16.1] — 2026-11-02

An audit of both shells, and the six things it found. Four of them were silent — the kind that
produce a file which opens and is wrong.

### Fixed — the CLI
- **An encrypted PDF was half-read.** `ignoreEncryption` reads the structure but not the streams, so
  `info` reported pages and `merge` wrote a file whose content was ciphertext. It is now refused with
  the next step named (the app's *Unlock*, or `qpdf --decrypt`).
- **Text the built-in font cannot draw was written as `?`.** The library substitutes without an error:
  a Devanagari watermark came out as `??????`. Text outside WinAnsi is now refused, with the
  character named. WinAnsi's own marks — `—`, `“ ”`, `é` — still pass, which the first cut of this
  check got wrong in the other direction.
- **`order --pages 1,1,2` silently dropped the repeat**, though the help promised a duplicate. Each
  entry is now copied on its own, so a repeated page really repeats.
- **`impose` overflowed the sheet on a rotated source.** pdf-lib bakes a page's `/Rotate` into the
  embedded page; rotating it again here turned it sideways and pushed its ink outside the cell.
  Measured, then fixed by fitting the *visible* box and drawing plainly.
- `split --ranges 1 -o only.pdf` now writes exactly `only.pdf` instead of `only-1.pdf`.
- `-o -` refuses to write binary to a terminal, and a stamp wider than the page says so and suggests
  a size, instead of silently running off the edge.

### Fixed — the app
- **The same rotated-page bug in `impose`**, in `drawFitted`. Same cause, same correction.
- **The session list showed `0 B` for every text, OCR and locked-HTML output** — those are Blobs,
  which have `.size` and no `.length`. Only PDFs were sized correctly.
- **A waiting tool could hijack a later file.** If the picker was cancelled after choosing a tool, the
  next file the user added anywhere opened that panel. The wait now expires and is dropped when a
  load yields nothing.

### Verified
- `python3 cli/test/run.py` — **44 checks** (seven new: the encrypted refusal, the font refusal in
  both directions, the repeat, the exact split name, the rotated impose reading back with horizontal
  text, and the two above).
- `python3 tools/test/run_all.py` — **126 checks** across twelve suites, two new in the launcher suite
  (a Blob's size in the session list, and the expired wait).

## [1.16.0] — 2026-11-02

`pdfkit` — the toolkit in a terminal. The same two engines the page uses, with a shell in front of
them, so a batch job no longer needs a browser.

### Added
- **`cli/pdfkit.mjs`** — twelve commands: `info`, `text`, `merge`, `split`, `rotate`, `delete`,
  `order`, `watermark`, `number`, `meta`, `labels`, `impose`. It loads **pdf.js and pdf-lib from
  `vendor/`**, the exact bytes the page inlines, so the two shells cannot disagree about what a
  rotation is. No new dependencies, no network.
- **`-` and `-o -`** for stdin and stdout, `--json` for machines (prose moves to stderr so the pipe
  stays parseable), `--quiet`, and honest exit codes: `0` done, `1` failed, `2` usage.
- **`--locale`** — the `{date}` token and the numbers in `info` come from `Intl`, which *is* CLDR,
  compiled into the runtime. Nothing is vendored for locale data; `cli/README.md` says why, and
  what would change that.
- **`cli/test/run.py`** — 37 checks that read every written file back with PyMuPDF instead of
  trusting the CLI's own report: page counts, rotation values, text present and absent, the
  `/PageLabels` tree, sheet sizes, JSON purity, exit codes.
- **A `cli` CI job** — runs the suite, packages `pdfkit-cli-<version>.tar.gz` (cli + vendor +
  licence), uploads it as an artifact, and attaches it to the rolling `app-latest` release on main.

### Not included, deliberately
- **Rasterising** — pages to PNG, compress-by-rendering, redaction rebuild, OCR. All four need a
  canvas or a WASM engine that Node does not have without a native module. The help text and the
  README say so plainly rather than failing halfway through a job.

### Checked, and not adopted
- **CLDR (the tray launcher, `drsamonline/CLDR`)** was evaluated as a front door. It works — `alias.pdf
  = /run x-terminal-emulator -e pdfkit` — but its `/run` spawns detached with stdout discarded, so it
  can start a job and cannot show the answer. The recipe and that limitation are written down in
  `cli/README.md` rather than left to be discovered.

### Verified
- `python3 cli/test/run.py` — 37/37. `python3 tools/test/run_all.py` — all twelve app suites green.

## [1.15.0] — 2026-11-02

The front door. Nothing new to do with a PDF — everything about the first ten seconds, which were
the worst part of the app: the empty state was a paragraph of apology and the tools were 26
collapsed sections in a sidebar.

### Added
- **A launcher in place of the empty state.** A hero card you can drop a file on, the four tools a
  report actually needs in one tap (Merge, Compress, Redaction, Extract text), a "more tools" row,
  and the session list. The workspace below it is untouched — the moment a document opens, the
  launcher steps aside and the app is exactly what it was.
- **One catalogue, in data.** `pipeline/app_launcher.js` holds every tool as a record — category,
  icon, one-line blurb, and the sidebar panel it opens. The launcher, the all-tools sheet and the
  category dot beside each sidebar section all read from it. A tool's *name* is read from its own
  panel summary, so the sheet cannot drift from the sidebar, and it follows the interface language
  for free.
- **An all-tools sheet** — 27 tools grouped Edit / Optimize / Secure / Convert / Trust, with search,
  reachable from the launcher or the row under it.
- **A cold start that does not dead-end.** Choosing a tool with no document loaded asks for the file
  and then opens that tool by itself, instead of opening a panel whose controls cannot do anything.
- **The session list.** Every file the app writes is one line on the launcher — name, the tool that
  made it, the size — held in `sessionStorage`, so it is gone when the tab is, and **the bytes are
  never kept**. It is a memory of what you just did, not a store of what you did it to.
- **Category tints** — rose for Edit, amber for Optimize, indigo for Secure, teal for Convert, grey
  for Trust — on the cards and as a dot on each sidebar section. The brand accent stays blue, so
  every control the user presses is still the app's own colour.
- **27 icons drawn inline**, in a 20×20 stroke set, so the app keeps its 0-request promise.

### Changed
- The page bar hides its twelve disabled buttons until there are pages, keeping only its label and —
  while a job runs — Cancel.
- **A spacing pass over the whole shell.** The first cut had every border sitting on its contents:
  card padding 14 → 17 px, grid gaps 10 → 13–15 px, sidebar rows 11 → 14 px, page-bar and header
  padding up, section margins 12 → 14 px, and one card radius (12 px) shared by page tiles, sidebar
  panels and tool cards instead of three different ones.
- The shell-size budget moved from 150 KB to 160 KB **deliberately, for this**: a new interface
  surface, not an engine drifting back inline. A second ceiling was added at 52 KB gzipped, which is
  what a reader on a phone actually pays, and which is the tighter of the two.

### Not taken, from the app this was read against
PaperKnife (`potatameister/PaperKnife`, `PaperKnifePlus`) was the reference for the structure: a
tool-first entry, one catalogue, a category per family, a session list. **No code was copied — it is
AGPL-3.0/GPL-3.0 and this app is PolyForm Noncommercial, so a copied fragment would make the
combination undistributable.** Not adopted, with reasons: their webfont (breaks `default-src 'self'`
and the 0-external-requests badge), React + Tailwind (this is one file with no build step), and a
five-item bottom nav (the workspace already has a keyboard/ARIA grid that a new nav bar would
compete with; deferred rather than rushed).

### Verified
- A new suite, `tools/test/test_app12.py` — 24 checks: the launcher draws four core tools with their
  categories; the catalogue covers all 24 panels and its names match the sidebar's own summaries;
  the sheet lists 27 tools, groups them, and searches down to one; a tool chosen cold asks for a file
  and then opens itself; a saved file lands in the session list with its tool and size, in
  `sessionStorage` and with no bytes; clear empties it.
- All twelve suites green (15 + 11 + 7 + 24 + 16 + 9 + 12 + 6 + 7 + 6 + 5 + 6 = 124 checks).

## [1.14.0] — 2026-11-02

The three items the roadmap called cheap. Nothing left on that list now.

### Added
- **Page labels** — the numbers a reader *sees*, which need not be the numbers the file counts. Set
  the front matter to i, ii, iii and the body to start at 1, and the app writes the `/PageLabels`
  number tree the reader honours. Verified by reading the labels back with an independent library:
  `['i', 'ii', '1', '2']`.
- **Labelled-identifier redaction** — one pattern for the shapes that carry their own name: `MRN`,
  `UHID`, `OPD`, `IPD`, `MR`, `Policy`, followed by a value. It is deliberately anchored on the label
  rather than guessing at digit counts, and it is checked not to fire on ordinary prose.
- **An About panel inside the app** — the running version and the newest changelog points, inlined by
  the build from `CHANGELOG.md`, so the app and its release notes cannot disagree.

### Also
- `build_pdf.py` gained `changelog_json()`, the sibling of the landing page's `whats_new()`: same
  reading, one for the page and one for the app.

### Verified
- 7 new checks: the About panel lists the changes and the right version; a labelled file is written
  and the labels read back as i, ii, 1, 2; the labelled-ID pattern matches three identifiers in a
  line and nothing in ordinary prose.
- All eleven suites green (15 + 11 + 7 + 16 + 9 + 12 + 6 + 7 + 6 + 5 + 6 checks).

## [1.13.0] — 2026-11-02

A polish release: nothing new to learn, three things that were slightly wrong.

### Added
- **A "what's new" band on the landing page**, filled at build time from the top section of
  `CHANGELOG.md`. The page cannot claim a version the changelog does not have, and shipping a release
  updates it for free.
- **A skip link** and a visible **`:focus-visible` ring** — the two cheapest accessibility wins the
  app was missing. The ring is on the accent colour, so it is visible against both the dark panels
  and the paper-white page canvas.

### Changed
- **The writer is prefetched** as soon as a document is open. pdf-lib used to arrive at the moment
  Save was pressed, which is the worst moment to wait; now it is already there.
- **`ENHANCEMENTS.md` rewritten** to say what is true: a shipped table from 1.2.0 to 1.13.0, the
  open items split into cheap and not cheap, the refusals with their evidence, and the ziptastic
  analysis in one place.

### Verified
- All ten suites green (15 + 11 + 16 + 9 + 12 + 6 + 7 + 6 + 5 + 6 checks), the landing page on both
  deployments, and the kit's parity check.

## [1.12.0] — 2026-11-02

### Added
- **The test suites now live in the repo and run in CI.** Ten suites, 93 checks, driving the real
  page in a real browser over the DevTools protocol — `tools/test/`, one entry point
  (`run_all.py`), a `browser-tests` job on every push and PR. They check what a user gets, not a
  model of it, and they no longer exist only on the machine that wrote them.
- **Split by bookmark.** Top-level outline entries become page ranges, resolved through pdf.js's
  destination table; each becomes its own file. It picks the document the selection came from, then
  the first one that actually has bookmarks — and says which of the two reasons it stopped for.
- **Compare two documents** by their text: which pages differ, and the first line that differs, with
  a `compare.txt` report. It compares text, not appearance — a re-scan of the same letter will look
  completely different and the panel says so.
- **A remembered signature**, behind an explicit checkbox, with the warning in the panel that it is
  stored unencrypted in this browser's local storage.
- **Two more redaction patterns**: dates and IFSC codes, alongside 12-digit numbers, phones, emails
  and PAN.

### Also
- `tools/make_samples.py` gains `sample-outline.pdf`, four pages with a bookmark each — the fixture
  the split test needs, and the only shipped sample with an outline.

## [1.11.0] — 2026-11-02

### Added
- **A password-protected PDF can be opened and edited.** The loader asks for the password instead of
  failing, and remembers it for the writer. If you save without setting a new password, **the old
  one is kept** — handing back an unprotected copy of a protected document is the kind of surprise
  that ends up in the wrong inbox, so the toast says `protected (kept from the source)`.
- **Redaction by shape**, on top of redaction by word: 12-digit numbers (Aadhaar-style, with or
  without spaces), Indian mobile numbers with an optional `+91`, email addresses, and PAN. The panel
  says plainly that a pattern is a helper and not a guarantee — it sees text this app can read, and
  nothing inside a picture.
- **`SHA256SUMS` on every release**, computed from the published artefacts by a new CI job, so a
  download can be verified without trusting the network.

### Verified
- 6 new browser checks: a protected PDF is built, refusing the password loads nothing (and does not
  crash), the right password opens it, the password is kept for the writer, a protected file can be
  edited and re-saved — and the saved copy still needs its password — plus a pattern-redaction run
  whose output contains none of the identifiers it was given.
- Every produced PDF inspected with PyMuPDF: the redacted page carries no text at all, and the
  re-saved protected file reports `needs_pass`.

## [1.10.0] — 2026-11-02

### Added
- **Share locked.** Wrap the finished PDF in a single `.html` file that asks for a PIN before it
  opens — AES-256-GCM, PBKDF2-SHA256 at 250,000 rounds, a fresh salt and IV per file. The container
  is the one **LockHTML** (this estate's own tool, same licence) writes: `v:2`, `kdf:"pbkdf2"`,
  `kdfparams:{iter}`, `salt`, `iv`, `ct` in a `<script id="payload">` block. A file locked here opens
  in LockHTML's viewer and the reverse — checked against *their* template, not mine, in the suite.
  Optional one-time view, enforced by `localStorage` and therefore one-time on that browser, not on
  the planet. The plaintext never leaves the tab.
- **The page grid is now usable without a mouse.** It is a `listbox` of `option` tiles with one
  roving tabindex, arrow keys move between pages, space selects, and every tile carries a "Page N"
  label for a screen reader.

### Removed, with the evidence in `ENHANCEMENTS.md`
- **A Repair button.** qpdf looks like it should rebuild a damaged PDF; in this build it refuses the
  two cases the button would exist for — `xref not found` when `startxref` points at the wrong
  offset, `can't find startxref` when the tail is truncated, and `--ignore-xref-streams` does not
  help. It was written, tested, and taken out rather than shipped greyed out with an apology.

### Added to the pipeline
- **A shell size budget in CI.** `app.html` fails the build above 150 KB, so the 118 KB win from
  1.9.0 cannot be quietly lost by inlining a library again.

### Verified
- 11 new browser checks: the locked file is produced and its payload matches LockHTML's shape, the
  plaintext is not in it, a wrong PIN is refused, the right one opens it, **LockHTML's own viewer
  opens it too**, and the grid exposes listbox/option/roving-tabindex/arrow-keys/space correctly.
- All eight suites green (15 + 16 + 9 + 12 + 6 + 7 + 6 + 5 checks) and the landing page on both
  deployments.

## [1.9.1] — 2026-11-02

### Added
- **Two more sample documents, both shipped and reproducible.** `sample-photo.pdf` is a page whose
  bytes are almost entirely one JPEG; `sample-uncompressed.pdf` is three pages written with the
  streams left uncompressed. Together they are the two halves of the compression story: on the first,
  a lossless pass has nothing to win (**0.1%** measured); on the second it does (**9%**). Both are
  generated by `tools/make_samples.py`, so they can be rebuilt rather than trusted, and the test
  suites now read them instead of inventing throwaway fixtures.

The picture in `sample-photo.pdf` is a synthetic colour grid — a test pattern, not a photograph, so
no real person or place is implied by a sample that carries a "not real patient data" line.

## [1.9.0] — 2026-11-01

The release where the app stops downloading itself before it can say hello.

### Changed
- **First load is 118 KB instead of 2,093 KB.** The three engines — pdf.js, pdf-lib and the 1 MB
  pdf.js worker — used to be inlined in the HTML, so every visit transferred 654 KB gzipped before
  anything could be typed into. They now live in `docs/play/lib/` and load when they are needed:
  pdf.js when a document is opened, pdf-lib when one is written. A first visit transfers **118 KB**
  and paints in about 0.7 s; opening a document fetches the parser; saving fetches the writer.
- **The worker is a real file again.** It used to be a `<script type="text/plain">` block turned
  into a blob URL on every load, which meant 1 MB of HTML text was parsed as markup before it could
  be parsed as JavaScript. It is now a normal script the browser caches and the service worker
  precaches, so the second visit does not fetch it at all.
- **The OCR panel says what it is about to load** — about 10 MB, two WASM cores and the English
  data, from beside the page, not from the internet — and that it is only read when the button is
  pressed. That is why opening the app stays instant.
- **The service worker precaches the engines**, so "works offline after the first load" stays true
  without blocking the first paint.

### Fixed
- Three 404s per engine load, from a path probe that guessed at `lib/` before trying the right
  place, and from the service worker precaching `./lib/…` from a scope where that path does not
  exist.

### Also
- The lossless qpdf pass now adds `--remove-unreferenced-resources=yes`.
- `ENHANCEMENTS.md` carries a written analysis of what `ziptastic`'s PDF pipeline does, why an
  archival container cannot be used here, and what its benchmarks confirm about this app's numbers.

### Verified
- First-load transfer measured in the browser: 118.3 KB, no engines fetched until a document is
  opened, thumbnails still drawn, every suite green (15 + 16 + 9 + 12 + 6 + 7 checks), the landing
  page on both deployments, and the kit's parity check.

## [1.8.0] — 2026-11-01

### Added
- **A whole folder at once.** *Process a folder…* asks the browser for a directory (the File System
  Access API), runs the tools you have set up over every PDF in it, and writes the results into an
  `out` folder beside them. Non-PDF files are skipped, one bad file does not stop the rest, the run
  reports `3 files written to out/ · 10 KB → 9 KB`, and your workspace is exactly as you left it
  afterwards. Chrome, Edge and Android Chrome only; where the API is missing the button says so
  instead of failing when pressed.
- **Compression now works on the original bytes when it can.** If the only thing asked for is
  compression — one file, original page order, no watermark, numbering, crop or metadata — qpdf runs
  on the file you handed over rather than on a pdf-lib rebuild that may itself be larger than the
  original. That is the difference between a folder run that shrinks 10 KB to 9 KB and one that
  grows it to 14 KB.

### Changed
- **The build yields every 25 pages and honours Cancel.** Copying a large document into the output
  used to be one long uninterruptible loop; it now lets the page breathe and can be stopped.

### Not done, and why
- **`OffscreenCanvas` for thumbnails.** On the main thread it does not move any work off the thread —
  the rendering still happens where the canvas is — so it would have been a change that looks like an
  optimisation and is not one. The yielding above is what actually keeps the interface alive.
- **Streaming saves.** pdf-lib builds the whole output in memory; there is no incremental writer to
  stream through. The honest options are a different engine or accepting the memory ceiling, and the
  app warns at 150 MB rather than pretending.

### Verified
- 7 new browser checks with the File System Access API mocked by an in-memory directory (headless
  Chrome cannot drive a real picker): one output per PDF with text files skipped, write access asked
  for, the workspace restored, the result line reported, a compression-only run that does not
  inflate, and a clear message when the API is absent.
- The 1.3–1.7 suites (14 + 16 + 9 + 12 + 6 checks) and the landing page on both deployments still
  pass.

## [1.7.0] — 2026-11-01

### Added
- **Lossless compression, with qpdf.** The third mode in the Compress panel runs the real qpdf —
  as WebAssembly, in a worker, from `docs/play/qpdf/` — with
  `--object-streams=generate --recompress-flate --compression-level=9`. It rewrites object streams
  and re-flates the ones that are not already compressed. Nothing is rasterised, no text is thrown
  away, and if the result is not smaller the app keeps the original and says so.
- `tools/fetch_qpdf.py` fetches the runtime once and verifies it against `SHA256SUMS`.

### Why this engine and not Ghostscript
qpdf is **Apache-2.0** and the `qpdf-run` wrapper that packages it for the browser is **MIT**.
Neither is copyleft, so bundling them does not change this app's licence — which is exactly why the
README has always refused Ghostscript, PyMuPDF and CoherentPDF. `THIRD-PARTY-NOTICES.md` now carries
both licences, and the in-app credits list them.

### Honest expectations
On the test document (34,123 bytes, written uncompressed) qpdf produced 31,160 bytes — 91%. Most of
those bytes are the embedded font, which is already compressed, so the ceiling here is modest. On a
badly generated file the saving is larger; on a well-made one it is a few percent. What it never does
is make the file worse, and it never makes the text unselectable.

### Fixed
- The lossless path returned bytes where `save()` still expected a document, so the later
  `doc.save()` threw and nothing was produced. The mode now ends with its own download.
- qpdf cannot run on an encrypted file, so *lossless + a password* silently fell back to a plain
  protected save. It still does — but the result line now says
  `lossless skipped: it cannot run on an encrypted file` instead of leaving you to notice.

### Verified
- 6 new browser checks: the lossless pass produces a file, never grows it, names itself, runs with
  **0 external requests**, refuses to pretend when a password is also set, and leaves the ordinary
  path working.
- Every produced PDF inspected with PyMuPDF: 3 pages, the heading and the body lines still
  extractable as text after the qpdf pass.
- The 1.3–1.6 suites (14 + 16 + 9 + 12 checks) and the landing page on both deployments still pass.

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
