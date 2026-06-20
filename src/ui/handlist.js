// Sidebar list of imported hands with summary rows, search and selection.
import { formatMoney } from '../model/hand.js';

/** True if a hand matches a free-text query (players, tags, notes, id, site). */
export function handMatches(hand, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const hay = [
    hand.handId,
    hand.site,
    hand.gameType,
    hand.notes,
    ...(hand.tags || []),
    ...hand.seats.map((s) => s.name),
  ].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

function netClass(n) {
  if (n == null) return 'flat';
  if (n > 0) return 'win';
  if (n < 0) return 'lose';
  return 'flat';
}

function shortDate(d) {
  return d ? d.slice(5, 16).replace('T', ' ') : '';
}

/**
 * @param {HTMLElement} listEl
 * @param {HTMLElement} emptyEl
 * @param {{hands:Object[], currentId:string, query:string,
 *          onSelect:(id:string)=>void, onDelete:(id:string)=>void}} ctx
 */
export function renderList(listEl, emptyEl, { hands, currentId, query, onSelect, onDelete }) {
  const shown = hands
    .filter((h) => handMatches(h, query))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

  listEl.replaceChildren();
  emptyEl.hidden = hands.length > 0;
  if (hands.length && !shown.length) {
    emptyEl.hidden = false;
    emptyEl.textContent = 'No hands match your search.';
  } else if (!hands.length) {
    emptyEl.textContent = 'No hands yet. Paste one above or load the sample.';
  }

  for (const h of shown) {
    const stakes = h.smallBlind != null
      ? `${formatMoney(h.smallBlind, h)}/${formatMoney(h.bigBlind, h)}`
      : h.gameType;
    const net = h.netResult;
    const li = document.createElement('li');
    li.className = 'hand-row' + (h.id === currentId ? ' active' : '');

    const netStr = net == null ? '—' : `${net >= 0 ? '+' : ''}${formatMoney(net, h)}`;
    const game = abbreviateGame(h.gameType);
    li.innerHTML = `
      <div class="row-top">
        <span class="stakes">${escapeHtml(stakes)}</span>
        <span class="net ${netClass(net)}">${escapeHtml(netStr)}</span>
      </div>
      <div class="row-sub">
        <span>${escapeHtml(game)} · ${escapeHtml(h.site)}${h.incomplete ? ' <span class="badge-inc">incomplete</span>' : ''}</span>
        <span>${escapeHtml(shortDate(h.date))}</span>
      </div>`;
    li.title = `#${h.handId}`;
    li.addEventListener('click', () => onSelect(h.id));
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (confirm(`Remove hand #${h.handId}?`)) onDelete(h.id);
    });
    listEl.append(li);
  }
}

function abbreviateGame(g = '') {
  return g
    .replace("Hold'em No Limit", 'NLHE')
    .replace('No Limit Hold\'em', 'NLHE')
    .replace('Omaha Pot Limit', 'PLO')
    .replace('Pot Limit Omaha', 'PLO');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
