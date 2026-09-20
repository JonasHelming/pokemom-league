import assert from 'node:assert/strict';
import {
  renderLeaderboardHTML,
  renderHeadToHeadHTML,
  renderMatchHistoryHTML,
  renderWeakDeckBannersHTML,
  renderFairnessBannersHTML,
  renderBoostProgressHTML,
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

// A flagged id whose name/default-deck can't be resolved is skipped rather
// than shipping a literal "undefined" string to the page.
const fairnessWithUnknown = renderFairnessBannersHTML({ weak: ['unknown'], strong: ['A'] }, namesById, namesById, fairnessPlayers);
assert.ok(!fairnessWithUnknown.includes('undefined'), 'unresolvable id must not render literal "undefined" text');
assert.ok(fairnessWithUnknown.includes('Alice'), 'the resolvable strong entry should still render');

assert.equal(renderBoostProgressHTML(null, namesById, namesById, fairnessPlayers), '', 'null (fewer than 2 comparable players) renders nothing');

const inProgressHTML = renderBoostProgressHTML({ playerId: 'B', progress: 0.42, flagged: false }, namesById, namesById, fairnessPlayers);
assert.ok(inProgressHTML.includes('Bob'), 'spotlighted player should be named');
assert.ok(inProgressHTML.includes('Water'), "spotlighted player's default deck should be named");
assert.ok(inProgressHTML.includes('42%'), 'progress percentage should be shown');
assert.ok(inProgressHTML.includes('width: 42%'), 'fill bar width should reflect progress');
assert.ok(!inProgressHTML.includes('Upgrade available'), 'not yet flagged -> no "upgrade available" state');

const flaggedProgressHTML = renderBoostProgressHTML({ playerId: 'B', progress: 1, flagged: true }, namesById, namesById, fairnessPlayers);
assert.ok(flaggedProgressHTML.includes('Upgrade available'), 'flagged -> visually distinct "upgrade available" state');
assert.ok(flaggedProgressHTML.includes('Bob'), 'flagged player should still be named');

// A player id not present in `players`/namesById degrades to an empty
// render rather than shipping "undefined" text.
assert.equal(
  renderBoostProgressHTML({ playerId: 'unknown', progress: 0.5, flagged: false }, namesById, namesById, fairnessPlayers),
  ''
);

const suggestionsHTML = renderSuggestionsPanelHTML(
  [{ playerA: 'A', deckA: 'x', playerB: 'B', deckB: 'y', predictedWinProbA: 0.6, gain: 1 }],
  namesById,
  namesById
);
assert.ok(suggestionsHTML.includes('Alice'));
assert.ok(suggestionsHTML.includes('60%'));
assert.ok(suggestionsHTML.includes('Best Deck Matchup For Each Pair'));

console.log('OK: render.test.js');
