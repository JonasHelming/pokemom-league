import assert from 'node:assert/strict';
import { fitBradleyTerry } from '../src/bradley-terry.js';
import { flagWeakDecks, suggestMatchups, countMatchesByDeck, selectBestCandidate } from '../src/recommendations.js';

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

// The family's chosen defaults (minMatches=5, ~80% confidence, both now
// named parameters instead of hardcoded 8/1.96) are looser than the
// explicit-8-match examples above by design (a fun signal for ordering new
// cards, not a rigorous claim). Two independent things are verified here,
// deliberately not conflated:
//
// (a) the minMatches=5 floor is actually enforced — using a 4-matches-per
// -deck PREFIX of the well-behaved n=20 fixture (not a fresh small-n
// fixture), so this isolates the count gate itself rather than accidentally
// depending on the fixture's own small-n statistical fragility (this exact
// fixture has documented period-alignment quirks below n=10 — see the
// comment on `makeMatches` above). The count gate fires and returns []
// before any CI math even runs, regardless of what that math would say.
const belowFloor = enoughData.slice(0, 4);
assert.equal(countMatchesByDeck(belowFloor).get('y'), 4);
const fitBelowFloor = fitBradleyTerry(belowFloor, ['A', 'B'], ['x', 'y']);
assert.deepEqual(flagWeakDecks(fitBelowFloor, ['x', 'y'], belowFloor), []);

// (b) the ~80% confidence default actually flags earlier than the old 95%
// level would: at n=10 this fixture's required gap sits between the two
// thresholds, so it flags at the new default but would not have at 1.96.
const tenMatches = makeMatches(10);
const fitAtTen = fitBradleyTerry(tenMatches, ['A', 'B'], ['x', 'y']);
assert.deepEqual(flagWeakDecks(fitAtTen, ['x', 'y'], tenMatches), ['y']);
assert.deepEqual(flagWeakDecks(fitAtTen, ['x', 'y'], tenMatches, 5, 1.96), []);

// selectBestCandidate: the core "prefer competitive over merely informative"
// rule, tested directly with fabricated candidates — no fit required — so
// it doesn't depend on hand-tuning another statistical fixture. This is the
// exact behavior that fixed a real bug found in review: on live data, a
// pure information-gain ranking chose a 0.9%-predicted "blowout" over a
// genuinely close 66.7%-predicted option for the same pair, because the
// blowout involved a far less-tested deck.
const lopsidedButInformative = { playerA: 'A', deckA: 'x', playerB: 'B', deckB: 'y', predictedWinProbA: 0.01, gain: 1_000_000 };
const closeButUninformative = { playerA: 'A', deckA: 'x', playerB: 'B', deckB: 'z', predictedWinProbA: 0.5, gain: 1 };
const pickedCompetitive = selectBestCandidate([lopsidedButInformative, closeButUninformative]);
assert.equal(pickedCompetitive.deckB, 'z', 'a genuinely competitive option must win even with far less gain');
assert.equal(pickedCompetitive.competitiveMatchAvailable, true);

// With no competitive option at all, it must fall back to the most
// informative one rather than returning nothing.
const pickedFallback = selectBestCandidate([lopsidedButInformative]);
assert.equal(pickedFallback.deckB, 'y');
assert.equal(pickedFallback.competitiveMatchAvailable, false);

// Among two competitive options, information gain still breaks the tie.
const moreInformativeCompetitive = { playerA: 'A', deckA: 'x', playerB: 'B', deckB: 'w', predictedWinProbA: 0.45, gain: 50 };
const pickedTiebreak = selectBestCandidate([closeButUninformative, moreInformativeCompetitive]);
assert.equal(pickedTiebreak.deckB, 'w');

// Player C and its decks have zero data -> suggestMatchups must return
// exactly one suggestion per unique player pair (so whichever two people
// want to play, there's always an answer for which decks to use), and the
// pairs involving totally-untested C should have far higher information
// gain than the already-well-tested A-vs-B pair.
const players = ['A', 'B', 'C'];
const decks = ['x', 'y'];
const sparseMatches = makeMatches(10);
const sparseFit = fitBradleyTerry(sparseMatches, players, decks);
const suggestions = suggestMatchups(sparseFit, players, decks);
assert.equal(suggestions.length, 3); // C(3,2) pairs: A-B, A-C, B-C

const pairKey = (s) => [s.playerA, s.playerB].sort().join('-');
const pairsSeen = new Set(suggestions.map(pairKey));
assert.deepEqual(pairsSeen, new Set(['A-B', 'A-C', 'B-C']));
suggestions.forEach((s) => assert.notEqual(s.deckA, s.deckB, 'mirror matchups must be excluded'));

const abGain = suggestions.find((s) => pairKey(s) === 'A-B').gain;
const acGain = suggestions.find((s) => pairKey(s) === 'A-C').gain;
const bcGain = suggestions.find((s) => pairKey(s) === 'B-C').gain;
assert.ok(acGain > abGain, `expected under-sampled A-C pair to have higher gain than well-tested A-B, got ${acGain} vs ${abGain}`);
assert.ok(bcGain > abGain, `expected under-sampled B-C pair to have higher gain than well-tested A-B, got ${bcGain} vs ${abGain}`);

console.log('OK: recommendations.test.js');
