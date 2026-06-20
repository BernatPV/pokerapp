// Integration test: runs the actual index.html + app.js in a real DOM (jsdom),
// drives it the way a user does, and asserts the table actually renders and the
// controls work. This is the path that pure-module tests cannot cover.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push(e.message || String(e)));

const dom = new JSDOM(readFileSync(join(root, 'index.html'), 'utf8'), {
  url: 'http://localhost:8080/',
  virtualConsole: vc,
});
const { window } = dom;
Object.assign(globalThis, {
  window,
  document: window.document,
  localStorage: window.localStorage,
  FileReader: window.FileReader,
  Event: window.Event,
  confirm: () => true,
});
window.HTMLElement.prototype.scrollIntoView = () => {};

const $ = (id) => window.document.getElementById(id);
const seats = () => [...window.document.querySelectorAll('#seats .seat')];
const chips = () => [...window.document.querySelectorAll('#seats .chips')];

// Boot the real app, then import a bundled hand through the paste box + button.
await import('../src/ui/app.js');
$('paste').value = readFileSync(join(here, 'samples', 'cash_6max.txt'), 'utf8');
$('btn-parse').click();

test('selecting a hand renders every seat with a formatted stack and pot', () => {
  assert.equal(seats().length, 6, 'all six opponents/hero seats render');
  assert.match($('pot').textContent, /\$/, 'pot shows currency');
  for (const s of seats()) {
    assert.match(s.querySelector('.stack').textContent, /\$/, 'stack shows currency');
    assert.ok(s.querySelectorAll('.holecards .card').length >= 2, 'seat shows cards');
  }
  assert.match($('step-counter').textContent, /^0 \/ \d+$/);
  assert.ok(window.document.querySelectorAll('#action-log .log-item').length > 0);
});

test('forward / end controls advance the replay', () => {
  $('btn-next').click();
  assert.match($('step-counter').textContent, /^1 \/ \d+$/, 'next advances one step');
  $('btn-end').click();
  const [, cur, total] = $('step-counter').textContent.match(/^(\d+) \/ (\d+)$/);
  assert.equal(cur, total, 'end jumps to last step');
  assert.match($('pot').textContent, /\$/);
});

test('a bet chip pile renders at some point in the hand', () => {
  $('btn-start').click();
  assert.match($('step-counter').textContent, /^0 \//);
  const total = Number($('step-counter').textContent.split('/')[1]);
  let found = false;
  for (let i = 0; i < total && !found; i++) {
    $('btn-next').click();
    if (chips().length) found = true;
  }
  assert.ok(found, 'a chip pile (committed bet) should appear mid-hand');
});

test('a showdown hand renders the equity panel and per-seat equity bars', () => {
  $('paste').value = readFileSync(join(here, 'samples', 'allin_sidepot.txt'), 'utf8');
  $('btn-parse').click(); // imports and auto-selects it
  assert.equal($('equity').hidden, false, 'equity panel is shown at showdown');
  assert.ok($('equity').querySelector('.eq-table'), 'equity table rendered');
  const names = [...$('equity').querySelectorAll('.eq-name')].map((n) => n.textContent);
  assert.ok(names.length >= 2, `expected >=2 contestants, got ${names.join(',')}`);
  $('btn-start').click(); // preflop: contestants have equity at this street
  const bars = window.document.querySelectorAll('#seats .seat-eq');
  assert.ok(bars.length >= 2, `per-seat equity bars render (got ${bars.length})`);
});

test('a call shows a pot-odds note in the action feed', () => {
  const notes = [...window.document.querySelectorAll('#action-log .note')].map((n) => n.textContent);
  assert.ok(notes.some((t) => /Pot odds \d+%/.test(t)), `expected a pot-odds note, got ${notes.join(' | ')}`);
});

test('no DOM errors were thrown during the whole interaction', () => {
  assert.deepEqual(errors, [], `jsdom errors: ${errors.join(' | ')}`);
});
