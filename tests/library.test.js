import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handMatches, filterHands, sessionKey, allSessionKeys } from '../src/ui/handlist.js';

const mk = (over = {}) => ({
  handId: '1', site: 'PokerStars', gameType: "Hold'em No Limit", tableName: 'T1',
  date: '2021-05-04T12:00:00', seats: [{ name: 'Alice' }, { name: 'Bob' }],
  tags: [], notes: '', ...over,
});

test('handMatches searches ids, players, tags and notes (case-insensitive)', () => {
  assert.ok(handMatches(mk(), 'alice'));
  assert.ok(handMatches(mk({ tags: ['Bluff'] }), 'bluff'));
  assert.ok(handMatches(mk({ notes: 'sick cooler' }), 'cooler'));
  assert.ok(handMatches(mk({ handId: '99887' }), '99887'));
  assert.ok(!handMatches(mk(), 'zzz'));
  assert.ok(handMatches(mk(), '')); // empty query matches all
});

test('filterHands combines marked-only, date range and text', () => {
  const hands = [
    mk({ handId: 'a', marked: true, date: '2021-05-04T10:00:00' }),
    mk({ handId: 'b', marked: false, date: '2021-05-06T10:00:00' }),
    mk({ handId: 'c', marked: true, date: '2021-05-08T10:00:00', tags: ['study'] }),
  ];
  assert.deepEqual(filterHands(hands, { markedOnly: true }).map((h) => h.handId), ['a', 'c']);
  assert.deepEqual(filterHands(hands, { from: '2021-05-06' }).map((h) => h.handId), ['b', 'c']);
  assert.deepEqual(filterHands(hands, { to: '2021-05-06' }).map((h) => h.handId), ['a', 'b']);
  assert.deepEqual(filterHands(hands, { from: '2021-05-05', to: '2021-05-07' }).map((h) => h.handId), ['b']);
  assert.deepEqual(filterHands(hands, { markedOnly: true, query: 'study' }).map((h) => h.handId), ['c']);
});

test('sessionKey groups by table+day for cash and by tournament id', () => {
  const a = mk({ tableName: 'Vega', date: '2021-05-04T10:00:00' });
  const b = mk({ tableName: 'Vega', date: '2021-05-04T23:00:00' });
  const c = mk({ tableName: 'Vega', date: '2021-05-05T10:00:00' });
  assert.equal(sessionKey(a), sessionKey(b), 'same table + day = one session');
  assert.notEqual(sessionKey(a), sessionKey(c), 'next day = new session');

  const t1 = mk({ isTournament: true, tournamentId: '555', tableName: 'A 1' });
  const t2 = mk({ isTournament: true, tournamentId: '555', tableName: 'A 2' });
  assert.equal(sessionKey(t1), sessionKey(t2), 'same tournament across tables = one session');

  assert.equal(allSessionKeys([a, b, c]).length, 2);
});
