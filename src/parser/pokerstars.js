// PokerStars hand-history parser. Produces a normalized Hand (see model/hand.js).
// Handles cash games and tournaments (Hold'em / Omaha) including antes, blinds,
// all-ins, uncalled bets, side pots, showdowns and the summary block.

import { parseCards, parseCard } from '../model/hand.js';
import { parseMoney, detectCurrency, CURRENCY_BY_SYMBOL } from './util.js';

export const SITE = 'PokerStars';

/** Cheap detection so the registry can route raw text to this parser. */
export function canParse(text) {
  return /^﻿?PokerStars\b/.test(text.trimStart());
}

const RE = {
  header: /^PokerStars(?:\s+[\w&'-]+)*?\s+(?:Hand|Game)\s+#(\S+?):\s+(.*)$/,
  table: /^Table ['"](.+)['"]\s+(\d+)-max\b.*?Seat #(\d+) is the button/,
  seat: /^Seat (\d+): (.+?) \((.+?) in chips\)/,
  postSB: /^(.+?): posts small blind (.+)$/,
  postBB: /^(.+?): posts big blind (.+)$/,
  postSBBB: /^(.+?): posts small & big blinds (.+)$/,
  postAnte: /^(.+?): posts the ante (.+)$/,
  postStraddle: /^(.+?): (?:posts straddle|straddles) (.+)$/,
  dealt: /^Dealt to (.+?) \[(.+?)\]/,
  street: /^\*\*\* (FIRST |SECOND )?(FLOP|TURN|RIVER)(?: \d)? \*\*\*(.*)$/,
  showdown: /^\*\*\* (?:SHOW ?DOWN|FIRST SHOW ?DOWN|SECOND SHOW ?DOWN) \*\*\*/,
  summary: /^\*\*\* SUMMARY \*\*\*/,
  fold: /^(.+?): folds\b/,
  check: /^(.+?): checks\b/,
  call: /^(.+?): calls (.+?)(\s+and is all-in)?$/,
  bet: /^(.+?): bets (.+?)(\s+and is all-in)?$/,
  raise: /^(.+?): raises (.+?) to (.+?)(\s+and is all-in)?$/,
  shows: /^(.+?): (?:shows|mucks) ?\[?(.*?)\]?\s*(?:\((.+)\))?$/,
  shownCards: /^(.+?): shows \[(.+?)\]/,
  collected: /^(.+?) collected (.+?) from (?:the )?(?:(main|side)(?:[- ]?pot[- ]?\d*)?|pot)/,
  uncalled: /^Uncalled bet \((.+?)\) returned to (.+)$/,
  totalPot: /^Total pot (.+?)(?: \| Rake (.+?))?$/,
  board: /^Board \[(.+?)\]/,
  bracket: /\[([^\]]+)\]/g,
};

// Known non-action status / chat / table-maintenance lines. These are valid
// PokerStars output we intentionally ignore (no action, no warning).
const NOISE = new RegExp(
  ':\\s+(?:' +
    "doesn['’]?t show hand|shows hand|" +
    'sits out|is sitting out|' +
    'has timed out(?: while disconnected)?|is disconnected|is connected|' +
    'said,|' +
    'will be allowed to play after the button|' +
    'cashed out the hand|re-buys|adds |stands up|has returned|' +
    'joins the table|leaves the table|was removed from the table|posts dead' +
    ')',
  'i'
);

/** Parse a "$0.50/$1.00 USD" style stakes blob. */
function parseStakes(blob) {
  const m = blob.match(/([^\d\s/]*)\s*([\d.,]+)\s*\/\s*([^\d\s/]*)\s*([\d.,]+)(?:\s+([A-Za-z]{3}))?/);
  if (!m) return {};
  const symbol = m[1] || m[3] || '';
  return {
    smallBlind: parseMoney(m[2]),
    bigBlind: parseMoney(m[4]),
    currencySymbol: symbol,
    currency: m[5] || CURRENCY_BY_SYMBOL[symbol] || (symbol ? 'USD' : 'PLAY'),
  };
}

/** Extract an ISO-ish local timestamp from a header line. */
function parseDate(text) {
  const m = text.match(/(\d{4})\/(\d{2})\/(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
}

function variantOf(gameType) {
  const g = gameType.toLowerCase();
  if (g.includes('omaha')) return 'omaha';
  if (g.includes("hold'em") || g.includes('holdem')) return 'holdem';
  return 'other';
}

function parseHeader(line, hand) {
  const m = line.match(RE.header);
  if (!m) return false;
  hand.handId = m[1];
  const rest = m[2];
  hand.date = parseDate(rest);

  if (/^Tournament\b/.test(rest)) {
    hand.isTournament = true;
    const tid = rest.match(/Tournament #(\d+)/);
    if (tid) hand.tournamentId = tid[1];
    const cur = detectCurrency(rest);
    hand.currencySymbol = cur.symbol;
    hand.currency = cur.code;
    // Game type sits between the buy-in/currency and " - Level"/" - Match".
    const seg = rest.split(/\s+-\s+(?:Level|Match)/)[0];
    const afterCur = seg.match(/\b(?:USD|EUR|GBP|CNY|KRW)\b\s+(.*)$/);
    const gt = afterCur
      ? afterCur[1]
      : seg.replace(/^Tournament\s+#\S+,?\s*/, '').replace(/^(?:Freeroll|\S+\+\S+|\S+)\s+/, '');
    hand.gameType = (gt || "Hold'em No Limit").trim();
    const lvl = rest.match(/Level\s+([\w-]+)\s+\(([\d.,]+)\/([\d.,]+)\)/);
    if (lvl) {
      hand.level = lvl[1];
      hand.smallBlind = parseMoney(lvl[2]);
      hand.bigBlind = parseMoney(lvl[3]);
    }
  } else {
    const open = rest.indexOf('(');
    hand.gameType = (open >= 0 ? rest.slice(0, open) : rest).trim();
    const close = rest.indexOf(')', open);
    if (open >= 0 && close > open) {
      Object.assign(hand, parseStakes(rest.slice(open + 1, close)));
    }
  }
  hand.variant = variantOf(hand.gameType || '');
  return true;
}

/**
 * Parse a single PokerStars hand block into a normalized Hand object.
 * @param {string} rawText
 * @returns {import('../model/hand.js').Hand}
 */
export function parsePokerStars(rawText) {
  const text = rawText.replace(/\r\n?/g, '\n').replace(/^﻿/, '');
  const lines = text.split('\n');
  /** @type {import('../model/hand.js').Hand} */
  const hand = {
    handId: '',
    site: SITE,
    gameType: '',
    currency: 'PLAY',
    currencySymbol: '',
    isTournament: false,
    buttonSeat: 0,
    seats: [],
    actions: [],
    board: [],
    winners: {},
    warnings: [],
    rawText: text,
    tags: [],
    notes: '',
  };
  const seatByName = new Map();
  let street = 'preflop';
  let sawHoleCards = false;
  let inSummary = false;
  let runItTwice = false;

  const findSeat = (name) => seatByName.get(name);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (!hand.handId && parseHeader(line, hand)) continue;

    const tbl = line.match(RE.table);
    if (tbl) {
      hand.tableName = tbl[1];
      hand.maxSeats = Number(tbl[2]);
      hand.buttonSeat = Number(tbl[3]);
      continue;
    }

    if (RE.summary.test(line)) { inSummary = true; continue; }

    // --- Summary section: harvest pot/rake/board and winner fallbacks. ---
    if (inSummary) {
      const tp = line.match(RE.totalPot);
      if (tp) {
        hand.totalPot = parseMoney(tp[1]);
        if (tp[2]) hand.rake = parseMoney(tp[2]);
        continue;
      }
      const bd = line.match(RE.board);
      if (bd) { hand.board = parseCards(bd[1]); continue; }
      continue;
    }

    // --- Seat definitions (before HOLE CARDS only). ---
    if (!sawHoleCards) {
      const s = line.match(RE.seat);
      if (s) {
        const seat = { seat: Number(s[1]), name: s[2], stack: parseMoney(s[3]) };
        hand.seats.push(seat);
        seatByName.set(seat.name, seat);
        continue;
      }
    }

    // --- Blinds / antes (preflop posts). ---
    let m;
    if ((m = line.match(RE.postAnte))) {
      pushPost(hand, m[1], parseMoney(m[2]), 'ante', line);
      hand.ante = parseMoney(m[2]);
      continue;
    }
    if ((m = line.match(RE.postSBBB))) {
      pushPost(hand, m[1], parseMoney(m[2]), 'sbbb', line);
      continue;
    }
    if ((m = line.match(RE.postSB))) {
      pushPost(hand, m[1], parseMoney(m[2]), 'sb', line);
      continue;
    }
    if ((m = line.match(RE.postBB))) {
      pushPost(hand, m[1], parseMoney(m[2]), 'bb', line);
      continue;
    }
    if ((m = line.match(RE.postStraddle))) {
      pushPost(hand, m[1], parseMoney(m[2]), 'straddle', line);
      continue;
    }

    if (/^\*\*\* HOLE CARDS \*\*\*/.test(line)) { sawHoleCards = true; continue; }

    if ((m = line.match(RE.dealt))) {
      const cards = parseCards(m[2]);
      hand.hero = m[1];
      const seat = findSeat(m[1]);
      if (seat) { seat.holeCards = cards; seat.isHero = true; }
      continue;
    }

    const st = line.match(RE.street);
    if (st) {
      if (st[1] === 'SECOND ') { runItTwice = true; continue; } // ignore 2nd board
      if (st[1] === 'FIRST ') runItTwice = true;
      street = st[2].toLowerCase();
      const brackets = [...st[3].matchAll(RE.bracket)].map((b) => b[1]);
      const all = parseCards(brackets.join(' '));
      const known = new Set(hand.board.map((c) => c.code));
      const fresh = all.filter((c) => !known.has(c.code));
      hand.board = all.length >= hand.board.length ? all : hand.board;
      hand.actions.push({ street, type: 'deal', cards: fresh });
      continue;
    }

    if (RE.showdown.test(line)) { street = 'showdown'; continue; }
    if (runItTwice && street === 'showdown') {
      // Skip duplicate showdown reveals from the second run.
    }

    // --- Voluntary actions. ---
    if ((m = line.match(RE.raise))) {
      hand.actions.push({
        street, type: 'raise', player: m[1],
        amount: parseMoney(m[2]), to: parseMoney(m[3]), allIn: !!m[4],
      });
      continue;
    }
    if ((m = line.match(RE.call))) {
      hand.actions.push({ street, type: 'call', player: m[1], amount: parseMoney(m[2]), allIn: !!m[3] });
      continue;
    }
    if ((m = line.match(RE.bet))) {
      hand.actions.push({ street, type: 'bet', player: m[1], amount: parseMoney(m[2]), allIn: !!m[3] });
      continue;
    }
    if ((m = line.match(RE.check))) {
      hand.actions.push({ street, type: 'check', player: m[1] });
      continue;
    }
    if ((m = line.match(RE.fold))) {
      hand.actions.push({ street, type: 'fold', player: m[1] });
      continue;
    }

    if ((m = line.match(RE.uncalled))) {
      hand.actions.push({ street, type: 'uncalled', player: m[2].trim(), amount: parseMoney(m[1]) });
      continue;
    }

    // Shown cards (at showdown, or all-in reveal).
    const shown = line.match(RE.shownCards);
    if (shown) {
      const cards = parseCards(shown[2]);
      const seat = findSeat(shown[1]);
      if (seat && cards.length) seat.holeCards = cards;
      hand.actions.push({ street, type: 'show', player: shown[1], cards });
      continue;
    }
    if (/^(.+?): mucks hand\b/.test(line)) {
      const mk = line.match(/^(.+?): mucks hand\b/);
      hand.actions.push({ street, type: 'muck', player: mk[1] });
      continue;
    }

    if ((m = line.match(RE.collected))) {
      const player = m[1].trim();
      const amount = parseMoney(m[2]);
      hand.winners[player] = (hand.winners[player] || 0) + amount;
      hand.actions.push({ street, type: 'collect', player, amount });
      continue;
    }

    // Known status / chat lines: recognized and intentionally ignored.
    if (NOISE.test(line)) continue;

    // Anything else that looks meaningful is recorded, not silently discarded.
    if (/:/.test(line) && !/^(PokerStars|Table|Seat)\b/.test(line)) {
      hand.warnings.push(`Unparsed: ${line}`);
    }
  }

  if (runItTwice) hand.warnings.push('Run-it-twice detected; only the first board is shown.');
  finalize(hand);
  return hand;
}

function pushPost(hand, player, amount, subtype, line) {
  if (subtype === 'sbbb') {
    // Posting both blinds: treat as a single dead+live post of the total.
    hand.actions.push({ street: 'preflop', type: 'post', player, amount, subtype: 'bb' });
    return;
  }
  hand.actions.push({ street: 'preflop', type: 'post', player, amount, subtype });
}

/** Fill derived fields: net result, validity flags. */
function finalize(hand) {
  if (!hand.handId) {
    hand.incomplete = true;
    hand.warnings.push('Missing hand ID / header not recognized.');
  }
  if (!hand.seats.length) {
    hand.incomplete = true;
    hand.warnings.push('No seats parsed.');
  }
  hand.netResult = computeHeroNet(hand);
}

/** Hero net = chips collected − chips committed (accounts for uncalled returns). */
export function computeHeroNet(hand) {
  if (!hand.hero) return undefined;
  let put = 0;
  let streetCommit = 0;
  let street = 'preflop';
  for (const a of hand.actions) {
    if (a.street !== street) { street = a.street; streetCommit = 0; }
    if (a.player !== hand.hero) continue;
    const amt = Number.isFinite(a.amount) ? a.amount : 0;
    if (a.type === 'post') {
      put += amt;
      if (a.subtype !== 'ante') streetCommit += amt; // antes are dead, not part of "to"
    } else if (a.type === 'call' || a.type === 'bet') {
      put += amt; streetCommit += amt;
    } else if (a.type === 'raise') {
      const to = Number.isFinite(a.to) ? a.to : streetCommit;
      put += to - streetCommit; streetCommit = to;
    } else if (a.type === 'uncalled') {
      put -= amt; streetCommit -= amt;
    }
  }
  const won = hand.winners?.[hand.hero] || 0;
  return Math.round((won - put) * 100) / 100;
}
