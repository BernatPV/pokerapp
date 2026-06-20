import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, detectCurrency, splitHands } from '../src/parser/util.js';
import { parseCard, parseCards, formatMoney } from '../src/model/hand.js';

test('parseMoney handles symbols, separators and trailing text', () => {
  assert.equal(parseMoney('$0.50'), 0.5);
  assert.equal(parseMoney('$1,234.50'), 1234.5);
  assert.equal(parseMoney('€1.234,50'), 1234.5);
  assert.equal(parseMoney('1500'), 1500);
  assert.equal(parseMoney('$1.00 USD'), 1);
  assert.equal(parseMoney('(2075)'), 2075);
  assert.ok(Number.isNaN(parseMoney('n/a')));
});

test('detectCurrency maps symbols, defaults to play money', () => {
  assert.deepEqual(detectCurrency('blinds $1/$2'), { symbol: '$', code: 'USD' });
  assert.deepEqual(detectCurrency('€5 buy-in'), { symbol: '€', code: 'EUR' });
  assert.deepEqual(detectCurrency('1500 chips'), { symbol: '', code: 'PLAY' });
});

test('parseCard / parseCards validate ranks and suits', () => {
  assert.deepEqual(parseCard('Ah'), { rank: 'A', suit: 'h', code: 'Ah' });
  assert.equal(parseCard('Zx'), null);
  assert.deepEqual(parseCards(' Js Tc ').map((c) => c.code), ['Js', 'Tc']);
});

test('formatMoney respects cash vs tournament style', () => {
  assert.equal(formatMoney(26.5, { currencySymbol: '$' }), '$26.50');
  assert.equal(formatMoney(2075, { isTournament: true }), '2,075');
});

test('splitHands separates multi-hand text by start marker', () => {
  const text = 'PokerStars Hand #1\na\n\nPokerStars Hand #2\nb\n\nPokerStars Hand #3\nc';
  const hands = splitHands(text, ['PokerStars']);
  assert.equal(hands.length, 3);
  assert.match(hands[1], /Hand #2/);
});
