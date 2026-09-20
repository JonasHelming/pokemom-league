import assert from 'node:assert/strict';
import { computeRatingHistory } from '../src/history.js';

const matches = [
  { player1: 'A', deck1: 'x', player2: 'B', deck2: 'y', winner: 'A', date: '2026-01-03' },
  { player1: 'A', deck1: 'x', player2: 'B', deck2: 'y', winner: 'A', date: '2026-01-01' },
  { player1: 'A', deck1: 'x', player2: 'B', deck2: 'y', winner: 'B', date: '2026-01-02' },
];

const history = computeRatingHistory(matches, ['A', 'B'], ['x', 'y']);

assert.equal(history.length, 3);
assert.deepEqual(history.map((h) => h.date), ['2026-01-01', '2026-01-02', '2026-01-03']);
assert.ok(Number.isFinite(history[0].playerRatings.A));
assert.ok(Number.isFinite(history[0].playerRatings.B));
assert.ok(Number.isFinite(history[2].deckRatings.x));

console.log('OK: history.test.js');
