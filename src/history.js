import { fitBradleyTerry, meanCenteredRatings, toEloScale, computeDeckPriors } from './bradley-terry.js';

// `decks` (full deck metadata, including retired versions) drives the
// carry-over prior computed fresh at each chronological prefix — the same
// prior fitBradleyTerry applies live in main.js, just recomputed per
// snapshot so a rebuilt deck's prior visibly decays match by match across
// the chart, not just in the final, present-day rating.
export function computeRatingHistory(matches, playerIds, deckIds, decks = []) {
  const sorted = [...matches].sort((a, b) => a.date.localeCompare(b.date));
  const snapshots = [];
  const deckMatchCounts = new Map(deckIds.map((id) => [id, 0]));

  for (let i = 1; i <= sorted.length; i++) {
    const subset = sorted.slice(0, i);
    const deckPriors = computeDeckPriors(subset, playerIds, deckIds, decks);
    const fit = fitBradleyTerry(subset, playerIds, deckIds, deckPriors);
    const playerRatings = meanCenteredRatings(fit, 'player', playerIds);
    const deckRatings = meanCenteredRatings(fit, 'deck', deckIds);

    const latestMatch = sorted[i - 1];
    for (const deckId of [latestMatch.deck1, latestMatch.deck2]) {
      if (deckMatchCounts.has(deckId)) deckMatchCounts.set(deckId, deckMatchCounts.get(deckId) + 1);
    }

    snapshots.push({
      date: latestMatch.date,
      playerRatings: Object.fromEntries(playerIds.map((id) => [id, toEloScale(playerRatings[id].value)])),
      deckRatings: Object.fromEntries(deckIds.map((id) => [id, toEloScale(deckRatings[id].value)])),
      deckMatchCounts: Object.fromEntries(deckMatchCounts),
    });
  }

  return snapshots;
}
