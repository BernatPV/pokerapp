// Renders one replay frame onto the visual table: seats around an oval, hole
// cards, dealer/blind/all-in badges, chip piles, community cards and the pot.

import { formatMoney } from '../model/hand.js';
import { cardEl, cardEls } from './cards.js';

/** Even positions (percent of table box) around an ellipse, hero at the bottom. */
function ellipsePositions(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = Math.PI / 2 + (i * 2 * Math.PI) / n; // start at bottom-centre
    out.push({ x: 50 + 45 * Math.cos(a), y: 50 + 43 * Math.sin(a) });
  }
  return out;
}

/** Rotate the seat list so the hero sits first (bottom-centre). */
function heroFirst(players) {
  const i = players.findIndex((p) => p.isHero);
  return i <= 0 ? players : players.slice(i).concat(players.slice(0, i));
}

function lastActionText(p, hand) {
  const a = p.lastAction;
  if (!a) return '';
  const m = (x) => formatMoney(x, hand);
  switch (a.type) {
    case 'fold': return 'folds';
    case 'check': return 'checks';
    case 'call': return `calls ${m(a.amount)}`;
    case 'bet': return `bets ${m(a.amount)}`;
    case 'raise': return `raises to ${m(a.to)}`;
    case 'post': return `${a.subtype || 'posts'} ${m(a.amount)}`;
    case 'uncalled': return `+${m(a.amount)}`;
    default: return '';
  }
}

function badge(text, cls) {
  const b = document.createElement('span');
  b.className = `tag ${cls}`;
  b.textContent = text;
  return b;
}

/**
 * @param {{boardEl:HTMLElement, potEl:HTMLElement, seatsEl:HTMLElement}} els
 * @param {{hand:Object, frame:Object, actingPlayer?:string}} ctx
 */
export function renderTable(els, { hand, frame, actingPlayer, equity }) {
  const { boardEl, potEl, seatsEl } = els;

  // Community cards (with empty placeholders so the board keeps its footprint).
  boardEl.replaceChildren(...cardEls(frame.board));

  // Pot: live total = gathered pot + chips still in front of players.
  const committed = frame.players.reduce((s, p) => s + (p.committed || 0), 0);
  const live = frame.pot + committed;
  potEl.textContent = frame.done && hand.totalPot
    ? `Total pot ${formatMoney(hand.totalPot, hand)}`
    : `Pot ${formatMoney(live, hand)}`;

  // Seats + chip piles.
  seatsEl.replaceChildren();
  const ordered = heroFirst(frame.players);
  const pos = ellipsePositions(ordered.length);

  ordered.forEach((p, i) => {
    const { x, y } = pos[i];
    const seat = document.createElement('div');
    seat.className = 'seat';
    if (p.folded) seat.classList.add('folded');
    if (p.allIn) seat.classList.add('allin');
    if (p.name === actingPlayer) seat.classList.add('acting');
    if (frame.done && p.won > 0) seat.classList.add('winner');
    seat.style.left = `${x}%`;
    seat.style.top = `${y}%`;

    // Hole cards: face-up when known (hero, or shown at showdown), otherwise
    // face-down. Every seated player keeps a pair of cards so opponents are
    // always visible; folded seats are simply dimmed via the .folded class.
    const hole = document.createElement('div');
    hole.className = 'holecards';
    const known = p.holeCards && (p.isHero || p.revealed);
    if (known) {
      hole.append(...cardEls(p.holeCards, { small: true }));
    } else {
      const n = (p.holeCards && p.holeCards.length) || (hand.variant === 'omaha' ? 4 : 2);
      hole.append(...Array.from({ length: n }, () => cardEl(null, { small: true })));
    }

    const pod = document.createElement('div');
    pod.className = 'pod';
    const name = document.createElement('div');
    name.className = 'name';
    name.title = p.name;
    name.textContent = p.name;
    if (p.isHero) {
      const tag = document.createElement('span');
      tag.className = 'hero-tag';
      tag.textContent = 'YOU';
      name.append(' ', tag);
    }
    const stack = document.createElement('div');
    stack.className = 'stack';
    stack.textContent = p.allIn ? 'ALL-IN' : formatMoney(p.stack, hand);
    pod.append(name, stack);

    const badges = document.createElement('div');
    badges.className = 'badges';
    if (p.isButton) badges.append(badge('D', 'btn'));
    if (p.isSB) badges.append(badge('SB', 'sb'));
    if (p.isBB) badges.append(badge('BB', 'bb'));
    if (p.allIn) badges.append(badge('ALL-IN', 'allin'));

    const act = document.createElement('div');
    const a = p.lastAction;
    act.className = 'lastact' + (a ? ` ${a.type}` : '');
    act.textContent = lastActionText(p, hand);

    seat.append(hole, pod, badges, act);

    // Equity bar for showdown contestants on the current street (§6.1/6.3).
    if (equity && equity[p.name] != null) {
      const pct = Math.round(equity[p.name] * 100);
      const eq = document.createElement('div');
      eq.className = 'seat-eq';
      eq.title = 'Equity this street';
      eq.innerHTML = `<div class="seat-eq-bar"><span style="width:${pct}%"></span></div><span class="seat-eq-pct">${pct}%</span>`;
      seat.append(eq);
    }

    seatsEl.append(seat);

    // Chip pile drawn between the seat and the centre.
    if (p.committed > 0) {
      const chips = document.createElement('div');
      chips.className = 'chips';
      chips.textContent = formatMoney(p.committed, hand);
      chips.style.left = `${x + (50 - x) * 0.3}%`;
      chips.style.top = `${y + (50 - y) * 0.3}%`;
      seatsEl.append(chips);
    }
  });
}
