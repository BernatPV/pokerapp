// Replay engine: turn a parsed Hand into an array of immutable state snapshots,
// one per step, so the UI can step forward/back or jump to any point in O(1).
//
//   frames[0]          = initial table (blinds not yet posted)
//   frames[k]          = table state after applying steps[k-1]
//   frames.length      = steps.length + 1
//
// Chip model: `committed` is what a player has put in front of them on the
// current street; `pot` is everything gathered from completed streets. When a
// street ends (next card dealt / showdown / payout) the front chips sweep in.

import { formatMoney } from '../model/hand.js';

const CARD = (c) => `${c.rank}${suitSym(c.suit)}`;
function suitSym(s) {
  return { s: '♠', h: '♥', d: '♦', c: '♣' }[s] || s;
}

function initialState(hand) {
  const sbSeat = firstPostSeat(hand, 'sb');
  const bbSeat = firstPostSeat(hand, 'bb');
  return {
    players: hand.seats.map((seat) => ({
      seat: seat.seat,
      name: seat.name,
      startStack: seat.stack,
      stack: seat.stack,
      committed: 0,
      totalCommitted: 0,
      folded: false,
      allIn: false,
      revealed: !!(seat.isHero && seat.holeCards),
      mucked: false,
      holeCards: seat.isHero ? seat.holeCards || null : null,
      isHero: !!seat.isHero,
      isButton: seat.seat === hand.buttonSeat,
      isSB: seat.seat === sbSeat,
      isBB: seat.seat === bbSeat,
      lastAction: null,
    })),
    board: [],
    pot: 0,
    street: 'preflop',
    done: false,
  };
}

function firstPostSeat(hand, subtype) {
  const post = hand.actions.find((a) => a.type === 'post' && a.subtype === subtype);
  if (!post) return null;
  const seat = hand.seats.find((s) => s.name === post.player);
  return seat ? seat.seat : null;
}

/** Move all street commitments into the central pot. */
function sweep(state) {
  for (const p of state.players) {
    if (p.committed) {
      state.pot += p.committed;
      p.committed = 0;
    }
  }
}

/** Apply one action to a cloned state and return it. */
function applyAction(prev, action, hand) {
  const state = structuredClone(prev);
  const P = (name) => state.players.find((p) => p.name === name);
  const amt = Number.isFinite(action.amount) ? action.amount : 0;

  switch (action.type) {
    case 'post': {
      const p = P(action.player);
      if (!p) break;
      p.stack -= amt;
      p.totalCommitted += amt;
      if (action.subtype === 'ante') state.pot += amt; // antes go straight to the pot
      else p.committed += amt;
      if (p.stack <= 0) { p.stack = 0; p.allIn = true; }
      p.lastAction = { type: 'post', subtype: action.subtype, amount: amt };
      break;
    }
    case 'fold': {
      const p = P(action.player);
      if (p) { p.folded = true; p.lastAction = { type: 'fold' }; }
      break;
    }
    case 'check': {
      const p = P(action.player);
      if (p) p.lastAction = { type: 'check' };
      break;
    }
    case 'call':
    case 'bet': {
      const p = P(action.player);
      if (!p) break;
      p.stack -= amt;
      p.committed += amt;
      p.totalCommitted += amt;
      if (action.allIn || p.stack <= 0) { p.stack = Math.max(0, p.stack); p.allIn = true; }
      p.lastAction = { type: action.type, amount: amt };
      break;
    }
    case 'raise': {
      const p = P(action.player);
      if (!p) break;
      const to = Number.isFinite(action.to) ? action.to : p.committed + amt;
      const add = to - p.committed;
      p.stack -= add;
      p.committed = to;
      p.totalCommitted += add;
      if (action.allIn || p.stack <= 0) { p.stack = Math.max(0, p.stack); p.allIn = true; }
      p.lastAction = { type: 'raise', amount: add, to };
      break;
    }
    case 'uncalled': {
      const p = P(action.player);
      if (!p) break;
      p.stack += amt;
      p.committed -= amt;
      p.totalCommitted -= amt;
      p.lastAction = { type: 'uncalled', amount: amt };
      break;
    }
    case 'deal': {
      sweep(state);
      state.board = state.board.concat(action.cards || []);
      state.street = action.street;
      break;
    }
    case 'show': {
      sweep(state);
      state.street = 'showdown';
      const p = P(action.player);
      if (p) {
        if (action.cards && action.cards.length) p.holeCards = action.cards;
        p.revealed = true;
      }
      break;
    }
    case 'muck': {
      const p = P(action.player);
      if (p) p.mucked = true;
      break;
    }
    case 'collect': {
      sweep(state);
      const p = P(action.player);
      if (p) {
        p.stack += amt;
        p.won = (p.won || 0) + amt;
      }
      state.pot = Math.max(0, state.pot - amt);
      break;
    }
    default:
      break;
  }
  return state;
}

/** Human-readable action-log line + style hint for one step. */
function describe(action, hand) {
  const m = (x) => formatMoney(x, hand);
  switch (action.type) {
    case 'post': {
      const label = { sb: 'small blind', bb: 'big blind', ante: 'ante', straddle: 'straddle' }[action.subtype] || 'blind';
      return { kind: 'post', text: `${action.player} posts ${label} ${m(action.amount)}` };
    }
    case 'fold': return { kind: 'fold', text: `${action.player} folds` };
    case 'check': return { kind: 'check', text: `${action.player} checks` };
    case 'call': return { kind: 'call', text: `${action.player} calls ${m(action.amount)}${action.allIn ? ' and is all-in' : ''}` };
    case 'bet': return { kind: 'bet', text: `${action.player} bets ${m(action.amount)}${action.allIn ? ' and is all-in' : ''}` };
    case 'raise': return { kind: 'raise', text: `${action.player} raises to ${m(action.to)}${action.allIn ? ' and is all-in' : ''}` };
    case 'uncalled': return { kind: 'info', text: `Uncalled ${m(action.amount)} returned to ${action.player}` };
    case 'deal': {
      const names = { flop: 'Flop', turn: 'Turn', river: 'River' }[action.street] || 'Deal';
      return { kind: 'street', text: `${names}: ${(action.cards || []).map(CARD).join(' ')}` };
    }
    case 'show': return { kind: 'show', text: `${action.player} shows ${(action.cards || []).map(CARD).join(' ')}` };
    case 'muck': return { kind: 'info', text: `${action.player} mucks` };
    case 'collect': return { kind: 'collect', text: `${action.player} wins ${m(action.amount)}` };
    default: return { kind: 'info', text: action.type };
  }
}

/**
 * Build the full replay for a hand.
 * @param {import('../model/hand.js').Hand} hand
 * @returns {{frames:Object[], steps:Object[], streetStarts:Object<string,number>}}
 */
export function buildFrames(hand) {
  const frames = [initialState(hand)];
  const steps = [];
  for (const action of hand.actions) {
    const { text, kind } = describe(action, hand);
    steps.push({ action, street: action.street, player: action.player, text, kind, type: action.type });
    frames.push(applyAction(frames[frames.length - 1], action, hand));
  }
  if (frames.length) frames[frames.length - 1].done = true;

  // Pot-odds note on each call: callAmount / (pot already there + callAmount).
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.type !== 'call' || !Number.isFinite(s.action.amount) || s.action.amount <= 0) continue;
    const before = frames[i];
    const livePot = before.pot + before.players.reduce((a, p) => a + p.committed, 0);
    const call = s.action.amount;
    const pct = Math.round((call / (livePot + call)) * 100);
    s.note = `Pot odds ${pct}% — need ${pct}%+ equity to call`;
  }

  return { frames, steps, streetStarts: computeStreetStarts(steps) };
}

/** Frame index to land on when jumping to each street that exists. */
function computeStreetStarts(steps) {
  const starts = {};
  // Preflop: right after the last forced post (blinds in, first decision up).
  let lastPost = -1;
  steps.forEach((s, i) => { if (s.type === 'post') lastPost = i; });
  starts.preflop = lastPost + 1; // frame index after that step (0 if no posts)

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    if (s.type === 'deal' && !(s.street in starts && s.street !== 'preflop')) {
      starts[s.street] = i + 1; // frame after the card is dealt
    }
    // A showdown only "exists" when cards are actually shown, not merely when a
    // pot is collected (e.g. everyone folded to the last aggressor).
    if (s.type === 'show' && !('showdown' in starts)) {
      starts.showdown = i + 1;
    }
  }
  return starts;
}
