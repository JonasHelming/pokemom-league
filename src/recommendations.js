import { meanCenteredRatings, buildDesignRow, predictWinProbability, combinedPlayerDeckRating } from './bradley-terry.js';
import { shermanMorrisonGain } from './linalg.js';

export function countMatchesByDeck(matches) {
  const counts = new Map();
  for (const m of matches) {
    counts.set(m.deck1, (counts.get(m.deck1) || 0) + 1);
    counts.set(m.deck2, (counts.get(m.deck2) || 0) + 1);
  }
  return counts;
}

// Confidence level and match-count floor are deliberately looser than a
// textbook 95%/large-n threshold: this is a fun family signal for deciding
// when to order new cards, not a scientific claim, so 80% confidence
// (z ~= 1.28) and a 5-match minimum are the family's chosen "not bullshit,
// but responsive enough to be useful" balance.
export function flagWeakDecks(fit, activeDeckIds, matches, minMatches = 5, confidenceZ = 1.28) {
  if (activeDeckIds.length < 2) return [];

  const ratings = meanCenteredRatings(fit, 'deck', activeDeckIds);
  const counts = countMatchesByDeck(matches);
  const flagged = [];

  for (const deckId of activeDeckIds) {
    if ((counts.get(deckId) || 0) < minMatches) continue;
    const upper = ratings[deckId].value + confidenceZ * ratings[deckId].se;
    const isBehindAll = activeDeckIds
      .filter((other) => other !== deckId)
      .every((other) => upper < ratings[other].value - confidenceZ * ratings[other].se);
    if (isBehindAll) flagged.push(deckId);
  }

  return flagged;
}

// Counts, per player, how many recorded matches they played using their OWN
// default deck (not a borrowed one) — the sample size behind "how does this
// player's usual team actually perform," as distinct from countMatchesByDeck
// (which counts a deck's matches regardless of who's piloting it).
export function countDefaultComboMatches(matches, players) {
  const counts = new Map(players.map((p) => [p.id, 0]));
  const defaultDeckByPlayer = new Map(players.map((p) => [p.id, p.defaultDeck]));

  for (const m of matches) {
    for (const [playerId, deckId] of [[m.player1, m.deck1], [m.player2, m.deck2]]) {
      if (counts.has(playerId) && defaultDeckByPlayer.get(playerId) === deckId) {
        counts.set(playerId, counts.get(playerId) + 1);
      }
    }
  }

  return counts;
}

// Given `candidates` (entities eligible to BE flagged) and `comparisonField`
// (the full population to compare against — a superset of `candidates`),
// finds which candidates are significantly behind or ahead of EVERY member
// of the comparison field (not just the nearest one — same conservative
// "separated from the whole field" rule as flagWeakDecks). A candidate is
// compared against the full field, not just other candidates, so an
// under-sampled entity being excluded from candidacy doesn't silently
// shrink who it has to beat (matching flagWeakDecks: match-count gates
// candidacy, but comparison is always against all `activeDeckIds`). Pure
// and fit-independent, so it's testable directly with fabricated ratings
// rather than another hand-tuned Bradley-Terry fixture — this repo has a
// history of subtle statistical fixture bugs (see the comment on
// `makeMatches` in the test file), so isolating the comparison logic from
// the fit avoids that risk entirely.
export function findRatingOutliers(candidates, comparisonField, confidenceZ) {
  const weak = [];
  const strong = [];

  for (const r of candidates) {
    const others = comparisonField.filter((o) => o.id !== r.id);
    if (others.length === 0) continue;

    const upper = r.value + confidenceZ * r.se;
    const lower = r.value - confidenceZ * r.se;

    const isBehindAll = others.every((o) => upper < o.value - confidenceZ * o.se);
    const isAheadAll = others.every((o) => lower > o.value + confidenceZ * o.se);

    if (isBehindAll) weak.push(r.id);
    if (isAheadAll) strong.push(r.id);
  }

  return { weak, strong };
}

// A player is only meaningful for the "default team" comparison if their
// default deck is still active — if a deck gets rebuilt/retired without
// updating the owner's `defaultDeck` pointer in players.json, this keeps
// combinedPlayerDeckRating from being called with a retired deck id (which
// throws, per its underlying paramVectorFor lookup) and quietly excludes
// that player instead of crashing the whole page.
function playersWithActiveDefaultDeck(players, deckIds) {
  return players.filter((p) => deckIds.includes(p.defaultDeck));
}

// Computes every eligible-for-comparison player's combined "default team"
// rating in one place, so flagFairnessOutliers and the boost-progress
// widget (below) stay consistent about who's even in the running.
function combinedRatingsByPlayer(fit, players, playerIds, deckIds) {
  return playersWithActiveDefaultDeck(players, deckIds).map((p) => ({
    id: p.id,
    ...combinedPlayerDeckRating(fit, p.id, p.defaultDeck, playerIds, deckIds),
  }));
}

// Flags when a specific player's "default team" (them playing their own
// usual deck) is significantly ahead of or behind every other player's
// default team, using the family's chosen confidence level and match-count
// floor (same defaults as flagWeakDecks — see that function's comment).
// This is a genuinely different question from flagWeakDecks: a deck's own
// (skill-controlled) strength can look perfectly fine while the deck's
// *usual owner* still wins or loses far more than everyone else once their
// own skill is folded back in — which matters in practice, since most
// games ARE played with default decks. `weak` and `strong` are reported
// separately since both directions are informative (one team dominating is
// as much a fairness signal as one struggling).
export function flagFairnessOutliers(fit, players, playerIds, deckIds, matches, minMatches = 5, confidenceZ = 1.28) {
  if (players.length < 2) return { weak: [], strong: [] };

  const counts = countDefaultComboMatches(matches, players);
  const ratings = combinedRatingsByPlayer(fit, players, playerIds, deckIds);
  const candidates = ratings.filter((r) => (counts.get(r.id) || 0) >= minMatches);

  return findRatingOutliers(candidates, ratings, confidenceZ);
}

// Independent of whether anyone has actually crossed the flagging
// threshold yet, this spotlights whichever player's default team currently
// has the weakest combined rating and reports how close they are to a real
// "boost available" flag — so the site always has something to show,
// rather than staying silent for however long it takes to get a clean
// flag. Only the WEAK direction is considered (a player being far AHEAD
// isn't a "boost your deck" candidate).
//
// Progress is the product of two independent 0-1 factors, mirroring the
// two-part AND-gate flagWeakDecks/flagFairnessOutliers actually use:
//   - dataProgress: how close this player is to the minMatches floor.
//   - marginProgress: how close their rating is to being clearly behind
//     the single nearest competitor (the binding constraint — beating the
//     closest rival is what "behind everyone" ultimately comes down to).
//     0 when the two point estimates are exactly tied (nothing separates
//     them yet), 1 once the confidence intervals fully separate (the same
//     condition flagFairnessOutliers checks), linear in between. This is a
//     display heuristic for a progress bar, not a probability — it isn't
//     used anywhere flagging decisions are actually made.
// Returns null if fewer than 2 players have an active default deck (no one
// to compare against at all).
export function computeBoostProgress(fit, players, playerIds, deckIds, matches, minMatches = 5, confidenceZ = 1.28) {
  const ratings = combinedRatingsByPlayer(fit, players, playerIds, deckIds);
  if (ratings.length < 2) return null;

  const counts = countDefaultComboMatches(matches, players);
  const [weakest] = [...ratings].sort((a, b) => a.value - b.value);
  const others = ratings.filter((o) => o.id !== weakest.id);

  const upper = weakest.value + confidenceZ * weakest.se;
  let marginProgress = 1;
  for (const o of others) {
    const otherLower = o.value - confidenceZ * o.se;
    const margin = otherLower - upper; // >= 0 once separated from this rival
    const requiredGap = confidenceZ * (weakest.se + o.se);
    const thisRivalProgress = requiredGap > 0 ? Math.min(Math.max(1 + margin / requiredGap, 0), 1) : 1;
    marginProgress = Math.min(marginProgress, thisRivalProgress);
  }

  const dataProgress = Math.min((counts.get(weakest.id) || 0) / minMatches, 1);
  const progress = dataProgress * marginProgress;
  const flagged = flagFairnessOutliers(fit, players, playerIds, deckIds, matches, minMatches, confidenceZ).weak.includes(
    weakest.id
  );

  return { playerId: weakest.id, progress, flagged };
}

// 1 at a perfect 50/50 prediction, 0 at a certain outcome.
function closeness(predictedWinProbA) {
  return 1 - Math.abs(predictedWinProbA - 0.5) * 2;
}

// A candidate counts as "genuinely competitive" once closeness(p) >= 0.3,
// i.e. |p - 0.5| <= 0.35, i.e. p in [15%, 85%]. Verified against live data
// that this isn't a fragile knife-edge: thresholds from 0.2 to 0.5 all
// produce identical picks on the current dataset (the current data has no
// candidates in the ambiguous middle of that range).
const COMPETITIVE_CLOSENESS_THRESHOLD = 0.3;

// Picks the best candidate for one pair: a genuinely competitive option is
// preferred over a merely informative one, since a pure information-gain
// ranking systematically favors matchups involving whichever player/deck
// has the least data — and those often look like near-certain blowouts
// even though the prediction itself is unreliable, not a fun match to
// actually sit down and play. Only when no candidate is reasonably close
// does this fall back to the most informative (but possibly lopsided) one.
// Within whichever pool applies, information gain still breaks ties, so a
// close-but-uninformative rematch (a pairing that's already been played
// many times) doesn't out-rank a close-and-informative one. Exported and
// pure (plain `{predictedWinProbA, gain}` objects in, no fit required) so
// this selection rule can be tested directly, independent of any
// statistical fixture.
export function selectBestCandidate(candidates) {
  if (candidates.length === 0) {
    throw new Error('selectBestCandidate requires at least one candidate');
  }

  const competitive = candidates.filter((c) => closeness(c.predictedWinProbA) >= COMPETITIVE_CLOSENESS_THRESHOLD);
  const pool = competitive.length > 0 ? competitive : candidates;
  const [best] = [...pool].sort((a, b) => b.gain - a.gain);
  return { ...best, competitiveMatchAvailable: competitive.length > 0 };
}

// Returns one recommended deck matchup per unique player pair (so every
// pairing always has an answer for "which decks should we play"). For n
// active players this is n*(n-1)/2 suggestions. Mirror matchups
// (deckA === deckB) are excluded — asking two players to both play the
// identical deck isn't practically meaningful advice.
export function suggestMatchups(fit, activePlayerIds, activeDeckIds) {
  const suggestions = [];

  for (let i = 0; i < activePlayerIds.length; i++) {
    for (let j = i + 1; j < activePlayerIds.length; j++) {
      const playerA = activePlayerIds[i];
      const playerB = activePlayerIds[j];
      const candidates = [];

      for (const deckA of activeDeckIds) {
        for (const deckB of activeDeckIds) {
          if (deckA === deckB) continue;
          const x = buildDesignRow(playerA, deckA, playerB, deckB, fit.playerIndex, fit.deckIndex, fit.numFree);
          const p = predictWinProbability(fit, playerA, deckA, playerB, deckB);
          const w = p * (1 - p);
          const gain = shermanMorrisonGain(fit.cov, x, w);
          candidates.push({ playerA, deckA, playerB, deckB, predictedWinProbA: p, gain });
        }
      }

      if (candidates.length === 0) continue; // no non-mirror deck combo exists for this pair
      suggestions.push(selectBestCandidate(candidates));
    }
  }

  // Genuinely competitive pairs surface before fallback (no-close-option)
  // ones, so the panel leads with fun games to actually play; gain still
  // orders within each group.
  suggestions.sort((a, b) => {
    if (a.competitiveMatchAvailable !== b.competitiveMatchAvailable) {
      return a.competitiveMatchAvailable ? -1 : 1;
    }
    return b.gain - a.gain;
  });
  return suggestions;
}
