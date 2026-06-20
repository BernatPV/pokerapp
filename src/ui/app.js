// Application controller: owns state, wires the DOM, and drives the replay.
import { parseHandFile } from '../parser/index.js';
import { buildFrames } from '../engine/replay.js';
import { computeEquity } from '../engine/equity.js';
import { loadHands, saveHands, addHands } from '../store/db.js';
import { renderTable } from './table.js';
import { renderMeta, renderLog, renderSummary } from './actionlog.js';
import { renderStreetNav, renderTimeline, timelineSeekTarget, updateControlBar } from './controls.js';
import { renderList, highlightActive, filterHands, allSessionKeys } from './handlist.js';
import { renderHandEdit } from './handedit.js';
import { renderEquityPanel } from './equity.js';

const $ = (id) => document.getElementById(id);

const els = {
  paste: $('paste'),
  fileInput: $('file-input'),
  search: $('search'),
  markedBtn: $('btn-marked'),
  dateFrom: $('date-from'),
  dateTo: $('date-to'),
  collapseAll: $('btn-collapse-all'),
  list: $('hand-list'),
  listEmpty: $('list-empty'),
  handEdit: $('hand-edit'),
  boardEl: $('board'),
  potEl: $('pot'),
  seatsEl: $('seats'),
  tableEmpty: $('table-empty'),
  streetNav: $('street-nav'),
  timeline: $('timeline'),
  log: $('action-log'),
  meta: $('hand-meta'),
  summary: $('summary'),
  equity: $('equity'),
  dropOverlay: $('drop-overlay'),
  speed: $('speed'),
  bar: {
    counter: $('step-counter'),
    play: $('btn-play'),
    start: $('btn-start'),
    prev: $('btn-prev'),
    next: $('btn-next'),
    end: $('btn-end'),
  },
};

const SAMPLE_FILES = [
  'tests/samples/session.txt',
  'tests/samples/cash_6max.txt',
  'tests/samples/allin_sidepot.txt',
  'tests/samples/tournament_antes.txt',
  'tests/samples/omaha_plo.txt',
];

const COLLAPSE_KEY = 'phr.collapsed.v1';
const loadCollapsed = () => {
  try { return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '[]')); } catch { return new Set(); }
};
const saveCollapsed = () => {
  try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...state.collapsed])); } catch { /* ignore */ }
};

const state = {
  hands: loadHands(),
  currentId: null,
  replay: null,
  index: 0,
  playing: false,
  speed: 1,
  query: '',
  markedOnly: false,
  dateFrom: '',
  dateTo: '',
  collapsed: loadCollapsed(),
};

let timer = null;
let saveTimer = null;

// ── Equity (showdown contestants, per street) ────────────────
const streetKeyForBoard = (n) => (n >= 5 ? 'river' : n >= 4 ? 'turn' : n >= 3 ? 'flop' : 'preflop');

function computeHandEquity(hand, frames) {
  if (hand.variant !== 'holdem') return null;
  const final = frames[frames.length - 1];
  const contestants = final.players.filter((p) => !p.folded && p.holeCards && p.holeCards.length === 2);
  if (contestants.length < 2) return null;
  const hands = contestants.map((p) => ({ name: p.name, cards: p.holeCards }));
  const board = hand.board || [];
  const byStreet = {};
  for (const [name, n] of [['preflop', 0], ['flop', 3], ['turn', 4], ['river', 5]]) {
    if (n > 0 && board.length < n) continue; // street not reached
    byStreet[name] = computeEquity(hands, board.slice(0, n), { samples: 6000, seed: 1 });
  }
  return { contestants: contestants.map((p) => p.name), byStreet };
}

// ── Library: filtering, grouping, marking, tags & notes ──────
function currentFilter() {
  return { query: state.query, markedOnly: state.markedOnly, from: state.dateFrom, to: state.dateTo };
}

function renderLibrary() {
  renderList(els.list, els.listEmpty, {
    hands: filterHands(state.hands, currentFilter()),
    totalCount: state.hands.length,
    currentId: state.currentId,
    collapsed: state.collapsed,
    onSelect: selectHand,
    onDelete: deleteHand,
    onToggleMark: toggleMark,
    onToggleCollapse: toggleCollapse,
  });
}

function renderEditor() {
  const hand = state.hands.find((h) => h.id === state.currentId) || null;
  renderHandEdit(els.handEdit, hand, editCb);
}

function updateHand(id, mutate) {
  const h = state.hands.find((x) => x.id === id);
  if (!h) return null;
  mutate(h);
  saveHands(state.hands);
  return h;
}

function toggleMark(id) {
  updateHand(id, (h) => { h.marked = !h.marked; });
  renderLibrary();
  renderEditor();
}

function toggleCollapse(key) {
  if (state.collapsed.has(key)) state.collapsed.delete(key);
  else state.collapsed.add(key);
  saveCollapsed();
  renderLibrary();
}

function toggleCollapseAll() {
  const keys = allSessionKeys(filterHands(state.hands, currentFilter()));
  const anyExpanded = keys.some((k) => !state.collapsed.has(k));
  for (const k of keys) { if (anyExpanded) state.collapsed.add(k); else state.collapsed.delete(k); }
  saveCollapsed();
  renderLibrary();
}

const editCb = {
  onToggleMark: toggleMark,
  onAddTag: (id, tag) => {
    updateHand(id, (h) => { h.tags = h.tags || []; if (!h.tags.includes(tag)) h.tags.push(tag); });
    renderLibrary();
    renderEditor();
  },
  onRemoveTag: (id, tag) => {
    updateHand(id, (h) => { h.tags = (h.tags || []).filter((t) => t !== tag); });
    renderLibrary();
    renderEditor();
  },
  // Notes save debounced and without re-render, so the textarea keeps focus.
  onNotes: (id, text) => {
    const h = state.hands.find((x) => x.id === id);
    if (!h) return;
    h.notes = text;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveHands(state.hands), 400);
  },
};

function renderFrame() {
  if (!state.replay) return;
  const { hand, frames, steps, streetStarts, equity } = state.replay;
  const frame = frames[state.index];
  const acting = state.index > 0 ? steps[state.index - 1].player : null;

  // Equity for the current street (board length determines the street).
  let eqMap = null;
  let curStreet = null;
  if (equity) {
    curStreet = streetKeyForBoard(frame.board.length);
    const arr = equity.byStreet[curStreet];
    if (arr) { eqMap = {}; for (const e of arr) eqMap[e.name] = e.equity; }
  }

  renderTable(els, { hand, frame, actingPlayer: acting, equity: eqMap });
  renderStreetNav(els.streetNav, { streetStarts, currentStreet: frame.street, onJump: setIndex });
  renderTimeline(els.timeline, { steps, index: state.index });
  renderLog(els.log, { steps, index: state.index, onJump: setIndex });
  renderSummary(els.summary, { hand, frame, atEnd: state.index === steps.length });
  renderEquityPanel(els.equity, equity ? { equity, currentStreet: curStreet } : null);
  updateControlBar(els.bar, { index: state.index, total: steps.length, playing: state.playing });
}

// ── Selection & navigation ───────────────────────────────────
function selectHand(id) {
  const hand = state.hands.find((h) => h.id === id);
  if (!hand) return;
  pause();
  state.currentId = id;
  state.replay = { hand, ...buildFrames(hand) }; // renderFrame reads replay.hand
  state.replay.equity = computeHandEquity(hand, state.replay.frames);
  state.index = 0;
  els.tableEmpty.style.display = 'none';
  highlightActive(els.list, id); // cheap; avoids rebuilding the whole list
  renderMeta(els.meta, hand);
  renderEditor();
  renderFrame();
}

function deleteHand(id) {
  state.hands = state.hands.filter((h) => h.id !== id);
  saveHands(state.hands);
  if (state.currentId === id) {
    state.currentId = null;
    state.replay = null;
    els.tableEmpty.style.display = '';
    els.boardEl.replaceChildren();
    els.seatsEl.replaceChildren();
    els.potEl.textContent = '';
    renderMeta(els.meta, null);
    els.log.replaceChildren();
    els.summary.hidden = true;
    els.equity.hidden = true;
    els.equity.replaceChildren();
    els.streetNav.replaceChildren();
    els.timeline.replaceChildren();
  }
  renderLibrary();
  renderEditor();
}

function setIndex(i) {
  if (!state.replay) return;
  const total = state.replay.steps.length;
  state.index = Math.min(total, Math.max(0, i));
  renderFrame();
}

const next = () => setIndex(state.index + 1);
const prev = () => setIndex(state.index - 1);
const toStart = () => setIndex(0);
const toEnd = () => state.replay && setIndex(state.replay.steps.length);

function jumpStreet(street) {
  if (!state.replay) return;
  const starts = state.replay.streetStarts;
  if (street in starts) setIndex(starts[street]);
}

// ── Auto-play ────────────────────────────────────────────────
function play() {
  if (!state.replay) return;
  if (state.index >= state.replay.steps.length) state.index = 0; // replay from start
  state.playing = true;
  tick();
  renderFrame();
}

function pause() {
  state.playing = false;
  clearTimeout(timer);
  if (state.replay) updateControlBar(els.bar, { index: state.index, total: state.replay.steps.length, playing: false });
}

function togglePlay() {
  state.playing ? pause() : play();
}

function tick() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (!state.playing) return;
    if (state.index >= state.replay.steps.length) { pause(); return; }
    setIndex(state.index + 1);
    tick();
  }, 850 / state.speed);
}

// ── Import ───────────────────────────────────────────────────
function importText(text) {
  const parsed = parseHandFile(text);
  if (!parsed.length) { toast('No hands found in that text.'); return; }
  const { hands, added, firstNewId } = addHands(state.hands, parsed);
  state.hands = hands;
  saveHands(hands);
  renderLibrary();
  selectHand(firstNewId || parsed[0].id);
  toast(`Imported ${parsed.length} hand(s)${added < parsed.length ? `, ${added} new` : ''}.`);
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsText(file);
  });
}

async function importFiles(fileList) {
  const files = [...fileList].filter((f) => /\.txt$/i.test(f.name) || f.type === 'text/plain' || !f.type);
  if (!files.length) { toast('Drop .txt hand-history files.'); return; }
  const texts = await Promise.all(files.map(readFile));
  importText(texts.join('\n\n'));
}

async function loadSamples() {
  try {
    const texts = await Promise.all(
      SAMPLE_FILES.map((p) => fetch(p).then((r) => { if (!r.ok) throw new Error(p); return r.text(); }))
    );
    importText(texts.join('\n\n'));
  } catch {
    toast('Could not load samples. Serve the app over http (npm start).');
  }
}

// ── Theme ────────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('phr.theme', theme); } catch { /* ignore */ }
}
function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
}

// ── Tiny toast ───────────────────────────────────────────────
let toastTimer = null;
function toast(msg) {
  let el = $('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.style.cssText =
      'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:var(--panel-3);' +
      'color:var(--text);border:1px solid var(--border);padding:9px 16px;border-radius:8px;' +
      'box-shadow:var(--shadow);z-index:50;font-size:13px;';
    document.body.append(el);
  }
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .4s'; }, 2200);
}

// ── Wiring ───────────────────────────────────────────────────
function wire() {
  $('btn-parse').addEventListener('click', () => {
    const text = els.paste.value.trim();
    if (text) { importText(text); els.paste.value = ''; }
  });
  $('btn-open').addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', (e) => { importFiles(e.target.files); e.target.value = ''; });
  $('btn-sample').addEventListener('click', loadSamples);
  $('btn-clear').addEventListener('click', () => {
    if (state.hands.length && confirm('Remove all stored hands?')) {
      state.hands = [];
      saveHands(state.hands);
      deleteHand(state.currentId); // also clears the table if a hand is open
      renderLibrary();
    }
  });

  els.search.addEventListener('input', (e) => { state.query = e.target.value; renderLibrary(); });
  els.markedBtn.addEventListener('click', () => {
    state.markedOnly = !state.markedOnly;
    els.markedBtn.classList.toggle('on', state.markedOnly);
    els.markedBtn.setAttribute('aria-pressed', String(state.markedOnly));
    renderLibrary();
  });
  els.dateFrom.addEventListener('change', (e) => { state.dateFrom = e.target.value; renderLibrary(); });
  els.dateTo.addEventListener('change', (e) => { state.dateTo = e.target.value; renderLibrary(); });
  els.collapseAll.addEventListener('click', toggleCollapseAll);

  els.bar.start.addEventListener('click', toStart);
  els.bar.prev.addEventListener('click', prev);
  els.bar.play.addEventListener('click', togglePlay);
  els.bar.next.addEventListener('click', next);
  els.bar.end.addEventListener('click', toEnd);
  els.speed.addEventListener('change', (e) => {
    state.speed = Number(e.target.value);
    if (state.playing) tick();
  });
  $('btn-theme').addEventListener('click', toggleTheme);

  els.timeline.addEventListener('click', (e) => {
    if (!state.replay) return;
    setIndex(timelineSeekTarget(els.timeline, e.clientX, state.replay.steps.length));
  });

  // Drag & drop. Listen on window with an enter/leave depth counter so the
  // overlay survives moving across child elements and always clears when the
  // drag leaves the window or a drop occurs. Only react to actual file drags.
  const showDrop = (show) => els.dropOverlay.classList.toggle('show', show);
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  let dragDepth = 0;
  window.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth += 1;
    showDrop(true);
  });
  window.addEventListener('dragover', (e) => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('dragleave', (e) => {
    if (!hasFiles(e)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) showDrop(false);
  });
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    showDrop(false);
    if (e.dataTransfer && e.dataTransfer.files.length) importFiles(e.dataTransfer.files);
  });

  // Keyboard shortcuts (ignored while typing in a field).
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); next(); break;
      case 'ArrowLeft': e.preventDefault(); prev(); break;
      case ' ': e.preventDefault(); togglePlay(); break;
      case 'Home': e.preventDefault(); toStart(); break;
      case 'End': e.preventDefault(); toEnd(); break;
      case 'f': case 'F': jumpStreet('flop'); break;
      case 't': case 'T': jumpStreet('turn'); break;
      case 'r': case 'R': jumpStreet('river'); break;
      case 's': case 'S': jumpStreet('showdown'); break;
      default: break;
    }
  });
}

// ── Boot ─────────────────────────────────────────────────────
function init() {
  try { applyTheme(localStorage.getItem('phr.theme') || 'dark'); } catch { applyTheme('dark'); }
  wire();
  renderLibrary();
  // Open the most recent hand if the library is non-empty.
  const recent = [...state.hands].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  if (recent) selectHand(recent.id);
}

init();
