// SVG-free card renderer: crisp CSS cards with rank + colored suit symbol.
import { SUITS } from '../model/hand.js';

const DISPLAY_RANK = { T: '10' };
const RANK_WORD = { A: 'ace', K: 'king', Q: 'queen', J: 'jack', T: 'ten' };

/**
 * Build a card element.
 * @param {import('../model/hand.js').Card|null} card
 * @param {{faceDown?:boolean, small?:boolean}} [opts]
 */
export function cardEl(card, opts = {}) {
  const div = document.createElement('div');
  const size = opts.small ? ' small' : '';
  if (opts.faceDown || !card) {
    div.className = 'card back' + size;
    div.setAttribute('aria-label', 'face-down card');
    return div;
  }
  const suit = SUITS[card.suit];
  div.className = `card ${suit.color}${size}`;
  div.setAttribute('aria-label', `${RANK_WORD[card.rank] || card.rank} of ${suit.name}`);
  div.innerHTML =
    `<span class="rank">${DISPLAY_RANK[card.rank] || card.rank}</span>` +
    `<span class="suit">${suit.symbol}</span>`;
  return div;
}

/** Convenience: an array of card elements for a list of cards. */
export function cardEls(cards, opts) {
  return (cards || []).map((c) => cardEl(c, opts));
}
