// Right-hand panel: hand metadata, the scrolling action feed, and the
// end-of-hand summary overlay.

import { formatMoney } from '../model/hand.js';

export function renderMeta(metaEl, hand) {
  if (!hand) { metaEl.replaceChildren(); return; }
  const stakes = hand.smallBlind != null
    ? `${formatMoney(hand.smallBlind, hand)}/${formatMoney(hand.bigBlind, hand)}`
    : '';
  const date = hand.date ? hand.date.replace('T', ' ') : '';
  const bits = [hand.site, hand.gameType, stakes].filter(Boolean).join(' · ');
  const sub = [hand.tableName && `Table ${hand.tableName}`, date, `#${hand.handId}`]
    .filter(Boolean).join(' · ');

  metaEl.replaceChildren();
  const title = document.createElement('div');
  title.className = 'title';
  title.textContent = bits;
  const subEl = document.createElement('div');
  subEl.textContent = sub;
  metaEl.append(title, subEl);

  if (hand.incomplete || (hand.warnings && hand.warnings.length)) {
    const warn = document.createElement('div');
    warn.className = 'warn';
    warn.textContent = hand.incomplete
      ? '⚠ Incomplete parse — some fields may be missing.'
      : `⚠ ${hand.warnings.length} parser note(s).`;
    warn.title = (hand.warnings || []).join('\n');
    metaEl.append(warn);
  }
}

/**
 * @param {HTMLElement} logEl
 * @param {{steps:Object[], index:number, onJump:(frameIndex:number)=>void}} ctx
 */
export function renderLog(logEl, { steps, index, onJump }) {
  logEl.replaceChildren();
  const curStep = index - 1; // the step that produced the current frame
  steps.forEach((s, i) => {
    const li = document.createElement('li');
    li.className = `log-item ${s.kind}` + (i === curStep ? ' cur' : '');
    const note = s.note ? `<div class="note">${escapeHtml(s.note)}</div>` : '';
    li.innerHTML = `<span class="ix">${i + 1}</span><div class="li-body"><div class="txt">${escapeHtml(s.text)}</div>${note}</div>`;
    li.addEventListener('click', () => onJump(i + 1));
    logEl.append(li);
  });
  const cur = logEl.children[curStep];
  if (cur) cur.scrollIntoView({ block: 'nearest' });
}

export function renderSummary(summaryEl, { hand, frame, atEnd }) {
  if (!atEnd) { summaryEl.hidden = true; return; }
  summaryEl.hidden = false;
  const winners = Object.entries(hand.winners || {});
  const net = hand.netResult;

  const rows = winners
    .map(([name, amt]) => `<div class="line"><span>${escapeHtml(name)} wins</span><span class="pos">${formatMoney(amt, hand)}</span></div>`)
    .join('');
  const netRow = net != null && hand.hero
    ? `<div class="line"><span>Hero net</span><span class="${net >= 0 ? 'pos' : 'neg'}">${net >= 0 ? '+' : ''}${formatMoney(net, hand)}</span></div>`
    : '';
  const potRow = hand.totalPot != null
    ? `<div class="line"><span>Pot</span><span>${formatMoney(hand.totalPot, hand)}</span></div>` : '';
  const rakeRow = hand.rake != null
    ? `<div class="line"><span>Rake</span><span>${formatMoney(hand.rake, hand)}</span></div>` : '';

  summaryEl.innerHTML = `<h3>Hand Result</h3>${rows}${netRow}${potRow}${rakeRow}`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
