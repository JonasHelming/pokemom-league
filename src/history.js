import { fitBradleyTerry, meanCenteredRatings, toEloScale } from './bradley-terry.js';

export function computeRatingHistory(matches, playerIds, deckIds) {
  const sorted = [...matches].sort((a, b) => a.date.localeCompare(b.date));
  const snapshots = [];

  for (let i = 1; i <= sorted.length; i++) {
    const subset = sorted.slice(0, i);
    const fit = fitBradleyTerry(subset, playerIds, deckIds);
    const playerRatings = meanCenteredRatings(fit, 'player', playerIds);
    const deckRatings = meanCenteredRatings(fit, 'deck', deckIds);

    snapshots.push({
      date: sorted[i - 1].date,
      playerRatings: Object.fromEntries(playerIds.map((id) => [id, toEloScale(playerRatings[id].value)])),
      deckRatings: Object.fromEntries(deckIds.map((id) => [id, toEloScale(deckRatings[id].value)])),
    });
  }

  return snapshots;
}
