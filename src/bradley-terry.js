import { invert, matVec, dot, quadForm } from './linalg.js';

// A real Bayesian shrinkage prior (Gaussian, variance 1/RIDGE on each free
// parameter), not a numerical-stability nub. At the near-zero value this
// used to be (1e-6), a player or deck with a near-perfect record hits
// quasi-complete separation (the unpenalized MLE runs toward +/-infinity),
// and the tiny ridge does nothing to stop it — theta reaching +/-26 and
// confidence ranges tens of thousands of Elo points wide on real 10-match
// data, verified directly against data/matches.json. Swept 1e-6 through 1
// against both that pathological real data AND the well-identified
// richMatches fixture in tests/bradley-terry.test.js: 0.1 cuts the
// pathological case's confidence range by >100x (60,619 -> 503) while
// shifting the well-identified fixture's point estimates by only ~2%
// (versus ~8% at RIDGE=1, where the prior starts visibly pulling even
// good data toward the population mean). Chosen deliberately from that
// sweep, not copied from a suggested range — if the family's real data
// volume changes substantially, re-run the sweep rather than assume this
// value still holds.
const RIDGE = 0.1;
// IMPORTANT: this must be applied via buildRidgeMatrix's gauge-invariant
// centering matrix (below), never as a flat `RIDGE * identity` on the raw
// anchored free parameters. A flat ridge penalizes deviation from whichever
// entity happens to be the anchor's implicit zero — which is an arbitrary
// bookkeeping choice (buildIndex always anchors ids[0]) — rather than from
// each family's own mean. That's invisible at a near-zero ridge (1e-6), but
// once the ridge is strong enough to matter, it breaks anchor-invariance
// for real: re-fitting the exact same match data with a different
// player/deck array ordering (a different anchor) produced up to 124 Elo
// points of difference on real data at RIDGE=0.1 with a flat penalty — a
// genuine correctness bug, not a rounding artifact. The centering-matrix
// penalty below restores exact (machine-precision) anchor-invariance,
// verified against both the pathological real data and the richMatches
// fixture with a fully different anchor ordering.
const MAX_ITERATIONS = 100;
const CONVERGENCE_THRESHOLD = 1e-9;

// Deck-rebuild prior: how much a freshly rebuilt deck should start out
// carrying its predecessor's rating rather than a blank slate. A rebuild in
// this family means swapping ~1-2 cards, not a new deck — treating it as
// zero-information and leaving it to RIDGE's flat family-mean pull throws
// away real information and makes every rebuild's line jump straight to
// "average" on the chart, which doesn't match how similar the deck actually
// still is. Modeled as a genuine Bayesian prior (see buildDeckPriorTerms
// below): centered on the predecessor's frozen rating at the moment it
// stopped being played, with a "confidence" equivalent to
// PREDECESSOR_PRIOR_VIRTUAL_MATCHES worth of real match information
// (MAX_MATCH_INFORMATION = p(1-p) at its max, p=0.5 — the same cap a real
// match row contributes to the Hessian below). As the rebuilt deck
// accumulates its OWN real matches, this prior's weight shrinks linearly and
// hits zero once real data reaches that many matches.
//
// Started at 3 (deliberately fewer than the family's 5-match "genuinely
// tested" floor used elsewhere — flagWeakDecks, computeBoostProgress — since
// a 1-2 card tweak seemed like a smaller signal than "an entirely untested
// deck"). Raised to 8 after a real sweep (3/5/8/12) against a simulated
// mixed-result rebuild: at 3, a single real match's own information (up to
// 0.25) is comparable to nearly the WHOLE remaining prior after just 1-2
// matches, so individual results whipsawed the rating 60-80 Elo points match
// to match — not the gradual evolution this was meant to produce. 8 damps
// that to ~25-point swings while still clearly reflecting the new build's
// actual record within a realistic evening's worth of matches; 12 was
// noticeably too sticky (barely moved off the old rating even after 6
// mostly-losing real matches). Re-sweep if the family's real usage pattern
// (matches per rebuild, streakiness) turns out different from this fixture.
export const PREDECESSOR_PRIOR_VIRTUAL_MATCHES = 8;
const MAX_MATCH_INFORMATION = 0.25;

function buildIndex(ids, offset) {
  const anchor = ids[0];
  const index = new Map();
  ids.forEach((id, i) => {
    index.set(id, i === 0 ? null : offset + i - 1);
  });
  return { index, anchor };
}

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

export function buildDesignRow(playerA, deckA, playerB, deckB, playerIndex, deckIndex, numFree) {
  const x = new Array(numFree).fill(0);
  const add = (index, sign) => {
    if (index !== null && index !== undefined) x[index] += sign;
  };
  add(playerIndex.get(playerA), 1);
  add(playerIndex.get(playerB), -1);
  add(deckIndex.get(deckA), 1);
  add(deckIndex.get(deckB), -1);
  return x;
}

// Builds the (numFree x numFree) matrix R such that theta^T * R * theta
// equals sum-over-the-whole-family-including-the-anchor of
// (rawValue_i - familyMean)^2, for each family separately (block-diagonal:
// zero for any player-deck cross term). This is the penalty ACTUALLY
// applied (scaled by RIDGE) — see the comment on RIDGE above for why a
// flat identity penalty is wrong here. Derivation: with m entities in a
// family (m-1 free parameters theta_1..theta_{m-1}, anchor fixed at 0) and
// mean = (sum theta_j)/m, expanding sum_i (rawValue_i - mean)^2 over all m
// entities (including the anchor's own (0-mean)^2 term) gives exactly
// sum_j theta_j^2 - (1/m)*(sum_j theta_j)^2 = theta^T*(I - (1/m)*J)*theta,
// where J is the all-ones matrix restricted to that family's free indices
// — i.e. diagonal entries (1 - 1/m), off-diagonal entries (-1/m), only
// within a single family's block.
function buildRidgeMatrix(numFree, playerFreeCount, deckFreeCount) {
  const numPlayers = playerFreeCount + 1;
  const numDecks = deckFreeCount + 1;
  const R = Array.from({ length: numFree }, () => new Array(numFree).fill(0));

  for (let j = 0; j < playerFreeCount; j++) {
    for (let k = 0; k < playerFreeCount; k++) {
      R[j][k] = (j === k ? 1 : 0) - 1 / numPlayers;
    }
  }
  for (let j = playerFreeCount; j < numFree; j++) {
    for (let k = playerFreeCount; k < numFree; k++) {
      R[j][k] = (j === k ? 1 : 0) - 1 / numDecks;
    }
  }

  return R;
}

function deckParamVector(deckIndex, numFree, id) {
  const v = new Array(numFree).fill(0);
  const index = deckIndex.get(id);
  if (index !== null && index !== undefined) v[index] = 1;
  return v;
}

function deckFamilyMeanVector(deckIndex, numFree, deckIds) {
  const mean = new Array(numFree).fill(0);
  for (const id of deckIds) {
    const v = deckParamVector(deckIndex, numFree, id);
    for (let i = 0; i < numFree; i++) mean[i] += v[i] / deckIds.length;
  }
  return mean;
}

// Builds one { v, target, weight } term per deck with a live carry-over
// prior. `v` is the same "raw value minus family mean" direction
// meanCenteredRatings uses, so the prior is expressed in the same
// anchor-invariant, mean-centered units as `prior.mean` (computed by
// computeDeckPriors below) rather than the arbitrary raw/anchored theta
// basis. Penalizing (dot(v, theta) - target)^2 contributes cleanly to both
// the gradient and the Hessian below, the same way the flat ridge penalty
// does.
function buildDeckPriorTerms(deckIndex, numFree, deckIds, deckPriors) {
  if (!deckPriors || deckPriors.size === 0) return [];
  const mean = deckFamilyMeanVector(deckIndex, numFree, deckIds);
  const terms = [];
  for (const [deckId, prior] of deckPriors) {
    if (!deckIds.includes(deckId) || prior.weight <= 0) continue;
    const v = deckParamVector(deckIndex, numFree, deckId).map((val, i) => val - mean[i]);
    terms.push({ v, target: prior.mean, weight: prior.weight });
  }
  return terms;
}

function countDeckMatches(matches, deckId) {
  let count = 0;
  for (const m of matches) {
    if (m.deck1 === deckId || m.deck2 === deckId) count += 1;
  }
  return count;
}

// Computes each rebuilt deck's carry-over prior from its predecessor's
// rating, frozen at the moment it stopped being played: fit on every match
// EXCEPT deckId's own (so its own results can never leak into its own
// starting point), over the family with deckId removed, then read off the
// predecessor's mean-centered rating from that fit. That auxiliary family
// is one entity smaller than the family the prior is later applied in,
// which means the frozen target is gauge-consistent only up to a small
// (1/family-size) mean shift — an accepted approximation, in keeping with
// how loosely-tuned the rest of this model's family-fun signals already are
// (see FAIRNESS_CONFIDENCE_Z and the minMatches floors in
// src/recommendations.js), not worth a fully self-consistent joint solve at
// this data scale. Decks with no `predecessor`, or whose predecessor isn't
// part of `deckIds` (e.g. its data has been pruned), get no prior term and
// fit exactly as before.
export function computeDeckPriors(matches, playerIds, deckIds, decks) {
  const priors = new Map();
  for (const deck of decks) {
    if (!deck.predecessor || !deckIds.includes(deck.id)) continue;
    const auxDeckIds = deckIds.filter((id) => id !== deck.id);
    if (auxDeckIds.length === 0 || !auxDeckIds.includes(deck.predecessor)) continue;
    const auxMatches = matches.filter((m) => m.deck1 !== deck.id && m.deck2 !== deck.id);
    if (auxMatches.length === 0) continue;

    const auxFit = fitBradleyTerry(auxMatches, playerIds, auxDeckIds);
    const predecessorRating = meanCenteredRatings(auxFit, 'deck', auxDeckIds)[deck.predecessor].value;

    const realMatches = countDeckMatches(matches, deck.id);
    const weight = Math.max(PREDECESSOR_PRIOR_VIRTUAL_MATCHES - realMatches, 0) * MAX_MATCH_INFORMATION;
    if (weight > 0) priors.set(deck.id, { mean: predecessorRating, weight });
  }
  return priors;
}

function computeNegHessian(rows, theta, numFree, ridgeMatrix, priorTerms) {
  const negHessian = Array.from({ length: numFree }, () => new Array(numFree).fill(0));
  for (const { x } of rows) {
    const p = sigmoid(dot(theta, x));
    const w = p * (1 - p);
    for (let i = 0; i < numFree; i++) {
      for (let j = 0; j < numFree; j++) {
        negHessian[i][j] += w * x[i] * x[j];
      }
    }
  }
  for (let i = 0; i < numFree; i++) {
    for (let j = 0; j < numFree; j++) {
      negHessian[i][j] += RIDGE * ridgeMatrix[i][j];
    }
  }
  for (const { v, weight } of priorTerms) {
    for (let i = 0; i < numFree; i++) {
      for (let j = 0; j < numFree; j++) {
        negHessian[i][j] += weight * v[i] * v[j];
      }
    }
  }
  return negHessian;
}

export function fitBradleyTerry(matches, playerIds, deckIds, deckPriors = new Map()) {
  const { index: playerIndex, anchor: playerAnchor } = buildIndex(playerIds, 0);
  const { index: deckIndex, anchor: deckAnchor } = buildIndex(deckIds, playerIds.length - 1);
  const numFree = (playerIds.length - 1) + (deckIds.length - 1);
  const ridgeMatrix = buildRidgeMatrix(numFree, playerIds.length - 1, deckIds.length - 1);
  const priorTerms = buildDeckPriorTerms(deckIndex, numFree, deckIds, deckPriors);

  const rows = matches.map((m) => ({
    x: buildDesignRow(m.player1, m.deck1, m.player2, m.deck2, playerIndex, deckIndex, numFree),
    y: m.winner === m.player1 ? 1 : 0,
  }));

  let theta = new Array(numFree).fill(0);
  let converged = false;
  let iterations = 0;

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    iterations = iter + 1;
    const grad = new Array(numFree).fill(0);
    for (const { x, y } of rows) {
      const p = sigmoid(dot(theta, x));
      for (let i = 0; i < numFree; i++) grad[i] += (y - p) * x[i];
    }
    const ridgeGrad = matVec(ridgeMatrix, theta);
    for (let i = 0; i < numFree; i++) grad[i] -= RIDGE * ridgeGrad[i];
    for (const { v, target, weight } of priorTerms) {
      const residual = dot(v, theta) - target;
      for (let i = 0; i < numFree; i++) grad[i] -= weight * residual * v[i];
    }

    const negHessian = computeNegHessian(rows, theta, numFree, ridgeMatrix, priorTerms);
    const cov = invert(negHessian);
    const delta = matVec(cov, grad);
    theta = theta.map((v, i) => v + delta[i]);

    if (delta.every((d) => Math.abs(d) < CONVERGENCE_THRESHOLD)) {
      converged = true;
      break;
    }
  }

  const cov = invert(computeNegHessian(rows, theta, numFree, ridgeMatrix, priorTerms));

  return { playerIndex, deckIndex, playerAnchor, deckAnchor, theta, cov, numFree, converged, iterations };
}

export function predictWinProbability(fit, playerA, deckA, playerB, deckB) {
  const x = buildDesignRow(playerA, deckA, playerB, deckB, fit.playerIndex, fit.deckIndex, fit.numFree);
  return sigmoid(dot(fit.theta, x));
}

function paramVectorFor(fit, family, id) {
  const v = new Array(fit.numFree).fill(0);
  const map = family === 'player' ? fit.playerIndex : fit.deckIndex;
  if (!map.has(id)) throw new Error(`Unknown ${family} id: ${id}`);
  const index = map.get(id);
  if (index !== null && index !== undefined) v[index] = 1;
  return v;
}

export function meanCenteredRatings(fit, family, ids) {
  const vectors = ids.map((id) => paramVectorFor(fit, family, id));
  const m = ids.length;
  const meanVector = new Array(fit.numFree).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < fit.numFree; i++) meanVector[i] += v[i] / m;
  }

  const result = {};
  ids.forEach((id, idx) => {
    const diff = vectors[idx].map((v, i) => v - meanVector[i]);
    result[id] = {
      value: dot(diff, fit.theta),
      se: Math.sqrt(Math.max(quadForm(fit.cov, diff), 0)),
    };
  });
  return result;
}

// The rating of a specific player+deck combination (e.g. "this deck as
// played by its usual owner"), mean-centered the same way as
// meanCenteredRatings but for the SUM of a player's and a deck's effects
// rather than either alone. Useful because a deck's own isolated strength
// can have a huge confidence interval early on (see the design spec's
// identifiability discussion), while "how does this specific player+deck
// combo actually perform" is much closer to the raw observed data and
// becomes meaningful much sooner.
//
// Variance of the sum uses a single quadForm call on the summed diff
// vector rather than adding each part's variance separately, because
// quadForm(cov, v1+v2) = v1'cov·v1 + 2·v1'cov·v2 + v2'cov·v2 automatically
// includes the covariance term between the player and deck estimates —
// computing it any other way risks silently dropping that term.
export function combinedPlayerDeckRating(fit, playerId, deckId, playerIds, deckIds) {
  const playerVectors = playerIds.map((id) => paramVectorFor(fit, 'player', id));
  const playerMeanVector = new Array(fit.numFree).fill(0);
  for (const v of playerVectors) {
    for (let i = 0; i < fit.numFree; i++) playerMeanVector[i] += v[i] / playerIds.length;
  }
  const playerDiff = paramVectorFor(fit, 'player', playerId).map((v, i) => v - playerMeanVector[i]);

  const deckVectors = deckIds.map((id) => paramVectorFor(fit, 'deck', id));
  const deckMeanVector = new Array(fit.numFree).fill(0);
  for (const v of deckVectors) {
    for (let i = 0; i < fit.numFree; i++) deckMeanVector[i] += v[i] / deckIds.length;
  }
  const deckDiff = paramVectorFor(fit, 'deck', deckId).map((v, i) => v - deckMeanVector[i]);

  const combinedDiff = playerDiff.map((v, i) => v + deckDiff[i]);
  return {
    value: dot(combinedDiff, fit.theta),
    se: Math.sqrt(Math.max(quadForm(fit.cov, combinedDiff), 0)),
  };
}

export const ELO_SCALE = 400 / Math.LN10;

export function toEloScale(value) {
  return 1000 + value * ELO_SCALE;
}
