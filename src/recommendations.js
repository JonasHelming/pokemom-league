import { meanCenteredRatings, buildDesignRow, predictWinProbability } from './bradley-terry.js';
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

// 1 at a perfect 50/50 prediction, 0 at a certain outcome.
function closeness(predictedWinProbA) {
  return 1 - Math.abs(predictedWinProbA - 0.5) * 2;
}

// A candidate counts as "genuinely competitive" once its predicted outcome
// is within 30 points of 50/50 (i.e. 35%-65%). Verified against live data
// that this isn't a fragile knife-edge: thresholds from 0.2 to 0.5 all
// produce identical picks on the current dataset.
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

  suggestions.sort((a, b) => b.gain - a.gain);
  return suggestions;
}
