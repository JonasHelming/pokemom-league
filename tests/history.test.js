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

// deckMatchCounts should be cumulative, per deck, as of each snapshot.
assert.deepEqual(history[0].deckMatchCounts, { x: 1, y: 1 });
assert.deepEqual(history[2].deckMatchCounts, { x: 3, y: 3 });

// Rebuild scenario: deck y gets rebuilt into y-1 partway through the
// timeline (decks param is optional and defaults to [] for the case above).
// y-1's own match count should track independently of y's, from zero.
const rebuildDecks = [{ id: 'x' }, { id: 'y' }, { id: 'y-1', predecessor: 'y' }];
const rebuildMatches = [
  { player1: 'A', deck1: 'x', player2: 'B', deck2: 'y', winner: 'A', date: '2026-02-01' },
  { player1: 'A', deck1: 'x', player2: 'B', deck2: 'y', winner: 'B', date: '2026-02-02' },
  { player1: 'A', deck1: 'x', player2: 'B', deck2: 'y-1', winner: 'A', date: '2026-02-03' },
];
const rebuildHistory = computeRatingHistory(rebuildMatches, ['A', 'B'], ['x', 'y', 'y-1'], rebuildDecks);
assert.deepEqual(rebuildHistory[1].deckMatchCounts, { x: 2, y: 2, 'y-1': 0 });
assert.deepEqual(rebuildHistory[2].deckMatchCounts, { x: 3, y: 2, 'y-1': 1 });
assert.ok(Number.isFinite(rebuildHistory[2].deckRatings['y-1']));

console.log('OK: history.test.js');
