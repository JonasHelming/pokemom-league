import assert from 'node:assert/strict';
import {
  renderLeaderboardHTML,
  renderHeadToHeadHTML,
  renderMatchHistoryHTML,
  renderWeakDeckBannersHTML,
  renderFairnessBannersHTML,
  renderSuggestionsPanelHTML,
  getTypeColor,
} from '../src/render.js';

const leaderboardHTML = renderLeaderboardHTML('Players', [
  { id: 'A', name: 'Alice', value: 1050 },
  { id: 'B', name: 'Bob', value: 950 },
]);
assert.ok(leaderboardHTML.indexOf('Alice') < leaderboardHTML.indexOf('Bob'));
assert.ok(leaderboardHTML.includes('1050'));
assert.ok(!leaderboardHTML.includes('border-left'), 'no colorFor given -> no accent styling');
assert.ok(!leaderboardHTML.includes('±'), 'no se given -> no confidence range shown');

const leaderboardWithSeHTML = renderLeaderboardHTML('Players', [
  { id: 'A', name: 'Alice', value: 1050, se: 60 },
]);
assert.ok(leaderboardWithSeHTML.includes('±118'), 'se=60 -> 95% range is ±round(1.96*60)=±118');

const deckLeaderboardHTML = renderLeaderboardHTML(
  'Decks',
  [{ id: 'fire', name: 'Fire', value: 1010 }],
  getTypeColor
);
assert.ok(deckLeaderboardHTML.includes('border-left'));
assert.equal(getTypeColor('fire'), '#f87171');
assert.equal(getTypeColor('unknown-deck'), null);

const matches = [
  { player1: 'A', deck1: 'x', player2: 'B', deck2: 'y', winner: 'A', date: '2026-01-01' },
  { player1: 'B', deck1: 'y', player2: 'A', deck2: 'x', winner: 'B', date: '2026-01-02' },
];
const namesById = { A: 'Alice', B: 'Bob', x: 'Fire', y: 'Water' };

const headToHeadHTML = renderHeadToHeadHTML('Player H2H', ['A', 'B'], namesById, matches, 'player');
assert.ok(headToHeadHTML.includes('Alice'));
assert.ok(headToHeadHTML.includes('Bob'));

const deckHeadToHeadHTML = renderHeadToHeadHTML('Deck H2H', ['x', 'y'], namesById, matches, 'deck');
assert.ok(deckHeadToHeadHTML.includes('Fire'));
assert.ok(deckHeadToHeadHTML.includes('Water'));

const historyHTML = renderMatchHistoryHTML(matches, namesById, namesById);
assert.ok(historyHTML.indexOf('2026-01-02') < historyHTML.indexOf('2026-01-01'), 'newest match should appear first');

assert.equal(renderWeakDeckBannersHTML([], namesById), '');
const bannerHTML = renderWeakDeckBannersHTML(['y'], namesById);
assert.ok(bannerHTML.includes('Water'));
assert.ok(bannerHTML.includes('rebuild'));
assert.ok(bannerHTML.includes('confidence threshold'), 'banner should not claim a specific, not-quite-accurate percentage');

// Deck leaderboard rows can carry an `ownerCombined` field: the combined
// deck+owner rating is shown as the prominent number, with the deck's own
// isolated strength demoted to a smaller secondary annotation.
const deckWithOwnerHTML = renderLeaderboardHTML('Decks', [
  { id: 'fire', name: 'Fire', value: 1010, se: 50, ownerCombined: { value: 1200, se: 30, ownerName: 'Alice' } },
]);
assert.ok(deckWithOwnerHTML.includes('1200'), 'combined value should be shown');
assert.ok(deckWithOwnerHTML.includes('±59'), 'combined se=30 -> ±round(1.96*30)=±59');
assert.ok(deckWithOwnerHTML.includes('1010'), 'deck-alone value should still be shown, as a secondary annotation');
assert.ok(deckWithOwnerHTML.includes('Alice'), 'owner name should be shown');
assert.ok(
  deckWithOwnerHTML.indexOf('1200') < deckWithOwnerHTML.indexOf('1010'),
  'combined value should appear before (be more prominent than) the deck-alone value'
);

// Without an ownerCombined field, rendering is unaffected (backward compatible).
assert.ok(!deckLeaderboardHTML.includes('as played by'));

const fairnessPlayers = [
  { id: 'A', name: 'A', defaultDeck: 'x' },
  { id: 'B', name: 'B', defaultDeck: 'y' },
];
assert.equal(renderFairnessBannersHTML({ weak: [], strong: [] }, namesById, namesById, fairnessPlayers), '');
const fairnessHTML = renderFairnessBannersHTML({ weak: ['B'], strong: ['A'] }, namesById, namesById, fairnessPlayers);
assert.ok(fairnessHTML.includes('Bob'), 'weak player should be named');
assert.ok(fairnessHTML.includes('Alice'), 'strong player should be named');
assert.ok(fairnessHTML.includes('Water'), "weak player's default deck should be named");
assert.ok(fairnessHTML.includes('Fire'), "strong player's default deck should be named");

const suggestionsHTML = renderSuggestionsPanelHTML(
  [{ playerA: 'A', deckA: 'x', playerB: 'B', deckB: 'y', predictedWinProbA: 0.6, gain: 1 }],
  namesById,
  namesById
);
assert.ok(suggestionsHTML.includes('Alice'));
assert.ok(suggestionsHTML.includes('60%'));
assert.ok(suggestionsHTML.includes('Best Deck Matchup For Each Pair'));

console.log('OK: render.test.js');
