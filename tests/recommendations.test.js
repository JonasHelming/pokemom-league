import assert from 'node:assert/strict';
import { fitBradleyTerry, combinedPlayerDeckRating, meanCenteredRatings } from '../src/bradley-terry.js';
import {
  flagWeakDecks,
  suggestMatchups,
  countMatchesByDeck,
  selectBestCandidate,
  countDefaultComboMatches,
  flagFairnessOutliers,
  computeBoostProgress,
  computeDeckBoostProgress,
  computeMarginProgress,
  marginBelowValue,
  marginAboveValue,
  FAIRNESS_CONFIDENCE_Z,
} from '../src/recommendations.js';

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
// stronger deck) combined with `n = 20` gives a comfortable margin (~0.66
// on the required CI gap under the current RIDGE — see src/bradley-terry.js
// — re-verify this number if RIDGE changes again) that holds stably for n
// in [15, 30], not just at n = 20 exactly. Odd parity alone isn't a
// guarantee at any n, though: `upsetEvery = 3` (67% win rate) has the right
// parity but a smaller effect size, so it separates later — around n ≈ 16
// under the current ridge, non-monotonically before that — so don't assume
// any odd value works at n = 20 without checking.
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
// -> should be flagged.
const enoughData = makeMatches(20);
const fitEnough = fitBradleyTerry(enoughData, ['A', 'B'], ['x', 'y']);
const flaggedEnough = flagWeakDecks(fitEnough, ['x', 'y'], enoughData, 8);
assert.deepEqual(flaggedEnough, ['y']);

// A lone active deck has nothing to average against, so it must never be
// flagged.
const flaggedLoneDeck = flagWeakDecks(fitEnough, ['x'], enoughData, 8);
assert.deepEqual(flaggedLoneDeck, []);

assert.equal(countMatchesByDeck(enoughData).get('x'), enoughData.length);
assert.equal(countMatchesByDeck(enoughData).get('y'), enoughData.length);

// flagWeakDecks now shares its bar with the player fairness signal: a
// deck rebuild costs the family exactly one card, same as the fairness
// bar's bonus card, so both compare against the GROUP AVERAGE of the
// OTHER entities at FAIRNESS_CONFIDENCE_Z (~68% confidence) instead of
// requiring separation from EVERY rival at the old, stricter 80%
// (confidenceZ=1.28) bar. With exactly two decks "average of the others"
// is just the other deck's value, so the minMatches floor is still the
// only thing worth pinning here (the confidenceZ parameter's own effect on
// the margin math is covered directly by the marginBelowValue/
// computeMarginProgress unit tests below, not re-derived per fixture).
const tenMatches = makeMatches(10);
const fitAtTen = fitBradleyTerry(tenMatches, ['A', 'B'], ['x', 'y']);

// The minMatches floor is enforced — same fit and data both times, only
// minMatches changes. If the gate were broken (e.g. deleted), the second
// assertion would incorrectly return ['y'] too, since the underlying
// margin math is otherwise conclusive at n=10.
assert.deepEqual(flagWeakDecks(fitAtTen, ['x', 'y'], tenMatches, 5), ['y']);
assert.deepEqual(flagWeakDecks(fitAtTen, ['x', 'y'], tenMatches, 11), []);

// Multiple decks below average are flagged at once — the actual behavior
// change from the old "at most one, the single clearly-worst deck" rule.
// (That old rule was mathematically incapable of ever flagging two decks
// simultaneously: "behind every other deck" for both A and B at once is a
// direct contradiction.) Deck x is the strong deck, piloted alternately by
// A and B; y and z are two separately-weak decks, each piloted by whichever
// player ISN'T on x that round — which is what makes y's and z's weakness
// separable from A's/B's own skill (same crossed-piloting identifiability
// principle as the `makeMatches` comment above, just with one deck rotated
// out instead of two crossed).
function threeDeckMatches(n, upsetEvery = 5) {
  const matches = [];
  for (let i = 0; i < n; i++) {
    const isUpset = i % upsetEvery === upsetEvery - 1;
    const xPilot = i % 2 === 0 ? 'A' : 'B';
    const otherPlayer = xPilot === 'A' ? 'B' : 'A';
    matches.push({
      player1: xPilot, deck1: 'x',
      player2: otherPlayer, deck2: 'y',
      winner: isUpset ? otherPlayer : xPilot,
      date: `2026-06-${String(2 * i + 1).padStart(2, '0')}`,
    });
    matches.push({
      player1: xPilot, deck1: 'x',
      player2: otherPlayer, deck2: 'z',
      winner: isUpset ? otherPlayer : xPilot,
      date: `2026-06-${String(2 * i + 2).padStart(2, '0')}`,
    });
  }
  return matches;
}
const threeDeckData = threeDeckMatches(20);
const threeDeckFit = fitBradleyTerry(threeDeckData, ['A', 'B'], ['x', 'y', 'z']);
assert.deepEqual(
  flagWeakDecks(threeDeckFit, ['x', 'y', 'z'], threeDeckData),
  ['y', 'z'],
  'both y and z (each below the group average) should be flagged; x (clearly ahead) should not'
);

// countDefaultComboMatches: counts only matches where a player used their
// OWN default deck, not a borrowed one — distinct from countMatchesByDeck.
const countPlayers = [
  { id: 'A', name: 'A', defaultDeck: 'x' },
  { id: 'B', name: 'B', defaultDeck: 'y' },
];
const countMatches = [
  { player1: 'A', deck1: 'x', player2: 'B', deck2: 'y', winner: 'A', date: '2026-01-01' }, // both default
  { player1: 'A', deck1: 'y', player2: 'B', deck2: 'x', winner: 'B', date: '2026-01-02' }, // both borrowed
  { player1: 'A', deck1: 'x', player2: 'B', deck2: 'x', winner: 'A', date: '2026-01-03' }, // A default, B borrowed
];
const comboCounts = countDefaultComboMatches(countMatches, countPlayers);
assert.equal(comboCounts.get('A'), 2, 'A used their own default (x) in matches 1 and 3');
assert.equal(comboCounts.get('B'), 1, 'B used their own default (y) only in match 1');

// marginBelowValue / marginAboveValue: the pure "distance from a fixed
// reference value" rules (the group average, in production use), tested
// directly with fabricated ratings — no fit required, same rationale as
// selectBestCandidate above (this repo's history of fixture-fragility bugs
// makes decoupling comparison logic from statistical fixtures worthwhile).
// Both are thin wrappers around computeMarginProgress against a single
// zero-se rival at the reference value — verified directly below rather
// than duplicating computeMarginProgress's own boundary tests.
assert.equal(marginBelowValue({ value: -100, se: 5 }, 0, 1.28), 1, 'clearly below the reference -> fully separated');
assert.equal(marginBelowValue({ value: 100, se: 5 }, 0, 1.28), 0, 'clearly above the reference -> zero progress toward "below"');
assert.equal(
  marginBelowValue({ value: -10, se: 5 }, 0, 1.28),
  computeMarginProgress({ value: -10, se: 5 }, [{ value: 0, se: 0 }], 1.28),
  'marginBelowValue is exactly computeMarginProgress against a zero-se rival at the reference value'
);
assert.equal(marginAboveValue({ value: 100, se: 5 }, 0, 1.28), 1, 'clearly above the reference -> fully separated in the "ahead" direction');
assert.equal(marginAboveValue({ value: -100, se: 5 }, 0, 1.28), 0, 'clearly below the reference -> zero progress toward "ahead"');
assert.equal(
  marginAboveValue({ value: 10, se: 5 }, 0, 1.28),
  marginBelowValue({ value: -10, se: 5 }, 0, 1.28),
  'marginAboveValue is the mirror image of marginBelowValue under negation of both target and reference'
);

// flagFairnessOutliers: integration test wiring countDefaultComboMatches,
// combinedPlayerDeckRating, and the average-based margin helpers together. Reuses the
// existing enoughData/fitEnough fixture (n=20, well-identified — see the
// makeMatches comment above) rather than building a new one: A always
// plays default deck x, B always plays default deck y in half the matches
// (the other half both borrow), giving both players exactly 10
// default-combo matches, comfortably over the 5-match floor, with the
// deck-y-is-weaker signal from above translating into "B's default team is
// significantly behind A's" once B's own skill is folded back in.
const fairnessPlayers = [
  { id: 'A', name: 'A', defaultDeck: 'x' },
  { id: 'B', name: 'B', defaultDeck: 'y' },
];
assert.equal(countDefaultComboMatches(enoughData, fairnessPlayers).get('A'), 10);
assert.equal(countDefaultComboMatches(enoughData, fairnessPlayers).get('B'), 10);
assert.deepEqual(
  flagFairnessOutliers(fitEnough, fairnessPlayers, ['A', 'B'], ['x', 'y'], enoughData),
  { weak: ['B'], strong: ['A'] }
);

// Raising minMatches above what either player has (10) forces the gate to
// block both, isolating the gate the same way the flagWeakDecks test above
// does — same fit and data, only minMatches differs.
assert.deepEqual(
  flagFairnessOutliers(fitEnough, fairnessPlayers, ['A', 'B'], ['x', 'y'], enoughData, 11),
  { weak: [], strong: [] }
);

// A player whose defaultDeck has since been retired (not in the active
// deckIds list, e.g. players.json wasn't updated after a rebuild) must be
// silently excluded rather than crashing the whole page — combinedPlayerDeckRating
// throws on an unknown deck id, so this is a real hazard without the guard.
const playersWithRetiredDefault = [
  { id: 'A', name: 'A', defaultDeck: 'x' },
  { id: 'B', name: 'B', defaultDeck: 'retired-deck' },
];
assert.doesNotThrow(() => flagFairnessOutliers(fitEnough, playersWithRetiredDefault, ['A', 'B'], ['x', 'y'], enoughData));
assert.deepEqual(
  flagFairnessOutliers(fitEnough, playersWithRetiredDefault, ['A', 'B'], ['x', 'y'], enoughData),
  { weak: [], strong: [] },
  'with B excluded, only A remains, and a lone entity has nothing to compare against'
);
assert.doesNotThrow(() => computeBoostProgress(fitEnough, playersWithRetiredDefault, ['A', 'B'], ['x', 'y'], enoughData));
assert.deepEqual(
  computeBoostProgress(fitEnough, playersWithRetiredDefault, ['A', 'B'], ['x', 'y'], enoughData),
  [],
  'fewer than 2 players with an active default deck -> nothing to spotlight'
);

// computeMarginProgress: the pure comparison-margin factor, tested
// directly with fabricated {value, se} pairs — no fit required, same
// rationale as findRatingOutliers/selectBestCandidate above.
assert.equal(
  computeMarginProgress({ value: 0, se: 1 }, [{ value: 0, se: 1 }], 1.28),
  0,
  'exactly tied point estimates -> 0 progress, nothing separates them yet'
);
assert.equal(
  computeMarginProgress({ value: -100, se: 1 }, [{ value: 100, se: 1 }], 1.28),
  1,
  'fully separated confidence intervals -> 1 (already flaggable on this rival)'
);
// Halfway to separation: with target={value:0,se:1} and z=1.28, a rival at
// value=1.28 (se=1) puts rivalLower exactly at 0 and upper(target) at 1.28
// — margin = -1.28, requiredGap = 2.56, so 1 + margin/requiredGap = 0.5.
assert.equal(computeMarginProgress({ value: 0, se: 1 }, [{ value: 1.28, se: 1 }], 1.28), 0.5);
assert.equal(computeMarginProgress({ value: 0, se: 1 }, [], 1.28), 1, 'no rivals to be behind -> already at 1');
// The binding constraint is the HARDEST rival to beat (minimum across rivals).
assert.equal(
  computeMarginProgress({ value: -100, se: 1 }, [{ value: 100, se: 1 }, { value: 0, se: 1 }], 1.28),
  computeMarginProgress({ value: -100, se: 1 }, [{ value: 0, se: 1 }], 1.28),
  'an easily-beaten extra rival must not raise progress past what the closest rival allows'
);

// computeBoostProgress: returns one entry per player currently below the
// GROUP AVERAGE of everyone else (not just a single spotlighted weakest),
// with progress climbing from near-zero toward 1 (flagged) as data
// accumulates. With exactly two players, "average of everyone else" is
// just the other player's value, so B (default deck y, the weaker deck) is
// the only entry throughout this fixture. Each case also pins progress
// against an independently-computed dataProgress * marginProgress, so a
// mutation dropping either factor (verified during review to otherwise
// survive the whole suite) fails here.
function expectedProgress(fit, matches) {
  const ratings = [
    { id: 'A', ...combinedPlayerDeckRatingFor(fit, 'A') },
    { id: 'B', ...combinedPlayerDeckRatingFor(fit, 'B') },
  ];
  const [weakest, other] = [...ratings].sort((a, b) => a.value - b.value);
  const counts = countDefaultComboMatches(matches, fairnessPlayers);
  const dataProgress = Math.min((counts.get(weakest.id) || 0) / 5, 1);
  const marginProgress = marginBelowValue(weakest, other.value, FAIRNESS_CONFIDENCE_Z);
  return dataProgress * marginProgress;
}
function combinedPlayerDeckRatingFor(fit, playerId) {
  const deckId = fairnessPlayers.find((p) => p.id === playerId).defaultDeck;
  return combinedPlayerDeckRating(fit, playerId, deckId, ['A', 'B'], ['x', 'y']);
}

// n=3 is too little data for either factor to be near its ceiling yet;
// n=7 is more data (higher dataProgress, tighter se -> higher
// marginProgress) but still short of the n=20 fixture's clean separation —
// isolating "more data climbs the bar" from "eventually reaches 1" as two
// separate claims, not just early-vs-late.
const earlyMatches = makeMatches(3);
const earlyFit = fitBradleyTerry(earlyMatches, ['A', 'B'], ['x', 'y']);
const [earlyProgress] = computeBoostProgress(earlyFit, fairnessPlayers, ['A', 'B'], ['x', 'y'], earlyMatches);
assert.equal(earlyProgress.playerId, 'B');
assert.equal(earlyProgress.flagged, false);
assert.ok(earlyProgress.progress > 0 && earlyProgress.progress < 0.5, `expected low but nonzero early progress, got ${earlyProgress.progress}`);
assert.ok(
  Math.abs(earlyProgress.progress - expectedProgress(earlyFit, earlyMatches)) < 1e-9,
  'progress must equal dataProgress * marginProgress, not either factor alone'
);

const midMatches = makeMatches(7);
const midFit = fitBradleyTerry(midMatches, ['A', 'B'], ['x', 'y']);
const [midProgress] = computeBoostProgress(midFit, fairnessPlayers, ['A', 'B'], ['x', 'y'], midMatches);
assert.equal(midProgress.flagged, false);
assert.ok(midProgress.progress > earlyProgress.progress, 'progress should climb as more data accumulates');
assert.ok(
  Math.abs(midProgress.progress - expectedProgress(midFit, midMatches)) < 1e-9,
  'progress must equal dataProgress * marginProgress, not either factor alone'
);

const [lateProgress] = computeBoostProgress(fitEnough, fairnessPlayers, ['A', 'B'], ['x', 'y'], enoughData);
assert.equal(lateProgress.playerId, 'B');
assert.equal(lateProgress.flagged, true);
assert.equal(lateProgress.progress, 1, 'a genuinely flagged candidate must read as 100% progress');

// A third player proves multiple below-average players each get their own
// entry, not just a single spotlighted "weakest" — the actual behavior
// change requested. A beats both B and C most of the time; B and C never
// play each other, so this is purely about each being compared against the
// GROUP AVERAGE (of the other two), not against every individual rival.
function threeWayMatches(n) {
  const matches = [];
  for (let i = 0; i < n; i++) {
    const upset = i % 5 === 4;
    matches.push({ player1: 'A', deck1: 'x', player2: 'B', deck2: 'y', winner: upset ? 'B' : 'A', date: `2026-05-${String(2 * i + 1).padStart(2, '0')}` });
    matches.push({ player1: 'A', deck1: 'x', player2: 'C', deck2: 'y', winner: upset ? 'C' : 'A', date: `2026-05-${String(2 * i + 2).padStart(2, '0')}` });
  }
  return matches;
}
const threeWayPlayers = [
  { id: 'A', name: 'A', defaultDeck: 'x' },
  { id: 'B', name: 'B', defaultDeck: 'y' },
  { id: 'C', name: 'C', defaultDeck: 'y' },
];
const threeWayData = threeWayMatches(6);
const threeWayFit = fitBradleyTerry(threeWayData, ['A', 'B', 'C'], ['x', 'y']);
const threeWayProgress = computeBoostProgress(threeWayFit, threeWayPlayers, ['A', 'B', 'C'], ['x', 'y'], threeWayData);
assert.deepEqual(
  threeWayProgress.map((p) => p.playerId).sort(),
  ['B', 'C'],
  'both B and C (each below the group average) should get their own bar; A (clearly ahead of both) should not'
);

// computeDeckBoostProgress: the deck analog of computeBoostProgress, sharing
// the exact same two-factor (dataProgress * marginProgress) shape and the
// same FAIRNESS_CONFIDENCE_Z bar — see the flagWeakDecks tests above for why
// the two were aligned. Reuses the existing makeMatches (x/y, crossed
// piloting) fixture rather than a new one.
function expectedDeckProgress(fit, matches, deckIds, targetId) {
  const ratings = meanCenteredRatings(fit, 'deck', deckIds);
  const others = deckIds.filter((id) => id !== targetId).map((id) => ratings[id].value);
  const average = others.reduce((sum, v) => sum + v, 0) / others.length;
  const dataProgress = Math.min((countMatchesByDeck(matches).get(targetId) || 0) / 5, 1);
  const marginProgress = marginBelowValue(ratings[targetId], average, FAIRNESS_CONFIDENCE_Z);
  return dataProgress * marginProgress;
}

// At n=3 the confidence margin is already saturated (deck x/y separate
// fast), so progress is purely gated by the data floor (3/5 = 0.6) — this
// isolates the dataProgress factor the same way the minMatches tests above
// isolate flagWeakDecks's gate.
const [earlyDeckProgress] = computeDeckBoostProgress(earlyFit, ['x', 'y'], earlyMatches);
assert.equal(earlyDeckProgress.deckId, 'y');
assert.equal(earlyDeckProgress.flagged, false);
assert.equal(earlyDeckProgress.progress, expectedDeckProgress(earlyFit, earlyMatches, ['x', 'y'], 'y'));
assert.ok(earlyDeckProgress.progress > 0 && earlyDeckProgress.progress < 1);

// One more match (4/5 = 0.8) climbs further but still isn't flagged yet.
const deckMidMatches = makeMatches(4);
const deckMidFit = fitBradleyTerry(deckMidMatches, ['A', 'B'], ['x', 'y']);
const [deckMidProgress] = computeDeckBoostProgress(deckMidFit, ['x', 'y'], deckMidMatches);
assert.equal(deckMidProgress.flagged, false);
assert.ok(deckMidProgress.progress > earlyDeckProgress.progress, 'progress should climb as more data accumulates');
assert.equal(deckMidProgress.progress, expectedDeckProgress(deckMidFit, deckMidMatches, ['x', 'y'], 'y'));

// At the well-identified n=20 fixture, y clears both factors -> flagged,
// reading as 100% progress, consistent with flagWeakDecks above.
const [lateDeckProgress] = computeDeckBoostProgress(fitEnough, ['x', 'y'], enoughData);
assert.equal(lateDeckProgress.deckId, 'y');
assert.equal(lateDeckProgress.flagged, true);
assert.equal(lateDeckProgress.progress, 1);

// Multiple below-average decks each get their own entry, not just a single
// spotlighted "weakest" — mirrors the three-way player test above, reusing
// the threeDeckMatches fixture from the flagWeakDecks tests.
const threeDeckProgress = computeDeckBoostProgress(threeDeckFit, ['x', 'y', 'z'], threeDeckData);
assert.deepEqual(
  threeDeckProgress.map((p) => p.deckId).sort(),
  ['y', 'z'],
  'both y and z should get their own bar; x (clearly ahead) should not'
);
assert.ok(threeDeckProgress.every((p) => p.flagged), 'both are already flagged at n=20 in this fixture');

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

// Among two candidates neither of which is competitive, the fallback pool
// still picks by gain (not e.g. array order) — the sort-by-gain path is
// exercised with more than one element, not just the single-candidate
// fallback case above.
const worseFallback = { playerA: 'A', deckA: 'x', playerB: 'B', deckB: 'y', predictedWinProbA: 0.02, gain: 10 };
const betterFallback = { playerA: 'A', deckA: 'x', playerB: 'B', deckB: 'z', predictedWinProbA: 0.98, gain: 20 };
const pickedBestFallback = selectBestCandidate([worseFallback, betterFallback]);
assert.equal(pickedBestFallback.deckB, 'z');
assert.equal(pickedBestFallback.competitiveMatchAvailable, false);

// selectBestCandidate requires at least one candidate — an empty array is a
// caller bug (suggestMatchups already guards against it), not a valid input
// to silently paper over.
assert.throws(() => selectBestCandidate([]));

// Pins the exact competitive/not-competitive boundary the threshold
// implements — closeness(p) >= 0.3 means p in [15%, 85%], NOT the tighter
// [35%, 65%] band an earlier version of this comment mistakenly described.
// p=20% is inside that true band (closeness 0.4), p=10% is just outside it
// (closeness 0.2); pinning both here catches the threshold's exact value
// changing, not just its qualitative direction.
const justInsideBand = { playerA: 'A', deckA: 'x', playerB: 'B', deckB: 'y', predictedWinProbA: 0.20, gain: 1 };
const justOutsideBand = { playerA: 'A', deckA: 'x', playerB: 'B', deckB: 'z', predictedWinProbA: 0.10, gain: 1_000_000 };
const pickedAtBoundary = selectBestCandidate([justInsideBand, justOutsideBand]);
assert.equal(pickedAtBoundary.deckB, 'y', 'p=20% should count as competitive and be preferred over p=10% despite far less gain');

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
