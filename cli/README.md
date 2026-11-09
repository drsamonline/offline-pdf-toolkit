# pdfkit — the same engines, in a terminal

The app is one HTML file with pdf.js and pdf-lib inlined. This is **the same two libraries**, loaded
from `vendor/`, driven from a shell. Nothing is re-implemented: a file merged here and a file merged
in the app are written by the same writer, so the two shells cannot disagree about what "rotate 90"
means.

```
node cli/pdfkit.mjs help
```

Node 18+. No dependencies beyond the two files already in `vendor/`. No network, ever.

## Quick start

```sh
node cli/pdfkit.mjs info  report.pdf
node cli/pdfkit.mjs text  report.pdf --pages 1-3
node cli/pdfkit.mjs merge a.pdf b.pdf -o merged.pdf
node cli/pdfkit.mjs split merged.pdf --every 10 -o chunk
node cli/pdfkit.mjs rotate merged.pdf --right --pages 1,4 -o turned.pdf
node cli/pdfkit.mjs watermark merged.pdf --text CONFIDENTIAL --opacity .12 -o marked.pdf
node cli/pdfkit.mjs number merged.pdf --format "{n} / {total}" -o numbered.pdf
node cli/pdfkit.mjs meta merged.pdf --title "Discharge summary" --author "Dr Sohil Momin" -o out.pdf
node cli/pdfkit.mjs labels merged.pdf --front 2 --style roman -o labelled.pdf
node cli/pdfkit.mjs impose merged.pdf --booklet -o booklet.pdf
```

Put it on your PATH once and the rest is short:

```sh
ln -s "$PWD/cli/pdfkit.mjs" ~/.local/bin/pdfkit    # the shebang does the rest
pdfkit info report.pdf
```

## Commands

| | |
|---|---|
| `info` | Pages, size, page dimensions, metadata — as text or `--json`. |
| `text` | The text layer, page by page, with line breaks kept. |
| `merge` | Concatenate in the order given. Nothing is re-encoded. |
| `split` | `--ranges 1-3,5` · `--every N` · `--each`. `-o` sets the name prefix. |
| `rotate` | `--angle 90` or `--left` / `--right`, for `--pages` or the whole file. |
| `delete` | Drop `--pages`, keep the rest. |
| `order` | Rearrange: `--pages 3,1,2`. Pages left out are dropped; repeats duplicate. |
| `watermark` | Text, size, opacity, angle, position, colour, `--tiled`. |
| `number` | Tokens `{n}` `{total}` `{date}` `{file}`, six positions, `--start`, `--locale`. |
| `meta` | Read, set, or `--strip` the document properties. |
| `labels` | The numbers a reader *sees*: `i, ii` for front matter, then `1, 2`. |
| `impose` | 2-up, 4-up, or saddle-stitch booklet on A4 landscape sheets. |

Everywhere: `-o <file>` writes there, `-o -` writes to **stdout**, `-` reads **stdin**, `--json` for
machines (prose goes to stderr so the pipe stays parseable), `--quiet` for scripts.

```sh
cat report.pdf | pdfkit info - --json | jq .pages
pdfkit merge a.pdf b.pdf -o - > merged.pdf
pdfkit split big.pdf --each --json | jq -r '.files[]'
```

Exit codes: `0` done · `1` failed (bad file, engine missing) · `2` usage.

A page selection that lands on no page — `--pages 90-100` in a six-page file — is a usage error,
not a silent no-op: `delete` and `rotate` used to report success and write the file unchanged, and
`order` and `split --ranges` wrote a document with no pages. A range that only runs off the end still
clamps (`--pages 1-99` means "to the end"), the way `head -n` does.

## What it does not do, and why

Rendering a page to pixels needs a canvas; Node has none without a native module, and this CLI adds
no dependencies. So four things stay in the app:

- **Pages → PNG**, **compress by rasterising**, **redaction rebuild**, **OCR**.

It also will not decrypt a password-protected file: it refuses one rather than writing a merge of
ciphertext that still opens. Use the app's *Unlock*, or `qpdf --decrypt`.

Everything else — the whole structural and annotation surface — is here, because pdf-lib does it
without pixels. If you need those four from a terminal, drive the app in a headless browser; that is
the honest boundary, and the help text says so rather than failing halfway.

## Locale: CLDR is already in the runtime

`--locale en-IN` (or `PDFKIT_LOCALE`) changes the `{date}` token and the numbers `info` prints. That
is **Unicode CLDR data, via `Intl`** — the same tables a browser uses, compiled into Node. Nothing is
vendored for it.

Vendoring CLDR was considered and rejected: `cldr-json` is tens of megabytes for the locales we would
actually ship (en, hi, gu), it drifts from the runtime's ICU version, and the CLI would then format
dates differently from the app, which uses the browser's `Intl`. One source, no bytes.

What we do instead: use `Intl`, and pin the behaviour with a test that asserts the date token lands on
the page (see `cli/test/run.py`). If a future release needs byte-identical output across machines,
pin the Node major version in CI — that is cheaper than owning a copy of CLDR.

## From a launcher: CLDR

[CLDR](https://github.com/drsamonline/CLDR) — *Command Line Dispatch & Route*, the tray launcher — is
a natural front door for this CLI, with one caveat worth knowing before wiring it up.

CLDR's `/run` spawns a binary **detached, through the OS shell, with stdout discarded**
(`(cmdline) >/dev/null 2>&1 &` in `src/engine.rs`). So:

- ✅ **It can start a job**, and globs expand because a real shell does the work.
- ❌ **It cannot show you the result** — `pdfkit info` run this way prints into `/dev/null`.

Two aliases that work, in `~/.config/cldr/config.toml`:

```toml
# Linux — a terminal opens, so you can see what pdfkit says
alias.pdf = /run x-terminal-emulator -e pdfkit

# Windows — same idea with cmd
alias.pdf = /run cmd /k pdfkit
```

Then `pdf info report.pdf` in the CLDR window opens a terminal on the answer, and
`pdf merge *.pdf -o merged.pdf` does the work. For the **GUI**, `/open` on `app.html` is the useful
pairing: CLDR becomes the keystroke that opens the app.

Nothing is shared between the two projects beyond that — no dependency, no code, no build coupling.
The CLI is a normal PATH binary; CLDR is a launcher that runs PATH binaries. That is the whole
integration, and it is the right size for both.

## Tests

```sh
python3 cli/test/run.py        # 44 checks; needs node and pymupdf
```

Every check reads the written file back with an independent library rather than trusting the CLI's
own report: page counts, rotation values, the text that should and should not be there, the label
tree, sheet sizes, and that `--json` stays parseable.
