// Sidebar hand library: search + filters, session grouping (collapsible),
// per-hand marking, and inline tag chips.

import { formatMoney } from '../model/hand.js';

/** Free-text match across id, site, game, notes, tags and player names. */
export function handMatches(hand, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const hay = [
    hand.handId, hand.site, hand.gameType, hand.tableName, hand.notes,
    ...(hand.tags || []),
    ...hand.seats.map((s) => s.name),
  ].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

/** Apply all sidebar filters (text, marked-only, date range). */
export function filterHands(hands, { query = '', markedOnly = false, from = '', to = '' } = {}) {
  return hands.filter((h) => {
    if (markedOnly && !h.marked) return false;
    if (from || to) {
      const d = (h.date || '').slice(0, 10);
      if (!d) return false;
      if (from && d < from) return false;
      if (to && d > to) return false;
    }
    return handMatches(h, query);
  });
}

/** Session = same tournament, or same site+table+day for cash games. */
export function sessionKey(h) {
  const day = (h.date || '').slice(0, 10) || 'nodate';
  if (h.isTournament && h.tournamentId) return `T:${h.tournamentId}`;
  return `${h.site}|${h.tableName || '?'}|${day}`;
}

function sessionTitle(h) {
  if (h.isTournament && h.tournamentId) return `Tournament #${h.tournamentId}`;
  return h.tableName || h.site || 'Hands';
}

const netClass = (n) => (n == null ? 'flat' : n > 0 ? 'win' : n < 0 ? 'lose' : 'flat');
const fmtNet = (n, h) => (n == null ? '—' : `${n >= 0 ? '+' : ''}${formatMoney(n, h)}`);

function abbreviateGame(g = '') {
  return g.replace("Hold'em No Limit", 'NLHE').replace("No Limit Hold'em", 'NLHE')
    .replace('Omaha Pot Limit', 'PLO').replace('Pot Limit Omaha', 'PLO');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function handRow(h, ctx) {
  const li = document.createElement('li');
  li.className = 'hand-row' + (h.id === ctx.currentId ? ' active' : '');
  li.dataset.id = h.id;

  const star = document.createElement('button');
  star.className = 'star' + (h.marked ? ' on' : '');
  star.textContent = h.marked ? '★' : '☆';
  star.title = h.marked ? 'Unmark' : 'Mark';
  star.setAttribute('aria-label', h.marked ? 'Unmark hand' : 'Mark hand');
  star.setAttribute('aria-pressed', String(!!h.marked));
  star.addEventListener('click', (e) => { e.stopPropagation(); ctx.onToggleMark(h.id); });

  const main = document.createElement('div');
  main.className = 'row-main';
  const stakes = h.smallBlind != null ? `${formatMoney(h.smallBlind, h)}/${formatMoney(h.bigBlind, h)}` : abbreviateGame(h.gameType);
  const time = (h.date || '').slice(11, 16);
  const tags = (h.tags && h.tags.length)
    ? `<div class="row-tags">${h.tags.map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join('')}</div>` : '';
  main.innerHTML =
    `<div class="row-top"><span class="stakes">${escapeHtml(stakes)}</span>` +
    `<span class="net ${netClass(h.netResult)}">${escapeHtml(fmtNet(h.netResult, h))}</span></div>` +
    `<div class="row-sub"><span>${escapeHtml(abbreviateGame(h.gameType))}${time ? ' · ' + time : ''}${h.incomplete ? ' <span class="badge-inc">incomplete</span>' : ''}</span>` +
    `<span>#${escapeHtml(h.handId)}</span></div>${tags}`;
  main.addEventListener('click', () => ctx.onSelect(h.id));

  li.append(star, main);
  li.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (confirm(`Remove hand #${h.handId}?`)) ctx.onDelete(h.id);
  });
  return li;
}

/**
 * @param {HTMLElement} listEl
 * @param {HTMLElement} emptyEl
 * @param {{hands:Object[], totalCount:number, currentId:string, collapsed:Set<string>,
 *   onSelect:Function, onDelete:Function, onToggleMark:Function, onToggleCollapse:Function}} ctx
 */
export function renderList(listEl, emptyEl, ctx) {
  const { hands, collapsed } = ctx;
  listEl.replaceChildren();

  if (!hands.length) {
    emptyEl.hidden = false;
    emptyEl.textContent = ctx.totalCount
      ? 'No hands match your filters.'
      : 'No hands yet. Paste one above or load the sample.';
    return;
  }
  emptyEl.hidden = true;

  // Group into sessions, ordered most-recent-first; hands chronological within.
  const groups = new Map();
  for (const h of hands) {
    const key = sessionKey(h);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(h);
  }
  const ordered = [...groups.entries()].map(([key, hs]) => {
    hs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    return {
      key,
      hands: hs,
      latest: Math.max(...hs.map((h) => h.createdAt || 0)),
      net: hs.reduce((s, h) => s + (Number.isFinite(h.netResult) ? h.netResult : 0), 0),
      sample: hs[0],
    };
  }).sort((a, b) => b.latest - a.latest);

  for (const g of ordered) {
    const li = document.createElement('li');
    li.className = 'session';
    const isCollapsed = collapsed.has(g.key);
    const day = (g.sample.date || '').slice(0, 10);

    const header = document.createElement('div');
    header.className = 'session-header';
    header.setAttribute('role', 'button');
    header.setAttribute('aria-expanded', String(!isCollapsed));
    header.innerHTML =
      `<span class="caret">${isCollapsed ? '▸' : '▾'}</span>` +
      `<span class="session-title" title="${escapeHtml(sessionTitle(g.sample))}">${escapeHtml(sessionTitle(g.sample))}</span>` +
      `<span class="session-meta">${day ? day + ' · ' : ''}${g.hands.length} hand${g.hands.length === 1 ? '' : 's'} · <span class="net ${netClass(g.net)}">${escapeHtml(fmtNet(g.net, g.sample))}</span></span>`;
    header.addEventListener('click', () => ctx.onToggleCollapse(g.key));
    li.append(header);

    if (!isCollapsed) {
      const ul = document.createElement('ul');
      ul.className = 'session-hands';
      for (const h of g.hands) ul.append(handRow(h, ctx));
      li.append(ul);
    }
    listEl.append(li);
  }
}

/** Update only the active-row highlight without rebuilding the list. */
export function highlightActive(listEl, currentId) {
  for (const row of listEl.querySelectorAll('.hand-row')) {
    row.classList.toggle('active', row.dataset.id === currentId);
  }
}

/** All distinct session keys present in a set of hands (for collapse-all). */
export function allSessionKeys(hands) {
  return [...new Set(hands.map(sessionKey))];
}
