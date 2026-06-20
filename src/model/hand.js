// Normalized data model shared by every site parser and the replay engine.
// Keep this module free of DOM/browser APIs so it can run under Node for tests.

/** Canonical street names, in order. */
export const STREETS = ['preflop', 'flop', 'turn', 'river', 'showdown'];

/** Number of community cards visible once a given street has been dealt. */
export const BOARD_COUNT = { preflop: 0, flop: 3, turn: 4, river: 5, showdown: 5 };

/** Voluntary action verbs we recognize. */
export const ACTIONS = ['fold', 'check', 'call', 'bet', 'raise'];

/** Card suit metadata: symbol + color class used by the renderer. */
export const SUITS = {
  s: { symbol: '♠', name: 'spades', color: 'black' },
  h: { symbol: '♥', name: 'hearts', color: 'red' },
  d: { symbol: '♦', name: 'diamonds', color: 'red' },
  c: { symbol: '♣', name: 'clubs', color: 'black' },
};

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

/**
 * @typedef {Object} Card
 * @property {string} rank  One of RANKS (e.g. 'A', 'T', '9').
 * @property {string} suit  One of 's','h','d','c'.
 * @property {string} code  Two-char code, e.g. 'Ah'.
 */

/**
 * @typedef {Object} Seat
 * @property {number} seat        Seat number as printed by the site.
 * @property {string} name        Player username.
 * @property {number} stack       Starting stack in chips/currency units.
 * @property {Card[]} [holeCards] Known hole cards (hero, or shown at showdown).
 * @property {boolean} [isHero]   True for the importing player's seat.
 */

/**
 * @typedef {Object} Action
 * @property {string} street   One of STREETS.
 * @property {string} type     'post' | 'fold' | 'check' | 'call' | 'bet' |
 *                             'raise' | 'deal' | 'show' | 'muck' | 'collect' |
 *                             'uncalled'
 * @property {string} [player] Player username the action belongs to.
 * @property {number} [amount] Chips involved (delta added to pot for bets/calls).
 * @property {number} [to]     For raises: the total street commitment reached.
 * @property {boolean} [allIn] True when the action puts the player all-in.
 * @property {string} [subtype] For 'post': 'sb' | 'bb' | 'ante' | 'straddle'.
 * @property {Card[]} [cards]  For 'deal' (board) and 'show' (hole cards).
 */

/**
 * @typedef {Object} Hand
 * @property {string} handId
 * @property {string} site            e.g. 'PokerStars'.
 * @property {string} [date]          ISO-8601 timestamp when known.
 * @property {string} [tableName]
 * @property {string} [tableId]
 * @property {string} gameType        e.g. "Hold'em No Limit".
 * @property {string} [variant]       'holdem' | 'omaha' | ...
 * @property {number} [maxSeats]
 * @property {number} [smallBlind]
 * @property {number} [bigBlind]
 * @property {number} [ante]
 * @property {string} currency        'USD' | 'EUR' | 'GBP' | 'PLAY' | ...
 * @property {string} currencySymbol  '$' | '€' | '£' | ''.
 * @property {boolean} isTournament
 * @property {string} [tournamentId]
 * @property {string} [level]
 * @property {number} buttonSeat      Seat number of the dealer button.
 * @property {Seat[]} seats
 * @property {string} [hero]          Hero username.
 * @property {Action[]} actions       Full ordered action list across streets.
 * @property {Card[]} board           All community cards revealed (0..5).
 * @property {number} [totalPot]
 * @property {number} [rake]
 * @property {Object<string,number>} [winners]  player -> amount collected.
 * @property {number} [netResult]     Hero net (winnings - contributions).
 * @property {boolean} [incomplete]   True if parsing was partial.
 * @property {string[]} [warnings]    Non-fatal parse issues.
 * @property {string} rawText         Original hand-history text.
 * @property {string[]} [tags]
 * @property {string} [notes]
 */

/**
 * Format a chip amount for display. Cash games show 2 decimals with the
 * currency symbol; tournaments show whole-chip counts with thousands grouping.
 * @param {number} amount
 * @param {{currencySymbol?:string, isTournament?:boolean}} hand
 */
export function formatMoney(amount, hand = {}) {
  if (amount == null || !Number.isFinite(amount)) return '';
  const sym = hand.currencySymbol || '';
  if (hand.isTournament || !sym) {
    return Math.round(amount).toLocaleString('en-US');
  }
  return sym + amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Parse a two-char card code like 'Ah' into a Card, or null if invalid. */
export function parseCard(code) {
  if (!code || code.length < 2) return null;
  const rank = code[0].toUpperCase();
  const suit = code[1].toLowerCase();
  if (!RANKS.includes(rank) || !SUITS[suit]) return null;
  return { rank, suit, code: rank + suit };
}

/** Parse a bracketed card list like "Ah Kd 2c" into Card[]. */
export function parseCards(str) {
  if (!str) return [];
  return str
    .trim()
    .split(/\s+/)
    .map(parseCard)
    .filter(Boolean);
}
