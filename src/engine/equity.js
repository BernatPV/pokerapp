// All-in / showdown equity calculator for Texas Hold'em. Pure & DOM-free.
// Exact enumeration of remaining runouts when the count is small; seeded
// Monte-Carlo sampling otherwise (deterministic given a seed, for testable UI).

import { RANKS, SUITS } from '../model/hand.js';
import { evaluate } from './evaluator.js';

const FULL_DECK = [];
for (const r of RANKS) for (const s of Object.keys(SUITS)) FULL_DECK.push({ rank: r, suit: s, code: r + s });

/** Deterministic PRNG so Monte-Carlo results are reproducible. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Number of k-combinations of n (used to decide enumerate vs sample). */
function choose(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
}

/** Generate every k-combination of an array. */
function* kCombos(arr, k, start = 0, combo = []) {
  if (combo.length === k) { yield combo; return; }
  for (let i = start; i <= arr.length - (k - combo.length); i++) {
    combo.push(arr[i]);
    yield* kCombos(arr, k, i + 1, combo);
    combo.pop();
  }
}

/** Pick k distinct cards from deck using a partial Fisher–Yates shuffle. */
function sampleK(deck, k, rng, scratch) {
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rng() * (deck.length - i));
    const tmp = scratch[i]; scratch[i] = scratch[j]; scratch[j] = tmp;
  }
  return scratch.slice(0, k);
}

/**
 * Compute each player's equity (win share, ties split fractionally).
 * @param {{name:string, cards:{rank:string,suit:string}[]}[]} hands  2-card hands
 * @param {{rank:string,suit:string}[]} [board]  0–5 community cards
 * @param {{samples?:number, seed?:number, enumLimit?:number}} [opts]
 * @returns {{name:string, equity:number, exact:boolean, runouts:number}[]}
 */
export function computeEquity(hands, board = [], opts = {}) {
  const used = new Set();
  for (const h of hands) for (const c of h.cards) used.add(c.code);
  for (const c of board) used.add(c.code);
  const deck = FULL_DECK.filter((c) => !used.has(c.code));
  const need = 5 - board.length;

  const points = new Array(hands.length).fill(0);
  let total = 0;
  const tally = (full) => {
    let best = -1;
    const scores = hands.map((h) => evaluate([...h.cards, ...full]));
    for (const s of scores) if (s > best) best = s;
    let winners = 0;
    for (const s of scores) if (s === best) winners++;
    const share = 1 / winners;
    for (let i = 0; i < scores.length; i++) if (scores[i] === best) points[i] += share;
    total++;
  };

  if (need <= 0) {
    tally(board);
  } else {
    const combos = choose(deck.length, need);
    const enumLimit = opts.enumLimit ?? 200000;
    if (combos <= enumLimit) {
      for (const extra of kCombos(deck, need)) tally([...board, ...extra]);
    } else {
      const samples = opts.samples ?? 10000;
      const rng = mulberry32(opts.seed ?? 0x9e3779b9);
      const scratch = deck.slice();
      for (let t = 0; t < samples; t++) tally([...board, ...sampleK(deck, need, rng, scratch)]);
    }
  }

  const exact = need <= 0 || choose(deck.length, need) <= (opts.enumLimit ?? 200000);
  return hands.map((h, i) => ({
    name: h.name,
    equity: total ? points[i] / total : 0,
    exact,
    runouts: total,
  }));
}
