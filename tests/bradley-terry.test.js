import assert from 'node:assert/strict';
import { fitBradleyTerry, predictWinProbability, meanCenteredRatings, combinedPlayerDeckRating, toEloScale } from '../src/bradley-terry.js';

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

// 3 players x 3 decks with deck-swapping, to catch player/deck index collisions.
// Players: P1, P2, P3. Decks: d1, d2, d3.
// P1 is the strongest player, d1 is the strongest deck, but every player uses
// every deck against every other player (deck-swapping in both directions),
// so player and deck signals are not confounded and the design is well
// identified (no perfect separation in either family). Generated from a
// known model (playerSkill P1=1.0/P2=0.0/P3=-0.8, deckStrength
// d1=0.6/d2=0.0/d3=-0.5) with a deterministic PRNG so outcomes include
// realistic upsets rather than being perfectly one-sided.
const richMatches = [
  { player1: 'P1', deck1: 'd1', player2: 'P2', deck2: 'd2', winner: 'P1', date: '2026-03-01' },
  { player1: 'P1', deck1: 'd1', player2: 'P2', deck2: 'd3', winner: 'P1', date: '2026-03-02' },
  { player1: 'P1', deck1: 'd2', player2: 'P2', deck2: 'd1', winner: 'P2', date: '2026-03-03' },
  { player1: 'P1', deck1: 'd2', player2: 'P2', deck2: 'd3', winner: 'P1', date: '2026-03-04' },
  { player1: 'P1', deck1: 'd3', player2: 'P2', deck2: 'd1', winner: 'P1', date: '2026-03-05' },
  { player1: 'P1', deck1: 'd3', player2: 'P2', deck2: 'd2', winner: 'P1', date: '2026-03-06' },
  { player1: 'P1', deck1: 'd1', player2: 'P3', deck2: 'd2', winner: 'P1', date: '2026-03-07' },
  { player1: 'P1', deck1: 'd1', player2: 'P3', deck2: 'd3', winner: 'P1', date: '2026-03-08' },
  { player1: 'P1', deck1: 'd2', player2: 'P3', deck2: 'd1', winner: 'P3', date: '2026-03-09' },
  { player1: 'P1', deck1: 'd2', player2: 'P3', deck2: 'd3', winner: 'P1', date: '2026-03-10' },
  { player1: 'P1', deck1: 'd3', player2: 'P3', deck2: 'd1', winner: 'P1', date: '2026-03-11' },
  { player1: 'P1', deck1: 'd3', player2: 'P3', deck2: 'd2', winner: 'P3', date: '2026-03-12' },
  { player1: 'P2', deck1: 'd1', player2: 'P1', deck2: 'd2', winner: 'P1', date: '2026-03-13' },
  { player1: 'P2', deck1: 'd1', player2: 'P1', deck2: 'd3', winner: 'P2', date: '2026-03-14' },
  { player1: 'P2', deck1: 'd2', player2: 'P1', deck2: 'd1', winner: 'P1', date: '2026-03-15' },
  { player1: 'P2', deck1: 'd2', player2: 'P1', deck2: 'd3', winner: 'P1', date: '2026-03-16' },
  { player1: 'P2', deck1: 'd3', player2: 'P1', deck2: 'd1', winner: 'P1', date: '2026-03-17' },
  { player1: 'P2', deck1: 'd3', player2: 'P1', deck2: 'd2', winner: 'P1', date: '2026-03-18' },
  { player1: 'P2', deck1: 'd1', player2: 'P3', deck2: 'd2', winner: 'P2', date: '2026-03-19' },
  { player1: 'P2', deck1: 'd1', player2: 'P3', deck2: 'd3', winner: 'P2', date: '2026-03-20' },
  { player1: 'P2', deck1: 'd2', player2: 'P3', deck2: 'd1', winner: 'P3', date: '2026-03-21' },
  { player1: 'P2', deck1: 'd2', player2: 'P3', deck2: 'd3', winner: 'P2', date: '2026-03-22' },
  { player1: 'P2', deck1: 'd3', player2: 'P3', deck2: 'd1', winner: 'P3', date: '2026-03-23' },
  { player1: 'P2', deck1: 'd3', player2: 'P3', deck2: 'd2', winner: 'P2', date: '2026-03-24' },
  { player1: 'P3', deck1: 'd1', player2: 'P1', deck2: 'd2', winner: 'P1', date: '2026-03-25' },
  { player1: 'P3', deck1: 'd1', player2: 'P1', deck2: 'd3', winner: 'P3', date: '2026-03-26' },
  { player1: 'P3', deck1: 'd2', player2: 'P1', deck2: 'd1', winner: 'P1', date: '2026-03-27' },
  { player1: 'P3', deck1: 'd2', player2: 'P1', deck2: 'd3', winner: 'P1', date: '2026-03-28' },
  { player1: 'P3', deck1: 'd3', player2: 'P1', deck2: 'd1', winner: 'P1', date: '2026-03-29' },
  { player1: 'P3', deck1: 'd3', player2: 'P1', deck2: 'd2', winner: 'P3', date: '2026-03-30' },
  { player1: 'P3', deck1: 'd1', player2: 'P2', deck2: 'd2', winner: 'P3', date: '2026-03-31' },
  { player1: 'P3', deck1: 'd1', player2: 'P2', deck2: 'd3', winner: 'P2', date: '2026-04-01' },
  { player1: 'P3', deck1: 'd2', player2: 'P2', deck2: 'd1', winner: 'P2', date: '2026-04-02' },
  { player1: 'P3', deck1: 'd2', player2: 'P2', deck2: 'd3', winner: 'P2', date: '2026-04-03' },
  { player1: 'P3', deck1: 'd3', player2: 'P2', deck2: 'd1', winner: 'P2', date: '2026-04-04' },
  { player1: 'P3', deck1: 'd3', player2: 'P2', deck2: 'd2', winner: 'P2', date: '2026-04-05' },
];

const playerIdsA = ['P1', 'P2', 'P3'];
const deckIdsA = ['d1', 'd2', 'd3'];
const fitA = fitBradleyTerry(richMatches, playerIdsA, deckIdsA);
const playerRatingsA = meanCenteredRatings(fitA, 'player', playerIdsA);
const deckRatingsA = meanCenteredRatings(fitA, 'deck', deckIdsA);

// Sum-to-zero: mean-centered values should sum to ~0 across each family.
const playerSumA = playerIdsA.reduce((s, id) => s + playerRatingsA[id].value, 0);
const deckSumA = deckIdsA.reduce((s, id) => s + deckRatingsA[id].value, 0);
assert.ok(Math.abs(playerSumA) < 1e-6, `expected player ratings to sum to ~0, got ${playerSumA}`);
assert.ok(Math.abs(deckSumA) < 1e-6, `expected deck ratings to sum to ~0, got ${deckSumA}`);

// Anchor-invariance: re-fit with different anchors (different orderings of
// playerIds/deckIds) -- mean-centered ratings must be (nearly) the same
// regardless of which entity got anchored at 0. A collision bug (e.g. deck
// offset === 0, colliding player and deck indices) breaks this badly --
// verified by hand to produce O(1) differences on this fixture -- while the
// tiny (1e-6) L2 ridge on the fit legitimately introduces an anchor-dependent
// asymmetry on the order of the ridge itself (~1e-6), so the tolerance here
// is set well above that noise floor and well below what a collision causes.
const playerIdsB = ['P3', 'P1', 'P2'];
const deckIdsB = ['d2', 'd3', 'd1'];
const fitB = fitBradleyTerry(richMatches, playerIdsB, deckIdsB);
const playerRatingsB = meanCenteredRatings(fitB, 'player', playerIdsA);
const deckRatingsB = meanCenteredRatings(fitB, 'deck', deckIdsA);

const ANCHOR_INVARIANCE_TOLERANCE = 1e-4;
for (const id of playerIdsA) {
  const diff = Math.abs(playerRatingsA[id].value - playerRatingsB[id].value);
  assert.ok(diff < ANCHOR_INVARIANCE_TOLERANCE, `player ${id} rating should be anchor-invariant, diff=${diff}`);
}
for (const id of deckIdsA) {
  const diff = Math.abs(deckRatingsA[id].value - deckRatingsB[id].value);
  assert.ok(diff < ANCHOR_INVARIANCE_TOLERANCE, `deck ${id} rating should be anchor-invariant, diff=${diff}`);
}

// Unknown id should throw rather than silently corrupting other entities' ratings.
assert.throws(
  () => meanCenteredRatings(fitA, 'player', ['P1', 'P2', 'Unknown']),
  /Unknown player id: Unknown/,
  'unknown id should throw',
);

// combinedPlayerDeckRating: the mean-centering constants for each family are
// additive constants that must cancel exactly in any DIFFERENCE of two
// combined ratings, leaving exactly the same raw log-odds that
// predictWinProbability computes directly from theta — this is an exact
// algebraic identity, not an approximation, so it pins the function's
// correctness far more precisely than checking plausible-looking output.
const combinedP1d1 = combinedPlayerDeckRating(fitA, 'P1', 'd1', playerIdsA, deckIdsA);
const combinedP2d2 = combinedPlayerDeckRating(fitA, 'P2', 'd2', playerIdsA, deckIdsA);
const rawP = predictWinProbability(fitA, 'P1', 'd1', 'P2', 'd2');
const rawLogit = Math.log(rawP / (1 - rawP));
const combinedDiff = combinedP1d1.value - combinedP2d2.value;
assert.ok(
  Math.abs(combinedDiff - rawLogit) < 1e-9,
  `combined-rating difference should exactly equal the raw logit: ${combinedDiff} vs ${rawLogit}`
);

// Anchor-invariance applies to the combined rating too, since it's built
// from the same anchor-invariant player/deck diff vectors already verified
// above (same fitB re-fit with different anchors as the check above).
const combinedP1d1B = combinedPlayerDeckRating(fitB, 'P1', 'd1', playerIdsA, deckIdsA);
assert.ok(
  Math.abs(combinedP1d1.value - combinedP1d1B.value) < ANCHOR_INVARIANCE_TOLERANCE,
  `combined rating should be anchor-invariant, diff=${Math.abs(combinedP1d1.value - combinedP1d1B.value)}`
);

// se must be a finite positive number.
assert.ok(combinedP1d1.se > 0 && Number.isFinite(combinedP1d1.se), 'combined se should be a finite positive number');

// The combined se must include the covariance term between the player and
// deck estimates, not just the two variances added independently — pins
// exactly the failure mode the function's own comment warns about (a wrong
// implementation that drops the cross-term would still return a finite
// positive number, which is all the check above verifies).
const naiveSeWithoutCovariance = Math.sqrt(playerRatingsA.P1.se ** 2 + deckRatingsA.d1.se ** 2);
assert.ok(
  Math.abs(combinedP1d1.se - naiveSeWithoutCovariance) > 1e-6,
  `combined se (${combinedP1d1.se}) should differ from the naive no-covariance se (${naiveSeWithoutCovariance}) on this fixture, where P1 and d1 are correlated`
);

console.log('OK: bradley-terry.test.js');
