import assert from 'node:assert/strict';
import { fitBradleyTerry } from '../src/bradley-terry.js';
import { flagWeakDecks, suggestMatchups, countMatchesByDeck } from '../src/recommendations.js';

// Deck x beats deck y most of the time (not always — see below), and
// piloting alternates between A and B every match. The crossed pairing is
// what makes deck strength statistically separable from player skill at all
// — a fixed pairing (A always on x, B always on y) makes "player B is weak"
// and "deck y is weak" perfectly confounded, no matter how much data you add
// (see the design spec's identifiability discussion).
//
// Outcomes must NOT be 100% deterministic: if the stronger deck wins every
// single match, that's complete separation in the logistic fit — under ridge
// regularization the standard error then shrinks only as 1/sqrt(ln n)
// instead of 1/sqrt(n), so the confidence-interval gap required to flag a
// deck is essentially never reached, no matter how large n gets. A periodic,
// deterministic "upset" (the weaker deck occasionally wins) keeps the
// fixture reproducible while giving the MLE a finite true win probability to
// converge to, so `se` actually shrinks like 1/sqrt(n) as more matches are
// added — which is what makes `flagWeakDecks` able to fire at all.
//
// `upsetEvery = 8` (~87.5% win rate for the stronger deck) and `n = 20` from
// the original plan were starting points, not verified exact values.
// Numerically verified (see task-6-report.md): even `upsetEvery` values (4,
// 6, 8, ...) are pathological here, because `isUpset` (i % upsetEvery ===
// upsetEvery - 1) then always coincides with the same parity of `i`, so
// every match of one covariate pattern (e.g. "A pilots x") is won 100% of
// the time while the other pattern still has upsets. That one always-100%
// pattern is quasi-complete separation — the same failure mode as the
// all-deterministic case described above, just confined to half the data —
// producing a huge, non-shrinking `se` no matter how large `n` gets. It is
// NOT a rank-deficiency/confound problem (the design matrix stays full
// rank) — an odd `upsetEvery` fixes it by making the upset land on both
// parities, so every covariate pattern sees some losses and `se` shrinks
// cleanly like 1/sqrt(n). `upsetEvery = 5` (an 80% win rate for the
// stronger deck) combined with `n = 20` gives a comfortable margin (~0.29
// on the required CI gap) that holds stably for n in [15, 30], not just at
// n = 20 exactly. Odd parity alone isn't sufficient, though: `upsetEvery =
// 3` (67% win rate) has the right parity but too small an effect size to
// separate at n = 20 (it needs n ≳ 26), so don't assume any odd value
// works at any n.
function makeMatches(n, upsetEvery = 5) {
  return Array.from({ length: n }, (_, i) => {
    const aUsesX = i % 2 === 0;
    const isUpset = i % upsetEvery === upsetEvery - 1;
    const xPilotWins = !isUpset;
    const winner = xPilotWins === aUsesX ? 'A' : 'B';
    return {
      player1: 'A', deck1: aUsesX ? 'x' : 'y',
      player2: 'B', deck2: aUsesX ? 'y' : 'x',
      winner,
      date: `2026-03-${String(i + 1).padStart(2, '0')}`,
    };
  });
}

// Deck y loses most matches (regardless of pilot) and has enough matches
// (well over an explicit minMatches=8 threshold) -> should be flagged.
const enoughData = makeMatches(20);
const fitEnough = fitBradleyTerry(enoughData, ['A', 'B'], ['x', 'y']);
const flaggedEnough = flagWeakDecks(fitEnough, ['x', 'y'], enoughData, 8);
assert.deepEqual(flaggedEnough, ['y']);

// Same pattern but too few matches (under an explicit threshold) -> should
// not be flagged yet, regardless of how bad deck y's point estimate looks.
const notEnoughData = makeMatches(5);
const fitNotEnough = fitBradleyTerry(notEnoughData, ['A', 'B'], ['x', 'y']);
const flaggedNotEnough = flagWeakDecks(fitNotEnough, ['x', 'y'], notEnoughData, 8);
assert.deepEqual(flaggedNotEnough, []);

// A lone active deck has nothing to be "behind", so it must never be
// flagged — `[].every(...)` is vacuously true, which would otherwise flag
// any single deck with enough matches even though there's no comparison.
const flaggedLoneDeck = flagWeakDecks(fitEnough, ['x'], enoughData, 8);
assert.deepEqual(flaggedLoneDeck, []);

assert.equal(countMatchesByDeck(enoughData).get('x'), enoughData.length);
assert.equal(countMatchesByDeck(enoughData).get('y'), enoughData.length);

// The family's chosen defaults (minMatches=5, ~80% confidence) are looser
// than the 8-match/95% examples above by design (a fun signal for ordering
// new cards, not a rigorous claim) — numerically verified: this fixture
// doesn't yet separate at n=5 (not enough data), but does by n=10.
const fitAtFive = fitBradleyTerry(makeMatches(5), ['A', 'B'], ['x', 'y']);
assert.deepEqual(flagWeakDecks(fitAtFive, ['x', 'y'], makeMatches(5)), []);
const tenMatches = makeMatches(10);
const fitAtTen = fitBradleyTerry(tenMatches, ['A', 'B'], ['x', 'y']);
assert.deepEqual(flagWeakDecks(fitAtTen, ['x', 'y'], tenMatches), ['y']);

// Player C and its decks have zero data -> suggestMatchups must return
// exactly one suggestion per unique player pair (so whichever two people
// want to play, there's always an answer for which decks to use), and the
// pairs involving totally-untested C should score far higher (much more to
// learn) than the already-well-tested A-vs-B pair.
const players = ['A', 'B', 'C'];
const decks = ['x', 'y'];
const sparseMatches = makeMatches(10);
const sparseFit = fitBradleyTerry(sparseMatches, players, decks);
const suggestions = suggestMatchups(sparseFit, players, decks);
assert.equal(suggestions.length, 3); // C(3,2) pairs: A-B, A-C, B-C

const pairKey = (s) => [s.playerA, s.playerB].sort().join('-');
const pairsSeen = new Set(suggestions.map(pairKey));
assert.deepEqual(pairsSeen, new Set(['A-B', 'A-C', 'B-C']));

const abScore = suggestions.find((s) => pairKey(s) === 'A-B').score;
const acScore = suggestions.find((s) => pairKey(s) === 'A-C').score;
const bcScore = suggestions.find((s) => pairKey(s) === 'B-C').score;
assert.ok(acScore > abScore, `expected under-sampled A-C pair to score higher than well-tested A-B, got ${acScore} vs ${abScore}`);
assert.ok(bcScore > abScore, `expected under-sampled B-C pair to score higher than well-tested A-B, got ${bcScore} vs ${abScore}`);

console.log('OK: recommendations.test.js');
