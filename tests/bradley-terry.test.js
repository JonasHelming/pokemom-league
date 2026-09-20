import assert from 'node:assert/strict';
import { fitBradleyTerry, predictWinProbability, meanCenteredRatings, toEloScale } from '../src/bradley-terry.js';

// Balanced dataset: A/x and B/y trade wins evenly -> ratings should stay at 0.5/0.5.
const balancedMatches = [
  { player1: 'A', deck1: 'x', player2: 'B', deck2: 'y', winner: 'A', date: '2026-01-01' },
  { player1: 'A', deck1: 'x', player2: 'B', deck2: 'y', winner: 'B', date: '2026-01-02' },
  { player1: 'B', deck1: 'y', player2: 'A', deck2: 'x', winner: 'B', date: '2026-01-03' },
  { player1: 'B', deck1: 'y', player2: 'A', deck2: 'x', winner: 'A', date: '2026-01-04' },
];
const balancedFit = fitBradleyTerry(balancedMatches, ['A', 'B'], ['x', 'y']);
const balancedP = predictWinProbability(balancedFit, 'A', 'x', 'B', 'y');
assert.ok(Math.abs(balancedP - 0.5) < 1e-6, `expected ~0.5, got ${balancedP}`);

// Lopsided dataset: A/x beats B/y five times straight.
const lopsidedMatches = Array.from({ length: 5 }, (_, i) => ({
  player1: 'A', deck1: 'x', player2: 'B', deck2: 'y', winner: 'A', date: `2026-02-0${i + 1}`,
}));
const lopsidedFit = fitBradleyTerry(lopsidedMatches, ['A', 'B'], ['x', 'y']);
const lopsidedP = predictWinProbability(lopsidedFit, 'A', 'x', 'B', 'y');
assert.ok(lopsidedP > 0.7, `expected a strong A favorite, got ${lopsidedP}`);

const playerRatings = meanCenteredRatings(lopsidedFit, 'player', ['A', 'B']);
assert.ok(playerRatings.A.value > playerRatings.B.value, 'A should rate above B');
assert.ok(playerRatings.A.se > 0 && Number.isFinite(playerRatings.A.se), 'se should be a finite positive number');

assert.equal(toEloScale(0), 1000);

console.log('OK: bradley-terry.test.js');
