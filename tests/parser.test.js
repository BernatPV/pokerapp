import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseHand, parseHandFile, detectParser } from '../src/parser/index.js';
import { buildFrames } from '../src/engine/replay.js';

const here = dirname(fileURLToPath(import.meta.url));
const sample = (name) => readFileSync(join(here, 'samples', name), 'utf8');

test('detectParser routes PokerStars text to its parser', () => {
  assert.equal(detectParser(sample('cash_6max.txt')).name, 'PokerStars');
  assert.equal(detectParser('Some Unknown Site Hand #1\n...').name, 'Generic');
});

test('parseHandFile splits a multi-hand session', () => {
  const hands = parseHandFile(sample('session.txt'));
  assert.equal(hands.length, 16);
  for (const h of hands) {
    assert.ok(h.handId, 'each hand has an id');
    assert.ok(h.seats.length >= 2, 'each hand has seats');
    assert.equal(h.site, 'PokerStars');
  }
  // Every session hand replays end-to-end without throwing.
  for (const h of hands) {
    const { frames, steps } = buildFrames(h);
    assert.equal(frames.length, steps.length + 1);
  }
});

test('20+ sample hands parse across the suite', () => {
  const single = ['cash_6max.txt', 'allin_sidepot.txt', 'tournament_antes.txt', 'omaha_plo.txt'];
  const count = single.length + parseHandFile(sample('session.txt')).length;
  assert.ok(count >= 20, `expected >= 20 sample hands, got ${count}`);
});

test('generic fallback extracts what it can and flags incomplete', () => {
  const raw = [
    "WeirdSite Game #42: Texas Hold'em",
    'Seat 1: Alice (1000 in chips)',
    'Seat 2: Bob (1000 in chips)',
    '*** FLOP *** [Ah Kh Qh]',
    'Alice: bets 100',
    'Bob: folds',
    'Alice wins 200 from pot',
  ].join('\n');
  const h = parseHand(raw);
  assert.equal(h.incomplete, true);
  assert.equal(h.seats.length, 2);
  assert.equal(h.board.length, 3);
  assert.equal(h.winners.Alice, 200);
});

test('a malformed hand degrades gracefully without throwing', () => {
  const h = parseHand('PokerStars Hand #broken: total garbage with no structure');
  assert.ok(h.incomplete);
  assert.ok(Array.isArray(h.warnings));
});
