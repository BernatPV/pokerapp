import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parsePokerStars } from '../src/parser/pokerstars.js';
import { buildFrames } from '../src/engine/replay.js';

const here = dirname(fileURLToPath(import.meta.url));
const sample = (name) => readFileSync(join(here, 'samples', name), 'utf8');
const codes = (cards) => (cards || []).map((c) => c.code);
const last = (arr) => arr[arr.length - 1];
const playerIn = (frame, name) => frame.players.find((p) => p.name === name);

test('cash 6-max: full header, seats, board and result', () => {
  const h = parsePokerStars(sample('cash_6max.txt'));
  assert.equal(h.handId, '243490149047');
  assert.equal(h.site, 'PokerStars');
  assert.equal(h.gameType, "Hold'em No Limit");
  assert.equal(h.variant, 'holdem');
  assert.equal(h.smallBlind, 0.5);
  assert.equal(h.bigBlind, 1);
  assert.equal(h.currency, 'USD');
  assert.equal(h.currencySymbol, '$');
  assert.equal(h.date, '2021-05-04T12:30:00');
  assert.equal(h.tableName, 'Andromeda');
  assert.equal(h.maxSeats, 6);
  assert.equal(h.buttonSeat, 1);
  assert.equal(h.seats.length, 6);
  assert.equal(h.hero, 'Hero');
  assert.deepEqual(codes(h.seats.find((s) => s.isHero).holeCards), ['Ah', 'Kd']);
  assert.deepEqual(codes(h.board), ['Th', '7c', '2d', 'Ks', 'Ad']);
  assert.equal(h.totalPot, 27.5);
  assert.equal(h.rake, 1);
  assert.equal(h.winners.Hero, 26.5);
  assert.equal(h.netResult, 13.5);
  assert.ok(!h.incomplete);
});

test('cash 6-max: engine frames track stacks, pot and street jumps', () => {
  const h = parsePokerStars(sample('cash_6max.txt'));
  const { frames, steps, streetStarts } = buildFrames(h);
  assert.equal(frames.length, steps.length + 1);
  // Hero finishes up 13.5 from a starting stack of 100.
  assert.equal(playerIn(last(frames), 'Hero').stack, 113.5);
  // Folded villains are flagged.
  assert.equal(playerIn(last(frames), 'UTGPlayer').folded, true);
  // Streets that exist get jump targets; showdown (villain folded) does not.
  assert.ok('preflop' in streetStarts);
  assert.ok('flop' in streetStarts);
  assert.ok('turn' in streetStarts);
  assert.ok('river' in streetStarts);
  assert.ok(!('showdown' in streetStarts));
  // Jumping to the flop shows exactly three board cards.
  assert.equal(frames[streetStarts.flop].board.length, 3);
});

test('all-in with side pot: winners and final stack', () => {
  const h = parsePokerStars(sample('allin_sidepot.txt'));
  assert.equal(h.winners.Hero, 132);
  assert.equal(h.netResult, 82);
  assert.deepEqual(codes(h.board), ['Ac', '7c', '2d', 'Kd', '3s']);
  // Shown villain cards are captured.
  assert.deepEqual(codes(h.seats.find((s) => s.name === 'ButtonGuy').holeCards), ['Qh', 'Qd']);
  const { frames } = buildFrames(h);
  assert.equal(playerIn(last(frames), 'Hero').stack, 132); // 50 start + 82 net
  assert.equal(playerIn(last(frames), 'Hero').allIn, true);
});

test('tournament with antes: header, blinds and net', () => {
  const h = parsePokerStars(sample('tournament_antes.txt'));
  assert.equal(h.isTournament, true);
  assert.equal(h.tournamentId, '2837640872');
  assert.equal(h.gameType, "Hold'em No Limit");
  assert.equal(h.level, 'V');
  assert.equal(h.smallBlind, 75);
  assert.equal(h.bigBlind, 150);
  assert.equal(h.ante, 20);
  assert.equal(h.maxSeats, 9);
  assert.equal(h.buttonSeat, 4);
  assert.equal(h.winners.Hero, 2075);
  assert.equal(h.netResult, 1105);
  const { frames } = buildFrames(h);
  assert.equal(playerIn(last(frames), 'Hero').stack, 7105); // 6000 + 1105
});

test('Omaha PLO: variant and four hole cards', () => {
  const h = parsePokerStars(sample('omaha_plo.txt'));
  assert.equal(h.variant, 'omaha');
  assert.equal(h.gameType, 'Omaha Pot Limit');
  assert.deepEqual(codes(h.seats.find((s) => s.isHero).holeCards), ['Ah', 'Kh', 'Qs', 'Js']);
  assert.equal(h.winners.Hero, 9.5);
  assert.equal(h.netResult, 4.75);
});

test('real-world EUR format: BOM, € stakes, status lines, double BB post', () => {
  const h = parsePokerStars(sample('cash_real_format.txt'));
  assert.equal(h.handId, '999000111');
  assert.equal(h.currency, 'EUR');
  assert.equal(h.currencySymbol, '€');
  assert.equal(h.smallBlind, 0.02);
  assert.equal(h.bigBlind, 0.05);
  assert.equal(h.maxSeats, 6);
  assert.equal(h.buttonSeat, 5);
  assert.equal(h.seats.length, 6);
  assert.equal(h.date, '2026-04-27T18:49:54'); // first (CET) timestamp, not the [ET] one
  assert.equal(h.hero, 'HeroEU');
  assert.deepEqual(codes(h.seats.find((s) => s.isHero).holeCards), ['Ac', '4d']);
  assert.equal(h.totalPot, 0.35);
  assert.equal(h.rake, 0.02);
  assert.equal(h.winners.HeroEU, 0.33);
  assert.equal(h.netResult, 0.18);
  // "sits out" / "doesn't show hand" are recognized, not flagged as unparsed.
  assert.equal(h.warnings.length, 0, h.warnings.join('; '));
  const heroStack = playerIn(last(buildFrames(h).frames), 'HeroEU').stack;
  assert.equal(Math.round(heroStack * 100) / 100, 5.18); // 5 + 0.18
});

test('no data is silently dropped: clean hands carry no warnings', () => {
  for (const f of ['cash_6max.txt', 'allin_sidepot.txt', 'tournament_antes.txt', 'omaha_plo.txt']) {
    const h = parsePokerStars(sample(f));
    assert.equal(h.warnings.length, 0, `${f} produced warnings: ${h.warnings.join('; ')}`);
  }
});
