import { loadLeagueData } from './data.js';
import { fitBradleyTerry, meanCenteredRatings, combinedPlayerDeckRating, toEloScale, ELO_SCALE } from './bradley-terry.js';
import { computeRatingHistory } from './history.js';
import { flagWeakDecks, flagFairnessOutliers, suggestMatchups } from './recommendations.js';
import {
  renderLeaderboardHTML,
  renderHeadToHeadHTML,
  renderMatchHistoryHTML,
  renderWeakDeckBannersHTML,
  renderFairnessBannersHTML,
  renderSuggestionsPanelHTML,
  getTypeColor,
} from './render.js';
import { buildChartDatasets, renderRatingChart } from './charts.js';

async function main() {
  const { players, decks, matches } = await loadLeagueData();
  const playerIds = players.map((p) => p.id);
  const activeDecks = decks.filter((d) => !d.retired);
  const deckIds = activeDecks.map((d) => d.id);
  const namesById = {
    ...Object.fromEntries(players.map((p) => [p.id, p.name])),
    ...Object.fromEntries(decks.map((d) => [d.id, d.name])),
  };

  const fit = fitBradleyTerry(matches, playerIds, deckIds);
  const playerRatings = meanCenteredRatings(fit, 'player', playerIds);
  const deckRatings = meanCenteredRatings(fit, 'deck', deckIds);

  const playerEntries = playerIds
    .map((id) => ({
      id,
      name: namesById[id],
      value: toEloScale(playerRatings[id].value),
      se: playerRatings[id].se * ELO_SCALE,
    }))
    .sort((a, b) => b.value - a.value);
  const ownerByDeck = new Map(activeDecks.map((d) => [d.id, d.owner]));
  const deckEntries = deckIds
    .map((id) => {
      const ownerId = ownerByDeck.get(id);
      const owner = combinedPlayerDeckRating(fit, ownerId, id, playerIds, deckIds);
      return {
        id,
        name: namesById[id],
        value: toEloScale(deckRatings[id].value),
        se: deckRatings[id].se * ELO_SCALE,
        ownerCombined: {
          value: toEloScale(owner.value),
          se: owner.se * ELO_SCALE,
          ownerName: namesById[ownerId],
        },
      };
    })
    .sort((a, b) => b.value - a.value);

  document.getElementById('player-leaderboard').innerHTML = renderLeaderboardHTML('Players', playerEntries);
  document.getElementById('deck-leaderboard').innerHTML = renderLeaderboardHTML('Decks', deckEntries, getTypeColor);
  document.getElementById('player-head-to-head').innerHTML =
    renderHeadToHeadHTML('Player Head-to-Head', playerIds, namesById, matches, 'player');
  document.getElementById('deck-head-to-head').innerHTML =
    renderHeadToHeadHTML('Deck Head-to-Head', deckIds, namesById, matches, 'deck');
  document.getElementById('match-history').innerHTML = renderMatchHistoryHTML(matches, namesById, namesById);

  const flagged = flagWeakDecks(fit, deckIds, matches);
  document.getElementById('weak-deck-banners').innerHTML = renderWeakDeckBannersHTML(flagged, namesById);

  const fairness = flagFairnessOutliers(fit, players, playerIds, deckIds, matches);
  document.getElementById('fairness-banners').innerHTML = renderFairnessBannersHTML(fairness, namesById, namesById, players);

  const suggestions = suggestMatchups(fit, playerIds, deckIds);
  document.getElementById('suggestions-panel').innerHTML =
    renderSuggestionsPanelHTML(suggestions, namesById, namesById);

  const history = computeRatingHistory(matches, playerIds, deckIds);
  renderRatingChart(document.getElementById('player-rating-chart'), buildChartDatasets(history, playerIds, namesById, 'player'));
  renderRatingChart(document.getElementById('deck-rating-chart'), buildChartDatasets(history, deckIds, namesById, 'deck'));
}

document.addEventListener('DOMContentLoaded', main);
