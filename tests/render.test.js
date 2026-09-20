import assert from 'node:assert/strict';
import {
  renderLeaderboardHTML,
  renderHeadToHeadHTML,
  renderMatchHistoryHTML,
  renderWeakDeckBannersHTML,
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

const suggestionsHTML = renderSuggestionsPanelHTML(
  [{ playerA: 'A', deckA: 'x', playerB: 'B', deckB: 'y', predictedWinProbA: 0.6, gain: 1 }],
  namesById,
  namesById
);
assert.ok(suggestionsHTML.includes('Alice'));
assert.ok(suggestionsHTML.includes('60%'));

console.log('OK: render.test.js');
