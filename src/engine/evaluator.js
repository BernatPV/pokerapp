// Texas Hold'em hand evaluator. Pure & DOM-free for Node testing.
// evaluate(cards) returns an integer score where higher is strictly better;
// scores are comparable across any two hands. Works on 5–7 cards (best 5).

const RANK_VALUE = {
  2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9,
  T: 10, J: 11, Q: 12, K: 13, A: 14,
};

export const CATEGORY_NAMES = [
  'High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight',
  'Flush', 'Full House', 'Four of a Kind', 'Straight Flush',
];

/** Score a 5-card hand. */
function score5(cards) {
  const vs = cards.map((c) => RANK_VALUE[c.rank]).sort((a, b) => b - a);
  const suit = cards[0].suit;
  const isFlush = cards.every((c) => c.suit === suit);

  // Straight detection (with the 5-high wheel: A-2-3-4-5).
  const uniq = [...new Set(vs)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (vs[0] - vs[4] === 4) straightHigh = vs[0];
    else if (vs[0] === 14 && vs[1] === 5 && vs[2] === 4 && vs[3] === 3 && vs[4] === 2) straightHigh = 5;
  }

  // Rank multiplicities, sorted by count desc then rank desc.
  const counts = new Map();
  for (const v of vs) counts.set(v, (counts.get(v) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const countShape = groups.map((g) => g[1]); // e.g. [4,1] or [2,2,1]
  const ranksByGroup = groups.map((g) => g[0]);

  let category;
  let tb;
  if (isFlush && straightHigh) { category = 8; tb = [straightHigh]; }
  else if (countShape[0] === 4) { category = 7; tb = ranksByGroup; }
  else if (countShape[0] === 3 && countShape[1] === 2) { category = 6; tb = ranksByGroup; }
  else if (isFlush) { category = 5; tb = vs; }
  else if (straightHigh) { category = 4; tb = [straightHigh]; }
  else if (countShape[0] === 3) { category = 3; tb = ranksByGroup; }
  else if (countShape[0] === 2 && countShape[1] === 2) { category = 2; tb = ranksByGroup; }
  else if (countShape[0] === 2) { category = 1; tb = ranksByGroup; }
  else { category = 0; tb = vs; }

  // Encode category + up to 5 tiebreaker ranks into one comparable integer.
  let s = category;
  for (let i = 0; i < 5; i++) s = s * 15 + (tb[i] || 0);
  return s;
}

/** Index combinations of size k from [0..n). */
function* indexCombos(n, k) {
  const idx = Array.from({ length: k }, (_, i) => i);
  while (true) {
    yield idx;
    let i = k - 1;
    while (i >= 0 && idx[i] === n - k + i) i--;
    if (i < 0) return;
    idx[i]++;
    for (let j = i + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
  }
}

/**
 * Evaluate the best 5-card hand from 5–7 cards.
 * @param {{rank:string,suit:string}[]} cards
 * @returns {number} comparable score (higher is better)
 */
export function evaluate(cards) {
  if (cards.length < 5) return 0;
  if (cards.length === 5) return score5(cards);
  let best = 0;
  const five = new Array(5);
  for (const idx of indexCombos(cards.length, 5)) {
    for (let i = 0; i < 5; i++) five[i] = cards[idx[i]];
    const s = score5(five);
    if (s > best) best = s;
  }
  return best;
}

/** Human-readable category for a score (e.g. "Two Pair"). */
export function categoryName(score) {
  return CATEGORY_NAMES[Math.floor(score / 759375)] || 'High Card';
}
