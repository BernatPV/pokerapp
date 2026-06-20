// Best-effort fallback parser for unknown / PokerStars-like formats.
// It extracts whatever it can and always flags the hand as incomplete so the
// UI can warn the user. Dedicated site parsers (GG, 888, party, Winamax)
// should be added as their own modules and registered ahead of this one.

import { parseCards } from '../model/hand.js';
import { parseMoney, detectCurrency } from './util.js';

export const SITE = 'Generic';

export function canParse() {
  return true; // always the last resort
}

function detectSite(text) {
  const first = text.trimStart().split('\n')[0] || '';
  const m = first.match(/^([A-Za-z][\w&.'-]*(?:\s+[A-Za-z][\w&.'-]*){0,2})/);
  return m ? m[1].replace(/\s+(Hand|Game).*$/, '').trim() : 'Unknown';
}

export function parseGeneric(rawText) {
  const text = rawText.replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const cur = detectCurrency(text);
  /** @type {import('../model/hand.js').Hand} */
  const hand = {
    handId: (text.match(/#\s*(\S+)/) || [])[1] || `gen-${Date.now()}`,
    site: detectSite(text),
    gameType: (text.match(/(No Limit Hold'?em|Pot Limit Omaha|Hold'?em|Omaha)/i) || [])[1] || 'Unknown',
    currency: cur.code,
    currencySymbol: cur.symbol,
    isTournament: /tournament/i.test(text),
    buttonSeat: Number((text.match(/Seat #?(\d+) is the button/) || [])[1]) || 0,
    seats: [],
    actions: [],
    board: [],
    winners: {},
    warnings: ['Parsed with the generic fallback; some fields may be missing.'],
    rawText: text,
    incomplete: true,
    tags: [],
    notes: '',
  };
  let street = 'preflop';

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    let m;
    if ((m = line.match(/^Seat (\d+):\s*(.+?)\s*\(([^)]*?)\s*in chips\)/))) {
      hand.seats.push({ seat: Number(m[1]), name: m[2], stack: parseMoney(m[3]) });
      continue;
    }
    if ((m = line.match(/^\*\*\* (FLOP|TURN|RIVER) \*\*\*(.*)$/))) {
      street = m[1].toLowerCase();
      const cards = parseCards((m[2].match(/\[([^\]]+)\]\s*$/) || [])[1] || '');
      hand.board = parseCards(([...m[2].matchAll(/\[([^\]]+)\]/g)].map((b) => b[1]).join(' ')));
      hand.actions.push({ street, type: 'deal', cards });
      continue;
    }
    if (/^\*\*\* SHOW ?DOWN \*\*\*/.test(line)) { street = 'showdown'; continue; }
    if ((m = line.match(/^(.+?): (raises) (.+?) to (.+)$/))) {
      hand.actions.push({ street, type: 'raise', player: m[1], amount: parseMoney(m[3]), to: parseMoney(m[4]) });
    } else if ((m = line.match(/^(.+?): (bets|calls) (.+)$/))) {
      hand.actions.push({ street, type: m[2] === 'bets' ? 'bet' : 'call', player: m[1], amount: parseMoney(m[3]) });
    } else if ((m = line.match(/^(.+?): (folds|checks)\b/))) {
      hand.actions.push({ street, type: m[2] === 'folds' ? 'fold' : 'check', player: m[1] });
    } else if ((m = line.match(/^(.+?) (?:collected|wins) (.+?) from/))) {
      const amt = parseMoney(m[2]);
      hand.winners[m[1].trim()] = (hand.winners[m[1].trim()] || 0) + amt;
      hand.actions.push({ street, type: 'collect', player: m[1].trim(), amount: amt });
    }
  }
  return hand;
}
