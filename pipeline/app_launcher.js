/* =====================================================================
   The front door.

   One catalogue of tools as data, and the surfaces that read it: the
   launcher that fills the empty state, the "all tools" sheet, and the
   category dot on every panel in the sidebar. Nothing here invents a
   feature — every card opens a panel that already existed.

   The catalogue is the single source of truth. Add a tool here and it
   appears on the launcher's "all tools" sheet, carries its category
   colour, and gets a matching dot on its sidebar section.
   ===================================================================== */

const CATS = {
  edit:     { label: 'Edit',     hint: 'Organise & modify', accent: '#f43f5e' },
  optimize: { label: 'Optimize', hint: 'Shrink & compare',  accent: '#f59e0b' },
  secure:   { label: 'Secure',   hint: 'Protect & remove',  accent: '#6366f1' },
  convert:  { label: 'Convert',  hint: 'Export assets',     accent: '#14b8a6' },
  trust:    { label: 'Trust',    hint: 'Look inside',       accent: '#8b98a8' }
};

/* 20×20 stroke icons, drawn here so the app keeps its 0-request promise. */
const ICO = {
  merge:   '<rect x="2.5" y="2.5" width="9" height="11" rx="2"/><rect x="8.5" y="6.5" width="9" height="11" rx="2"/>',
  split:   '<rect x="2.5" y="3.5" width="6" height="13" rx="1.5"/><rect x="11.5" y="3.5" width="6" height="13" rx="1.5"/>',
  trim:    '<path d="M6 2.5v15M14 2.5v15M2.5 6h15M2.5 14h15"/>',
  impose:  '<rect x="2.5" y="2.5" width="6.5" height="6.5" rx="1"/><rect x="11" y="2.5" width="6.5" height="6.5" rx="1"/><rect x="2.5" y="11" width="6.5" height="6.5" rx="1"/><rect x="11" y="11" width="6.5" height="6.5" rx="1"/>',
  header:  '<rect x="3" y="3" width="14" height="14" rx="2"/><path d="M3 7h14M3 13h14"/>',
  numbers: '<path d="M7.5 3.5 6 16.5M14 3.5 12.5 16.5M3.5 7.5h13M3 12.5h13"/>',
  mark:    '<path d="M10 3s5 5.2 5 8.4A5 5 0 0 1 5 11.4C5 8.2 10 3 10 3z"/>',
  tag:     '<path d="M3 8.2V4.5A1.5 1.5 0 0 1 4.5 3h3.7c.4 0 .8.2 1 .4l7.4 7.4a1.5 1.5 0 0 1 0 2.1l-3.3 3.3a1.5 1.5 0 0 1-2.1 0L3.4 9.2a1.5 1.5 0 0 1-.4-1z"/><circle cx="7" cy="7" r="1"/>',
  form:    '<path d="M4 7h9M4 11h9M4 15h5"/><path d="M13.5 6.5 14.6 8 17 5"/>',
  sign:    '<path d="M3 16.5c3 0 4-9 6.5-9 1.6 0 1.4 4 .4 6.5-.6 1.5.2 2.5 1.6 2.5 1.2 0 2-1 3-1"/><path d="M3.5 16.5h13"/>',
  compress:'<path d="M4 4l4 4M8 8H5.5M8 8V5.5"/><path d="M16 16l-4-4M12 12h2.5M12 12v2.5"/>',
  compare: '<rect x="2.5" y="4" width="6" height="12" rx="1.5"/><rect x="11.5" y="4" width="6" height="12" rx="1.5"/><path d="M10 3v14"/>',
  redact:  '<rect x="2.5" y="3.5" width="15" height="13" rx="2"/><path d="M5.5 9h9M5.5 12.5h5" stroke-width="2.4"/>',
  lock:    '<rect x="4" y="9" width="12" height="8" rx="2"/><path d="M6.8 9V6.8a3.2 3.2 0 0 1 6.4 0V9"/>',
  unlock:  '<rect x="4" y="9" width="12" height="8" rx="2"/><path d="M6.8 9V6.8a3.2 3.2 0 0 1 6.2-1.2"/>',
  pin:     '<circle cx="7" cy="13" r="3"/><path d="M9.2 10.8 16 4M13 7l2 2"/>',
  meta:    '<circle cx="10" cy="10" r="7.2"/><path d="M10 9v4.6M10 6.5v.1"/>',
  text:    '<path d="M4 5.5h12M4 10h12M4 14.5h7"/>',
  ocr:     '<rect x="3" y="3" width="14" height="14" rx="2"/><path d="M7 13.5 10 6.5l3 7M8 11.2h4"/>',
  image:   '<rect x="2.5" y="4" width="15" height="12" rx="2"/><circle cx="7" cy="8" r="1.3"/><path d="M3.5 14.5 8 10l3 3 2.5-2 3 3.5"/>',
  folder:  '<path d="M2.5 6.5A1.5 1.5 0 0 1 4 5h3.4l1.6 2h7A1.5 1.5 0 0 1 17.5 8.5v6A1.5 1.5 0 0 1 16 16H4a1.5 1.5 0 0 1-1.5-1.5z"/>',
  png:     '<rect x="2.5" y="4" width="15" height="12" rx="2"/><path d="M6 12.5 9 9l2.2 2.4L14 8l3 4.5"/>',
  net:     '<circle cx="10" cy="10" r="7"/><path d="M3 10h14M10 3c2.2 2.4 2.2 11.6 0 14M10 3c-2.2 2.4-2.2 11.6 0 14"/>',
  check:   '<circle cx="10" cy="10" r="7.2"/><path d="M6.6 10.2 9 12.6l4.4-4.6"/>',
  add:     '<path d="M10 4.5v11M4.5 10h11"/>'
};

/* Every tool the app has, as data. `panel` is the sidebar section it opens;
   `action` is used instead when the tool is a verb rather than a panel.
   `needsFile` defaults to true — a tool that reads a document asks for one
   before it opens, so a card is never a dead end on a cold start. */
const TOOLS = [
  { id: 'merge',   blurb: 'Combine files',        cat: 'edit',     icon: 'merge',    action: 'add',    label: 'Merge' },
  { id: 'split',   blurb: 'Pages out, pages kept', cat: 'edit',    icon: 'split',    panel: 's-split' },
  { id: 'wm',      blurb: 'Add an overlay',       cat: 'edit',     icon: 'mark',     panel: 's-wm' },
  { id: 'pn',      blurb: 'Add pagination',       cat: 'edit',     icon: 'numbers',  panel: 's-pn' },
  { id: 'hf',      blurb: 'Top and bottom',       cat: 'edit',     icon: 'header',   panel: 's-hf' },
  { id: 'bates',   blurb: 'Legal numbering',      cat: 'edit',     icon: 'numbers',  panel: 's-bates' },
  { id: 'geom',    blurb: 'Cut edges, re-lay',    cat: 'edit',     icon: 'trim',     panel: 's-geom' },
  { id: 'impose',  blurb: '2-up, 4-up, booklet',  cat: 'edit',     icon: 'impose',   panel: 's-impose' },
  { id: 'labels',  blurb: 'i, ii, then 1, 2',     cat: 'edit',     icon: 'tag',      panel: 's-labels' },
  { id: 'form',    blurb: 'Fill and flatten',     cat: 'edit',     icon: 'form',     panel: 's-form' },
  { id: 'sign',    blurb: 'Draw and stamp',       cat: 'edit',     icon: 'sign',     panel: 's-sign' },

  { id: 'cmp',     blurb: 'Smaller files',        cat: 'optimize', icon: 'compress', panel: 's-cmp' },
  { id: 'compare', blurb: 'What changed',         cat: 'optimize', icon: 'compare',  panel: 's-compare' },

  { id: 'redact',  blurb: 'Remove, not cover',    cat: 'secure',   icon: 'redact',   panel: 's-redact' },
  { id: 'sec',     blurb: 'AES-256',              cat: 'secure',   icon: 'lock',     panel: 's-sec' },
  { id: 'unlock',  blurb: 'Remove a password',    cat: 'secure',   icon: 'unlock',   panel: 's-unlock' },
  { id: 'lock',    blurb: 'PIN-locked HTML',      cat: 'secure',   icon: 'pin',      panel: 's-lock' },
  { id: 'meta',    blurb: 'Edit or strip',        cat: 'secure',   icon: 'meta',     panel: 's-meta' },

  { id: 'text',    blurb: 'Text layer to .txt',   cat: 'convert',  icon: 'text',     panel: 's-text' },
  { id: 'ocr',     blurb: 'A scan, read',         cat: 'convert',  icon: 'ocr',      panel: 's-ocr' },
  { id: 'img',     blurb: 'Pictures inside',      cat: 'convert',  icon: 'image',    panel: 's-img' },
  { id: 'png',     blurb: 'Every page, a picture', cat: 'convert', icon: 'png',      action: 'png',    label: 'Pages to PNG' },
  { id: 'folder',  blurb: 'Batch, one by one',    cat: 'convert',  icon: 'folder',   panel: 's-folder' },

  { id: 'net',     blurb: 'Every request',        cat: 'trust',    icon: 'net',      panel: 's-net',   needsFile: false },
  { id: 'selftest',blurb: 'Prove it here',        cat: 'trust',    icon: 'check',    action: 'selftest', needsFile: false, label: 'Self-test' },
  { id: 'info',    blurb: 'Pages, size, limits',  cat: 'trust',    icon: 'text',      panel: 's-info',  needsFile: false },
  { id: 'credits', blurb: 'The libraries used',   cat: 'trust',    icon: 'tag',  panel: 's-credits', needsFile: false }
];

const TOOL_BY_ID = {};
for (const tl of TOOLS) TOOL_BY_ID[tl.id] = tl;

/* The four on the launcher, in the order a report actually moves:
   gather it, shrink it, hide what must not be read, take the text out. */
const CORE = ['merge', 'cmp', 'redact', 'text'];

const SVG = (name) => '<svg viewBox="0 0 20 20" aria-hidden="true">' + (ICO[name] || ICO.text) + '</svg>';

/* A tool's name is the sidebar section's own summary — one source of truth,
   and it follows the interface language for free. */
function toolName(tl){
  if (tl.label) return tl.label;
  const sec = tl.panel && $('#' + tl.panel);
  const sum = sec && sec.querySelector('summary');
  const first = sum && sum.firstChild;
  return ((first && first.textContent) || tl.id).trim();
}
function resolveNames(){ for (const tl of TOOLS) tl.name = toolName(tl); }

function toolCard(tl){
  return '<button class="tcard cat-' + tl.cat + '" data-tool="' + tl.id + '">'
    + '<span class="tile">' + SVG(tl.icon) + '</span>'
    + '<span class="tcard-t"><b>' + esc(tl.name) + '</b><small>' + esc(tl.blurb) + '</small></span>'
    + '</button>';
}


/* ---------- this session's outputs ----------
   sessionStorage, not localStorage: these are patient reports and
   contracts. The list is a memory of what you just did in this tab, and it
   is gone when the tab is. No bytes are kept — only the name, the tool and
   the size, so nothing here can be reopened by someone else later. */
const REC_KEY = 'pdftk_session_output';
function recentsList(){
  try { return JSON.parse(sessionStorage.getItem(REC_KEY) || '[]'); } catch (e) { return []; }
}
function recentsWrite(list){
  try { sessionStorage.setItem(REC_KEY, JSON.stringify(list.slice(0, 6))); } catch (e) {}
}
let lastToolId = null;
function currentToolName(){
  const tl = lastToolId && TOOL_BY_ID[lastToolId];
  return tl ? tl.name : 'Saved';
}
function recentAdd(name, tool, size){
  const list = recentsList();
  list.unshift({ name: String(name || 'output.pdf'), tool: tool, size: size || 0, t: Date.now() });
  recentsWrite(list);
  drawRecents();
}
function drawRecents(){
  const host = $('#rec'), body = $('#rec-list');
  if (!host || !body) return;
  const list = recentsList();
  host.hidden = !list.length;
  if (!list.length) { body.innerHTML = ''; return; }
  body.innerHTML = list.map(r =>
    '<div class="rec-row"><span class="rec-dot" aria-hidden="true"></span>'
    + '<span class="rec-name" title="' + esc(r.name) + '">' + esc(r.name) + '</span>'
    + '<span class="rec-tool">' + esc(r.tool) + '</span>'
    + '<span class="rec-size">' + esc(fmt(r.size)) + '</span></div>').join('');
}

/* ---------- the launcher ---------- */
function drawLauncher(){
  const grid = $('#home-grid');
  if (!grid) return;
  resolveNames();
  grid.innerHTML = CORE.map(id => TOOL_BY_ID[id]).filter(Boolean).map(toolCard).join('');
  drawRecents();
}

/* A tool that needs a document asks for one first, then opens itself when
   the file has landed — so the card is never a dead end. */
let pendingTool = null;
function needFile(id){
  pendingTool = id;
  toast('Choose a file first — it stays in this tab');
  $('#fpick').click();
}

function launchTool(id){
  const tl = TOOL_BY_ID[id];
  if (!tl) return;
  lastToolId = id;
  if (tl.action === 'add') { pendingTool = null; $('#fpick').click(); return; }
  if (tl.action === 'selftest') { selfTest(); return; }
  if (tl.action === 'png') {
    if (!pages.length) { needFile(id); return; }
    exportPng(); return;
  }
  if (!pages.length && tl.needsFile !== false) { needFile(id); return; }
  openSec(tl.panel);
}

function catalogueOpen(){
  resolveNames();
  openModal('All tools',
    '<input id="catq" type="text" placeholder="Search ' + TOOLS.length + ' tools…" autocomplete="off" class="cat-search">'
    + '<div id="catout" class="cat-out"></div>');
  const q = $('#catq');
  q.focus();
  const draw = () => {
    const s = q.value.trim().toLowerCase();
    const hit = TOOLS.filter(tl => !s
      || tl.name.toLowerCase().includes(s)
      || tl.blurb.toLowerCase().includes(s)
      || CATS[tl.cat].label.toLowerCase().includes(s));
    $('#catout').innerHTML = hit.length
      ? Object.keys(CATS).map(k => {
          const inCat = hit.filter(tl => tl.cat === k);
          if (!inCat.length) return '';
          return '<div class="cat-head"><span class="cat-dot cat-' + k + '"></span>'
            + '<b>' + CATS[k].label + '</b><span>' + CATS[k].hint + '</span></div>'
            + '<div class="cat-grid">' + inCat.map(toolCard).join('') + '</div>';
        }).join('')
      : '<p class="hint">Nothing matches “' + esc(q.value) + '”.</p>';
  };
  draw();
  q.addEventListener('input', draw);
  $('#catout').addEventListener('click', e => {
    const card = e.target.closest('[data-tool]');
    if (!card) return;
    closeModal();
    setTimeout(() => launchTool(card.dataset.tool), 60);
  });
}

/* ---------- wiring ---------- */
function initLauncher(){
  drawLauncher();

  const hero = $('#hero');
  if (hero) hero.addEventListener('click', e => { if (!e.target.closest('button')) $('#fpick').click(); });
  const hp = $('#hero-pick'); if (hp) hp.onclick = () => $('#fpick').click();
  const hi = $('#hero-img'); if (hi) hi.onclick = () => $('#ipick').click();
  const at = $('#all-tools'); if (at) at.onclick = catalogueOpen;
  const mt = $('#more-tools'); if (mt) mt.onclick = catalogueOpen;
  const rc = $('#rec-clear'); if (rc) rc.onclick = () => { recentsWrite([]); drawRecents(); toast('Session list cleared'); };
  const hh = $('#home-help'); if (hh) hh.onclick = () => openModal('Offline PDF Toolkit', helpHTML());

  const grid = $('#home-grid');
  if (grid) grid.addEventListener('click', e => {
    const card = e.target.closest('[data-tool]');
    if (card) launchTool(card.dataset.tool);
  });

  /* a category dot on every sidebar section, from the same catalogue */
  const panelCat = {};
  for (const tl of TOOLS) if (tl.panel) panelCat[tl.panel] = tl.cat;
  for (const sec of $$('.sec')) {
    const cat = panelCat[sec.id];
    if (cat) sec.dataset.cat = cat;
  }

  /* remember which tool was last opened, so a saved file can be labelled */
  const _openSec = window.openSec;
  window.openSec = function(id){
    const tl = TOOLS.find(t => t.panel === id);
    if (tl) lastToolId = tl.id;
    return _openSec.apply(this, arguments);
  };

  /* a file that lands while a tool is waiting opens that tool */
  const _addFiles = window.addFiles;
  window.addFiles = async function(){
    const r = await _addFiles.apply(this, arguments);
    if (pendingTool && pages.length) { const id = pendingTool; pendingTool = null; launchTool(id); }
    return r;
  };

  /* the launcher is the empty state: it draws itself whenever the grid empties */
  const _render = window.render;
  window.render = function(){
    const r = _render.apply(this, arguments);
    if (!pages.length) { drawLauncher(); }
    return r;
  };

  drawRecents();
}
initLauncher();
