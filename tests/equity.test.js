import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCards } from '../src/model/hand.js';
import { evaluate, categoryName } from '../src/engine/evaluator.js';
import { computeEquity } from '../src/engine/equity.js';

const ev = (s) => evaluate(parseCards(s));
const near = (a, b, eps = 0.02) => Math.abs(a - b) <= eps;

test('evaluator orders the nine hand categories correctly', () => {
  const ranked = [
    'Ah Jc 9d 5s 2c', // high card
    '9c 9d 7h 5s 2c', // pair
    '9c 9d 5h 5s 2c', // two pair
    '9c 9d 9h 5s 2c', // trips
    '9c 8d 7h 6s 5c', // straight
    'Ah Jh 9h 5h 2h', // flush
    '9c 9d 9h 2s 2c', // full house
    '9c 9d 9h 9s 2c', // quads
    '9h 8h 7h 6h 5h', // straight flush
  ].map(ev);
  for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i] > ranked[i - 1], `rank ${i} should beat ${i - 1}`);
});

test('evaluator handles the wheel and kickers', () => {
  assert.ok(ev('6c 5d 4h 3s 2c') > ev('Ah 5c 4d 3s 2h'), '6-high straight beats the 5-high wheel');
  assert.ok(ev('Ah Kc Qd Js Tc') > ev('Kh Qc Jd Ts 9c'), 'Broadway beats K-high straight');
  assert.ok(ev('Ah Ad Kh Kd Qc') > ev('As Ac Ks Kc Jc'), 'two pair compares the kicker');
  assert.ok(ev('Ah Ad Kh Qd Jc') > ev('As Ac Ks Qs Tc'), 'one pair compares the last kicker');
});

test('evaluator picks the best 5 of 7 cards', () => {
  assert.equal(categoryName(evaluate(parseCards('9c 9d 9h 2s 2c 5h 7d'))), 'Full House');
  assert.equal(categoryName(evaluate(parseCards('Ah Kh Qh Jh Th 2c 3d'))), 'Straight Flush');
});

test('equity: completed board splits a tie and awards a winner exactly', () => {
  const tie = computeEquity(
    [{ name: 'A', cards: parseCards('2c 2d') }, { name: 'B', cards: parseCards('3c 3d') }],
    parseCards('As Ks Qs Js Ts'), // royal on board -> both play it
  );
  assert.ok(tie[0].exact);
  assert.ok(near(tie[0].equity, 0.5) && near(tie[1].equity, 0.5));

  const win = computeEquity(
    [{ name: 'A', cards: parseCards('Ah Ad') }, { name: 'B', cards: parseCards('7c 2d') }],
    parseCards('As Kd Qc Jh 9s'),
  );
  assert.equal(win[0].equity, 1);
  assert.equal(win[1].equity, 0);
});

test('equity: flop is enumerated exactly and a set crushes an overpair', () => {
  const r = computeEquity(
    [{ name: 'AA', cards: parseCards('Ah Ad') }, { name: 'KK', cards: parseCards('Kc Ks') }],
    parseCards('Kh 7d 2c'), // KK flopped a set
  );
  assert.ok(r[0].exact, 'flop runouts are enumerated');
  assert.ok(r[1].equity > 0.85, `set of kings should be a big favorite (got ${r[1].equity})`);
  assert.ok(near(r[0].equity + r[1].equity, 1));
});

test('equity: preflop matchups match known values (seeded Monte-Carlo)', () => {
  const aaKk = computeEquity(
    [{ name: 'AA', cards: parseCards('Ah Ad') }, { name: 'KK', cards: parseCards('Kc Ks') }],
    [], { samples: 20000, seed: 1 },
  );
  assert.ok(!aaKk[0].exact, 'preflop falls back to Monte-Carlo');
  assert.ok(aaKk[0].equity > 0.79 && aaKk[0].equity < 0.84, `AA vs KK ~82% (got ${aaKk[0].equity})`);
  assert.ok(near(aaKk[0].equity + aaKk[1].equity, 1, 0.001));

  const qqAk = computeEquity(
    [{ name: 'QQ', cards: parseCards('Qc Qd') }, { name: 'AKs', cards: parseCards('Ah Kh') }],
    [], { samples: 20000, seed: 7 },
  );
  assert.ok(qqAk[0].equity > 0.5 && qqAk[0].equity < 0.58, `QQ vs AKs ~54% (got ${qqAk[0].equity})`);
});
