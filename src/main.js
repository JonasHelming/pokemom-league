import { loadLeagueData } from './data.js';
import { fitBradleyTerry, meanCenteredRatings, combinedPlayerDeckRating, toEloScale, ELO_SCALE } from './bradley-terry.js';
import { computeRatingHistory } from './history.js';
import {
  flagWeakDecks,
  flagFairnessOutliers,
  computeBoostProgress,
  playersWithActiveDefaultDeck,
  suggestMatchups,
} from './recommendations.js';
import {
  renderLeaderboardHTML,
  renderHeadToHeadHTML,
  renderMatchHistoryHTML,
  renderWeakDeckBannersHTML,
  renderFairnessBannersHTML,
  renderBoostProgressHTML,
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
  const deckEntries = deckIds
    .map((id) => ({
      id,
      name: namesById[id],
      value: toEloScale(deckRatings[id].value),
      se: deckRatings[id].se * ELO_SCALE,
    }))
    .sort((a, b) => b.value - a.value);

  // Player + Deck: each player's combined rating with their own default
  // deck — a genuinely different ranking from either above (see the design
  // spec's "Practical fairness" section), so it gets its own table rather
  // than being folded into the deck leaderboard. Players whose default
  // deck has since been retired are skipped (nothing meaningful to show).
  const playerDeckEntries = playersWithActiveDefaultDeck(players, deckIds)
    .map((p) => {
      const combined = combinedPlayerDeckRating(fit, p.id, p.defaultDeck, playerIds, deckIds);
      return {
        id: p.id,
        name: `${p.name} (${namesById[p.defaultDeck]})`,
        value: toEloScale(combined.value),
        se: combined.se * ELO_SCALE,
      };
    })
    .sort((a, b) => b.value - a.value);

  document.getElementById('player-leaderboard').innerHTML = renderLeaderboardHTML('Spieler', playerEntries);
  document.getElementById('player-head-to-head').innerHTML =
    renderHeadToHeadHTML('Spieler im direkten Vergleich', playerIds, namesById, matches, 'player');

  document.getElementById('deck-leaderboard').innerHTML = renderLeaderboardHTML('Decks', deckEntries, getTypeColor);
  document.getElementById('deck-head-to-head').innerHTML =
    renderHeadToHeadHTML('Deck im direkten Vergleich', deckIds, namesById, matches, 'deck');

  document.getElementById('player-deck-leaderboard').innerHTML = renderLeaderboardHTML('Spieler + Deck', playerDeckEntries);

  const suggestions = suggestMatchups(fit, playerIds, deckIds);
  document.getElementById('suggestions-panel').innerHTML =
    renderSuggestionsPanelHTML(suggestions, namesById, namesById);

  const boostProgress = computeBoostProgress(fit, players, playerIds, deckIds, matches);
  document.getElementById('boost-progress').innerHTML = renderBoostProgressHTML(boostProgress, namesById, namesById, players);

  const flagged = flagWeakDecks(fit, deckIds, matches);
  document.getElementById('weak-deck-banners').innerHTML = renderWeakDeckBannersHTML(flagged, namesById);

  const fairness = flagFairnessOutliers(fit, players, playerIds, deckIds, matches);
  document.getElementById('fairness-banners').innerHTML = renderFairnessBannersHTML(fairness, namesById, namesById, players);

  document.getElementById('match-history').innerHTML = renderMatchHistoryHTML(matches, namesById, namesById);

  const history = computeRatingHistory(matches, playerIds, deckIds);
  renderRatingChart(document.getElementById('player-rating-chart'), buildChartDatasets(history, playerIds, namesById, 'player'));
  renderRatingChart(document.getElementById('deck-rating-chart'), buildChartDatasets(history, deckIds, namesById, 'deck', getTypeColor));
}

document.addEventListener('DOMContentLoaded', main);
