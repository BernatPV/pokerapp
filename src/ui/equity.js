// Equity side panel: each showdown contestant's win % at the start of every
// street (§6.1), with the current street highlighted. Hidden unless the hand
// reaches a showdown with two or more known hands.

const LABELS = { preflop: 'PF', flop: 'Flop', turn: 'Turn', river: 'River' };
const ORDER = ['preflop', 'flop', 'turn', 'river'];

export function renderEquityPanel(el, ctx) {
  if (!ctx || !ctx.equity) { el.hidden = true; el.replaceChildren(); return; }
  const { equity, currentStreet } = ctx;
  const cols = ORDER.filter((s) => equity.byStreet[s]);
  el.hidden = false;

  const head = cols.map((s) => `<th class="${s === currentStreet ? 'cur' : ''}">${LABELS[s]}</th>`).join('');
  const rows = equity.contestants.map((name) => {
    const cells = cols.map((s) => {
      const e = equity.byStreet[s].find((x) => x.name === name);
      const pct = e ? Math.round(e.equity * 100) : 0;
      return `<td class="${s === currentStreet ? 'cur' : ''}">${pct}%</td>`;
    }).join('');
    return `<tr><td class="eq-name" title="${escapeHtml(name)}">${escapeHtml(name)}</td>${cells}</tr>`;
  }).join('');

  const approx = cols.some((s) => equity.byStreet[s].some((x) => !x.exact));
  el.innerHTML =
    `<div class="eq-title">Equity <span class="eq-sub">win % by street</span></div>` +
    `<table class="eq-table"><thead><tr><th>Player</th>${head}</tr></thead><tbody>${rows}</tbody></table>` +
    (approx ? `<div class="eq-foot">≈ preflop estimated by Monte-Carlo</div>` : '');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
