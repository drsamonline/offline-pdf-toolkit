#!/usr/bin/env node
/* =====================================================================
   pdfkit — the same engines, without the browser.

   The web app is one HTML file with pdf.js and pdf-lib inlined; this is
   the same two libraries, loaded from vendor/, driven from a terminal.
   Nothing is re-implemented: a file merged here and a file merged in the
   app are written by the same writer, so the two shells cannot disagree
   about what "rotate 90" means.

   No dependencies beyond those two files. No network. Node 18+.

     node cli/pdfkit.mjs help

   Exit codes: 0 done · 1 failed · 2 usage.

   The one place this leans on the platform rather than on a library is
   locale: {date} tokens and the numbers in `info` are formatted by
   Intl, which is CLDR data compiled into the runtime. Nothing is
   vendored for it — see cli/README.md.
   ===================================================================== */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const VENDOR_DIRS = [path.join(ROOT, 'vendor'), path.join(HERE, 'vendor')];
const VERSION = (() => {
  try { return fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim(); } catch { return 'dev'; }
})();

/* ---------- engines ---------- */
let LIB = null, PDFJS = null;

function vendorFile(name) {
  for (const d of VENDOR_DIRS) {
    const p = path.join(d, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function lib() {
  if (LIB) return LIB;
  const p = vendorFile('cantoo-pdf-lib.min.js') || vendorFile('pdf-lib.min.js');
  if (!p) die('pdf-lib is not beside this file — run: python3 pipeline/vendor_libs.py', 1);
  // the vendored build is UMD; require() takes its CommonJS branch
  LIB = createRequire(import.meta.url)(p);
  return LIB;
}

async function pdfjs() {
  if (PDFJS) return PDFJS;
  const p = vendorFile('pdf.min.js');
  if (!p) die('pdf.js is not beside this file — run: python3 pipeline/vendor_libs.py', 1);
  // pdf.js is a browser build: it wants a window to hang its globals on
  globalThis.window = globalThis;
  globalThis.navigator = globalThis.navigator || { userAgent: 'node' };
  await import(p);
  PDFJS = globalThis.pdfjsLib;
  const w = vendorFile('pdf.worker.min.js');
  if (w) PDFJS.GlobalWorkerOptions.workerSrc = w;
  return PDFJS;
}

/* ---------- talking to a human, or to a script ---------- */
let FLAGS = {};
// a pipe that closes early (| head) is not an error
process.stdout.on('error', (e) => { if (e && e.code === 'EPIPE') process.exit(0); });
// --json owns stdout: prose goes to stderr so a pipe stays parseable
const say = (m) => {
  if (FLAGS.quiet) return;
  (FLAGS.json ? process.stderr : process.stdout).write(m + '\n');
};
const warn = (m) => process.stderr.write('pdfkit: ' + m + '\n');

function die(m, code = 2) {
  process.stderr.write('pdfkit: ' + m + '\n');
  process.exit(code);
}

function result(obj) {
  if (FLAGS.json) process.stdout.write(JSON.stringify(obj, null, 2) + '\n');
  return obj;
}

/* ---------- argument parsing ----------
   --key value · --key=value · --flag · -o value · - for stdin/stdout */
function parseArgs(argv) {
  const out = { _: [], f: {} };
  const takesValue = new Set(['o', 'out', 'pages', 'ranges', 'every', 'angle', 'text', 'size', 'opacity',
    'position', 'colour', 'color', 'format', 'start', 'title', 'author', 'subject', 'keywords',
    'creator', 'producer', 'front', 'style', 'nup', 'gap', 'locale', 'prefix']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { out._.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const k = (eq > 0 ? a.slice(2, eq) : a.slice(2)).toLowerCase();
      if (eq > 0) out.f[k] = a.slice(eq + 1);
      else if (takesValue.has(k)) out.f[k] = argv[++i];
      else out.f[k] = true;
    } else if (a === '-o') out.f.out = argv[++i];
    else if (a.startsWith('-') && a !== '-') out.f[a.slice(1).toLowerCase()] = true;
    else out._.push(a);
  }
  return out;
}

/* ---------- page selections ----------
   "1-3,5" → [1,2,3,5]; "all" and "" → every page; 1-based in, 0-based out. */
function pick(spec, total, { sorted = true } = {}) {
  if (!spec || spec === 'all') return [...Array(total).keys()];
  const idx = [];
  for (const part of String(spec).split(',')) {
    const s = part.trim();
    if (!s) continue;
    const m = s.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      let a = +m[1], b = +m[2];
      if (a > b) [a, b] = [b, a];
      for (let i = a; i <= b; i++) if (i >= 1 && i <= total) idx.push(i - 1);
    } else if (/^\d+$/.test(s)) {
      const i = +s;
      if (i < 1 || i > total) die(`page ${i} is not in this document (it has ${total})`, 2);
      idx.push(i - 1);
    } else {
      die(`"${s}" is not a page or a range like 1-3`, 2);
    }
  }
  const uniq = [...new Set(idx)];
  return sorted ? uniq.sort((a, b) => a - b) : uniq;
}

/* ---------- io ---------- */
function readIn(p) {
  if (!p || p === '-') {
    try { return new Uint8Array(fs.readFileSync(0)); } catch { die('nothing on stdin', 2); }
  }
  if (!fs.existsSync(p)) die(`no such file: ${p}`, 2);
  return new Uint8Array(fs.readFileSync(p));
}

function writeOut(bytes, dest, fallbackName) {
  const target = dest || fallbackName;
  if (!target || target === '-') { process.stdout.write(Buffer.from(bytes)); return '-'; }
  fs.mkdirSync(path.dirname(path.resolve(target)), { recursive: true });
  fs.writeFileSync(target, Buffer.from(bytes));
  return target;
}

async function open(bytes) {
  try { return await lib().PDFDocument.load(bytes, { ignoreEncryption: true }); }
  catch (e) { die('this file did not open as a PDF — ' + (e.message || e), 1); }
}

const save = async (doc) => {
  doc.setProducer(doc.getProducer() || 'Offline PDF Toolkit (pdfkit)');
  doc.setModificationDate(new Date());
  return doc.save();
};

/* ---------- locale ----------
   Intl is CLDR: the grouping a Hindi reader expects (1,00,000), the month names,
   the date order. No table is shipped here; the runtime already has one. */
function loc() { return FLAGS.locale || process.env.PDFKIT_LOCALE || undefined; }
const fmtNum = (n) => new Intl.NumberFormat(loc()).format(n);
const fmtDate = (d = new Date()) => new Intl.DateTimeFormat(loc(), { dateStyle: 'medium' }).format(d);

/* =====================================================================
   commands
   ===================================================================== */

const CMD = {};

/* ---- info ---- */
CMD.info = {
  usage: 'info <in.pdf>',
  about: 'Pages, size, page dimensions and the metadata, as text or --json.',
  async run({ _: [input] }) {
    const bytes = readIn(input);
    const doc = await open(bytes);
    const pages = doc.getPages();
    const dims = pages.slice(0, 5).map((p, i) => {
      const { width, height } = p.getSize();
      return { page: i + 1, width: Math.round(width), height: Math.round(height) };
    });
    const info = {
      file: input && input !== '-' ? path.basename(input) : '(stdin)',
      version: VERSION,
      pages: pages.length,
      bytes: bytes.length,
      size: humanBytes(bytes.length),
      title: doc.getTitle() || null,
      author: doc.getAuthor() || null,
      subject: doc.getSubject() || null,
      keywords: doc.getKeywords() || null,
      creator: doc.getCreator() || null,
      producer: doc.getProducer() || null,
      pageSizes: dims,
    };
    if (FLAGS.json) return result(info);
    say(`${info.file} · ${fmtNum(info.pages)} page${info.pages === 1 ? '' : 's'} · ${info.size}`);
    for (const d of dims) say(`  page ${d.page}: ${d.width} × ${d.height} pt`);
    if (pages.length > dims.length) say(`  … ${pages.length - dims.length} more`);
    for (const k of ['title', 'author', 'subject', 'keywords', 'creator', 'producer']) {
      if (info[k]) say(`  ${k}: ${info[k]}`);
    }
    return info;
  },
};

function humanBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1048576).toFixed(1) + ' MB';
}

/* ---- text ---- */
CMD.text = {
  usage: 'text <in.pdf> [--pages 1-3] [-o out.txt] [--json]',
  about: 'The text layer, page by page. Scans have none — the app does OCR, this does not.',
  async run({ _: [input], f }) {
    const bytes = readIn(input);
    const lib2 = await pdfjs();
    const doc = await lib2.getDocument({ data: bytes, isEvalSupported: false, verbosity: 0 }).promise;
    const wanted = pick(f.pages, doc.numPages);
    const out = [];
    for (const i of wanted) {
      const page = await doc.getPage(i + 1);
      const content = await page.getTextContent();
      // hasEOL is where the line ends: joining on it keeps a table readable
      out.push({ page: i + 1, text: content.items.map((it) => it.str + (it.hasEOL ? '\n' : '')).join('').replace(/\s+$/g, '') });
    }
    const chars = out.reduce((a, p) => a + p.text.length, 0);
    if (FLAGS.json) return result({ pages: out.length, chars, text: out });
    const body = out.map((p) => (out.length > 1 ? `--- page ${p.page} ---\n` : '') + p.text).join('\n\n');
    if (f.out) { const t = writeOut(Buffer.from(body + '\n', 'utf8'), f.out); say(`${fmtNum(chars)} characters → ${t}`); }
    else process.stdout.write(body + '\n');
    return { pages: out.length, chars };
  },
};

/* ---- merge ---- */
CMD.merge = {
  usage: 'merge <a.pdf> <b.pdf> … [-o out.pdf]',
  about: 'Concatenate in the order given. Nothing is re-encoded.',
  async run({ _: inputs, f }) {
    if (inputs.length < 2) die('merge needs at least two files', 2);
    const { PDFDocument } = lib();
    const out = await PDFDocument.create();
    let pages = 0;
    for (const p of inputs) {
      const src = await open(readIn(p));
      const copied = await out.copyPages(src, src.getPageIndices());
      copied.forEach((pg) => out.addPage(pg));
      pages += copied.length;
      warn(`+ ${path.basename(p)} (${copied.length})`);
    }
    const dest = writeOut(await save(out), f.out, 'merged.pdf');
    say(`merged ${inputs.length} files · ${fmtNum(pages)} pages → ${dest}`);
    return result({ out: dest, files: inputs.length, pages });
  },
};

/* ---- split ---- */
CMD.split = {
  usage: 'split <in.pdf> (--ranges 1-3,5 | --every N | --each) [-o prefix]',
  about: 'One file per range, per chunk, or per page. -o sets the name prefix.',
  async run({ _: [input], f }) {
    const bytes = readIn(input);
    const { PDFDocument } = lib();
    const src = await open(bytes);
    const total = src.getPageCount();
    const base = (f.out || f.prefix || (input === '-' ? 'split' : path.basename(input).replace(/\.pdf$/i, ''))).replace(/\.pdf$/i, '');
    const groups = [];
    if (f.each) { for (let i = 0; i < total; i++) groups.push([i]); }
    else if (f.every) {
      const n = Math.max(1, parseInt(f.every, 10) || 1);
      for (let i = 0; i < total; i += n) groups.push([...Array(Math.min(n, total - i)).keys()].map((k) => i + k));
    } else if (f.ranges) {
      for (const part of String(f.ranges).split(',')) if (part.trim()) groups.push(pick(part, total));
    } else die('say how to split: --ranges 1-3,5 · --every 10 · --each', 2);

    const written = [];
    for (let g = 0; g < groups.length; g++) {
      const doc = await PDFDocument.create();
      const copied = await doc.copyPages(src, groups[g]);
      copied.forEach((pg) => doc.addPage(pg));
      const name = `${base}-${String(g + 1).padStart(String(groups.length).length, '0')}.pdf`;
      written.push(writeOut(await save(doc), name));
    }
    say(`${fmtNum(written.length)} file${written.length === 1 ? '' : 's'} from ${fmtNum(total)} pages`);
    for (const w of written) say('  ' + w);
    return result({ files: written });
  },
};

/* ---- page surgery: rotate, delete, order ---- */
CMD.rotate = {
  usage: 'rotate <in.pdf> (--angle 90|180|270 | --left | --right) [--pages 1,3-4] [-o out.pdf]',
  about: 'Turn pages. The content is untouched — the page box carries the angle.',
  async run({ _: [input], f }) {
    const { degrees } = lib();
    const doc = await open(readIn(input));
    const total = doc.getPageCount();
    const idx = pick(f.pages, total);
    let delta = f.angle ? parseInt(f.angle, 10) : f.left ? -90 : f.right ? 90 : 0;
    if (!delta) die('say which way: --angle 90 · --left · --right', 2);
    if (delta % 90 !== 0) die('an angle has to be a multiple of 90', 2);
    const pages = doc.getPages();
    for (const i of idx) {
      const p = pages[i];
      const now = ((p.getRotation().angle || 0) % 360 + 360) % 360;
      p.setRotation(degrees(((now + delta) % 360 + 360) % 360));
    }
    const dest = writeOut(await save(doc), f.out, 'rotated.pdf');
    say(`rotated ${fmtNum(idx.length)} of ${fmtNum(total)} pages by ${delta}° → ${dest}`);
    return result({ out: dest, pages: idx.length, angle: delta });
  },
};

CMD.delete = {
  usage: 'delete <in.pdf> --pages 2,4-5 [-o out.pdf]',
  about: 'Remove pages and write the rest. The removed pages are gone from the output.',
  async run({ _: [input], f }) {
    if (!f.pages) die('say which pages: --pages 2,4-5', 2);
    const { PDFDocument } = lib();
    const src = await open(readIn(input));
    const total = src.getPageCount();
    const drop = new Set(pick(f.pages, total));
    if (drop.size >= total) die('that would delete every page', 2);
    const keep = src.getPageIndices().filter((i) => !drop.has(i));
    const out = await PDFDocument.create();
    (await out.copyPages(src, keep)).forEach((pg) => out.addPage(pg));
    const dest = writeOut(await save(out), f.out, 'trimmed.pdf');
    say(`removed ${fmtNum(drop.size)} of ${fmtNum(total)} pages · ${fmtNum(keep.length)} left → ${dest}`);
    return result({ out: dest, removed: drop.size, pages: keep.length });
  },
};

CMD.order = {
  usage: 'order <in.pdf> --pages 3,1,2 [-o out.pdf]',
  about: 'Rearrange. Pages you leave out are dropped; repeat one to duplicate it.',
  async run({ _: [input], f }) {
    if (!f.pages) die('say the new order: --pages 3,1,2', 2);
    const { PDFDocument } = lib();
    const src = await open(readIn(input));
    const seq = pick(f.pages, src.getPageCount(), { sorted: false });
    const out = await PDFDocument.create();
    (await out.copyPages(src, seq)).forEach((pg) => out.addPage(pg));
    const dest = writeOut(await save(out), f.out, 'ordered.pdf');
    say(`${fmtNum(seq.length)} pages in the new order → ${dest}`);
    return result({ out: dest, pages: seq.length });
  },
};

/* ---- watermark ---- */
const POS = {
  centre: [0.5, 0.5], center: [0.5, 0.5],
  'top-left': [0.06, 0.94], 'top-centre': [0.5, 0.94], 'top-center': [0.5, 0.94], 'top-right': [0.94, 0.94],
  'bottom-left': [0.06, 0.06], 'bottom-centre': [0.5, 0.06], 'bottom-center': [0.5, 0.06], 'bottom-right': [0.94, 0.06],
};

function hexToRgb(hex, rgb) {
  const h = String(hex || '#888888').replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return rgb(parseInt(n.slice(0, 2), 16) / 255, parseInt(n.slice(2, 4), 16) / 255, parseInt(n.slice(4, 6), 16) / 255);
}

CMD.watermark = {
  usage: 'watermark <in.pdf> --text "DRAFT" [--size 48] [--opacity .18] [--angle 45] [--position centre|top-left|…] [--colour "#888888"] [--tiled] [-o out.pdf]',
  about: 'Draw text over the page. Rotated, half-transparent, over the content — not underneath it.',
  async run({ _: [input], f }) {
    if (!f.text) die('say what to write: --text "CONFIDENTIAL"', 2);
    const { degrees, StandardFonts } = lib();
    const doc = await open(readIn(input));
    const font = await doc.embedFont(StandardFonts.HelveticaBold);
    const size = parseFloat(f.size || 48);
    const opacity = f.opacity == null ? 0.18 : parseFloat(f.opacity);
    const angle = f.angle == null ? 45 : parseFloat(f.angle);
    const colour = hexToRgb(f.colour || f.color, lib().rgb);
    let drawn = 0;
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      const text = String(f.text);
      const tw = font.widthOfTextAtSize(text, size);
      if (f.tiled) {
        const stepX = Math.max(tw + size * 1.5, width / 2), stepY = Math.max(size * 4, height / 5);
        for (let y = stepY * 0.5; y < height; y += stepY) {
          for (let x = -stepX; x < width; x += stepX) {
            page.drawText(text, { x, y, size, font, color: colour, opacity, rotate: degrees(angle) });
            drawn++;
          }
        }
      } else {
        const [fx, fy] = POS[String(f.position || 'centre').toLowerCase()] || POS.centre;
        page.drawText(text, {
          x: width * fx - (fx === 0.5 ? tw / 2 : 0),
          y: height * fy - size / 2,
          size, font, color: colour, opacity, rotate: degrees(angle),
        });
        drawn++;
      }
    }
    const dest = writeOut(await save(doc), f.out, 'watermarked.pdf');
    say(`“${f.text}” on ${fmtNum(drawn)} stamp${drawn === 1 ? '' : 's'} → ${dest}`);
    return result({ out: dest, stamps: drawn });
  },
};

/* ---- page numbers ---- */
CMD.number = {
  usage: 'number <in.pdf> [--format "{n} / {total}"] [--position bottom-centre] [--start 1] [--size 10] [--locale en-IN] [-o out.pdf]',
  about: 'Number the pages. Tokens: {n} {total} {date} {file}. --locale formats the date.',
  async run({ _: [input], f }) {
    const { StandardFonts } = lib();
    const doc = await open(readIn(input));
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const total = doc.getPageCount();
    const start = parseInt(f.start || 1, 10);
    const size = parseFloat(f.size || 10);
    const tpl = f.format || '{n} / {total}';
    const file = input && input !== '-' ? path.basename(input) : '';
    const pages = doc.getPages();
    pages.forEach((page, i) => {
      const { width, height } = page.getSize();
      const text = tpl
        .replace(/\{n\}/g, String(start + i))
        .replace(/\{total\}/g, String(start + total - 1))
        .replace(/\{date\}/g, fmtDate())
        .replace(/\{file\}/g, file);
      const tw = font.widthOfTextAtSize(text, size);
      const [fx, fy] = POS[String(f.position || 'bottom-centre').toLowerCase()] || POS['bottom-centre'];
      page.drawText(text, {
        x: width * fx - (fx === 0.5 ? tw / 2 : 0),
        y: height * fy - size / 2,
        size, font, color: lib().rgb(0.35, 0.35, 0.35),
      });
    });
    const dest = writeOut(await save(doc), f.out, 'numbered.pdf');
    say(`${fmtNum(total)} pages numbered from ${start} → ${dest}`);
    return result({ out: dest, pages: total, start });
  },
};

/* ---- metadata ---- */
CMD.meta = {
  usage: 'meta <in.pdf> [--title … --author … --subject … --keywords … --creator … --producer …] | --strip [-o out.pdf]',
  about: 'Read, write or strip the document properties. With no flags it prints them.',
  async run({ _: [input], f }) {
    const doc = await open(readIn(input));
    const fields = ['title', 'author', 'subject', 'keywords', 'creator', 'producer'];
    const setter = { title: 'setTitle', author: 'setAuthor', subject: 'setSubject', keywords: 'setKeywords', creator: 'setCreator', producer: 'setProducer' };
    const getter = { title: 'getTitle', author: 'getAuthor', subject: 'getSubject', keywords: 'getKeywords', creator: 'getCreator', producer: 'getProducer' };
    const before = Object.fromEntries(fields.map((k) => [k, doc[getter[k]]() || null]));

    if (f.strip) {
      for (const k of fields) doc[setter[k]](k === 'keywords' ? [] : '');
      const dest = writeOut(await save(doc), f.out, 'stripped.pdf');
      say(`metadata stripped → ${dest}`);
      return result({ out: dest, before, after: null });
    }
    const changed = fields.filter((k) => typeof f[k] === 'string');
    if (!changed.length) {
      if (FLAGS.json) return result(before);
      for (const k of fields) say(`${k}: ${before[k] || '—'}`);
      return before;
    }
    for (const k of changed) {
      // keywords are a list, not a string — the app splits on commas the same way
      doc[setter[k]](k === 'keywords' ? f[k].split(',').map((x) => x.trim()).filter(Boolean) : f[k]);
    }
    const dest = writeOut(await save(doc), f.out, 'meta.pdf');
    say(`set ${changed.join(', ')} → ${dest}`);
    return result({ out: dest, before, set: changed });
  },
};

/* ---- page labels ---- */
CMD.labels = {
  usage: 'labels <in.pdf> [--front 2] [--style roman|letters] [-o out.pdf]',
  about: 'The numbers a reader sees: i, ii for the front matter, then 1, 2 for the body.',
  async run({ _: [input], f }) {
    const { PDFName, PDFNumber } = lib();
    const doc = await open(readIn(input));
    const ctx = doc.context;
    const total = doc.getPageCount();
    const front = Math.max(0, Math.min(parseInt(f.front || 0, 10), total));
    const style = (f.style || 'roman').toLowerCase();
    const nums = ctx.obj([]);
    const put = (start, s, st) => {
      nums.push(PDFNumber.of(start));
      const d = { S: PDFName.of(s) };
      if (st != null) d.St = PDFNumber.of(st);
      nums.push(ctx.obj(d));
    };
    if (front === 0) put(0, 'D', 1);
    else {
      put(0, style.startsWith('l') ? 'a' : 'r', 1);
      if (front < total) put(front, 'D', 1);
    }
    doc.catalog.set(PDFName.of('PageLabels'), ctx.obj({ Nums: nums }));
    const dest = writeOut(await save(doc), f.out, 'labelled.pdf');
    say(front ? `front ${front} in ${style}, body from 1 → ${dest}` : `decimal labels from 1 → ${dest}`);
    return result({ out: dest, front, style });
  },
};

/* ---- impose ---- */
CMD.impose = {
  usage: 'impose <in.pdf> [--nup 2|4] [--booklet] [--gap 12] [-o out.pdf]',
  about: 'Lay pages onto A4 landscape sheets — 2-up, 4-up, or saddle-stitch booklet order.',
  async run({ _: [input], f }) {
    const { PDFDocument, rgb } = lib();
    const src = await open(readIn(input));
    const pages = src.getPages();
    const n = pages.length;
    if (!n) die('this document has no pages', 1);
    const W = 841.89, H = 595.28;
    const gap = parseFloat(f.gap || 12);
    const booklet = !!f.booklet;
    const per = booklet ? 2 : f.nup === '4' ? 4 : 2;
    const out = await PDFDocument.create();
    const emb = await out.embedPages(pages);
    const sheets = [];
    if (booklet) {
      const m = Math.ceil(n / 4) * 4;
      for (let s = 0; s < m / 4; s++) {
        sheets.push([m - 1 - 2 * s, 2 * s]);
        sheets.push([2 * s + 1, m - 2 - 2 * s]);
      }
    } else {
      for (let i = 0; i < n; i += per) {
        const s = [];
        for (let j = 0; j < per; j++) s.push(i + j < n ? i + j : -1);
        sheets.push(s);
      }
    }
    const cols = 2, rows = per === 4 ? 2 : 1;
    const cw = (W - gap * (cols + 1)) / cols, ch = (H - gap * (rows + 1)) / rows;
    for (const sheet of sheets) {
      const page = out.addPage([W, H]);
      sheet.forEach((idx, k) => {
        if (idx < 0 || idx >= n) return;
        const col = k % cols, row = Math.floor(k / cols);
        const x = gap + col * (cw + gap);
        const y = H - gap - (row + 1) * ch - row * gap;
        const { width: w, height: h } = pages[idx].getSize();
        const scale = Math.min(cw / w, ch / h);
        page.drawPage(emb[idx], { x: x + (cw - w * scale) / 2, y: y + (ch - h * scale) / 2, width: w * scale, height: h * scale });
        page.drawRectangle({ x, y, width: cw, height: ch, borderColor: rgb(0.75, 0.75, 0.75), borderWidth: 0.5 });
      });
    }
    const dest = writeOut(await save(out), f.out, 'imposed.pdf');
    say(`${fmtNum(n)} pages → ${fmtNum(sheets.length)} ${booklet ? 'booklet ' : per + '-up '}sheets → ${dest}`);
    return result({ out: dest, pages: n, sheets: sheets.length, nup: per, booklet });
  },
};

/* ---------- help ---------- */
function help() {
  const names = Object.keys(CMD).sort();
  say(`pdfkit ${VERSION} — the offline PDF toolkit, in a terminal`);
  say('');
  say('usage: pdfkit <command> [files] [flags]');
  say('');
  for (const n of names) {
    say(`  ${CMD[n].usage}`);
    say(`      ${CMD[n].about}`);
  }
  say('');
  say('everywhere: -o <file> writes there, -o - writes to stdout, - for stdin, --json for machines,');
  say('            --quiet for scripts, --locale en-IN for the {date} token and number grouping.');
  say('');
  say('what it does not do: render pages to images, OCR a scan, or rebuild a redaction. Those need a');
  say('canvas or an engine the browser has and Node does not — the app does them, this does not.');
}

/* ---------- main ---------- */
async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') return help();
  if (cmd === 'version' || cmd === '--version' || cmd === '-v') return say(VERSION);
  if (!CMD[cmd]) {
    warn(`no command called "${cmd}"`);
    help();
    process.exit(2);
  }
  const args = parseArgs(argv.slice(1));
  FLAGS = args.f;
  try {
    await CMD[cmd].run(args);
  } catch (e) {
    if (e && e.code === 'ENOENT') die('a file in that command does not exist', 1);
    die((e && (e.message || e)) + '', 1);
  }
}

main();
