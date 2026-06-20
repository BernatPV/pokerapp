// Shared helpers used by the per-site parsers. DOM-free.

/** Map a currency symbol to an ISO-ish code. */
export const CURRENCY_BY_SYMBOL = {
  $: 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'CNY',
  '₩': 'KRW',
};

/**
 * Parse a monetary token into a Number, tolerating thousands separators and
 * either decimal convention (e.g. "1,234.50" or "1.234,50"). Returns NaN if
 * no digits are present. Strips any leading currency symbol.
 */
export function parseMoney(token) {
  if (token == null) return NaN;
  // Grab the first numeric run, ignoring leading symbols and trailing words
  // (e.g. "$1.00 USD" -> "1.00", "€1.234,50" -> "1.234,50").
  const run = String(token).match(/-?\d[\d.,]*/);
  if (!run) return NaN;
  let s = run[0];
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    // The right-most separator is the decimal point.
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      s = s.replace(/\./g, '').replace(',', '.'); // European: 1.234,50
    } else {
      s = s.replace(/,/g, ''); // US: 1,234.50
    }
  } else if (hasComma) {
    // A lone comma with 1-2 trailing digits is a decimal; otherwise a grouping.
    s = /,\d{1,2}$/.test(s) ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/** Detect a currency symbol present in a chunk of text, defaulting to play money. */
export function detectCurrency(text) {
  for (const sym of Object.keys(CURRENCY_BY_SYMBOL)) {
    if (text.includes(sym)) return { symbol: sym, code: CURRENCY_BY_SYMBOL[sym] };
  }
  return { symbol: '', code: 'PLAY' };
}

/** Split a multi-hand file into individual raw hand-history blocks. */
export function splitHands(text, startMarkers) {
  const normalized = text.replace(/\r\n?/g, '\n');
  // Split on blank-line gaps, then merge any block that doesn't start a hand
  // back onto the previous one (defensive against stray blank lines).
  const isStart = (block) => startMarkers.some((m) => block.trimStart().startsWith(m));
  const rawBlocks = normalized.split(/\n\s*\n/);
  const hands = [];
  for (const block of rawBlocks) {
    if (!block.trim()) continue;
    if (hands.length && !isStart(block)) {
      hands[hands.length - 1] += '\n\n' + block;
    } else {
      hands.push(block);
    }
  }
  return hands.map((h) => h.trim()).filter(Boolean);
}
