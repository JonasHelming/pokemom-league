import assert from 'node:assert/strict';
import {
  renderLeaderboardHTML,
  renderHeadToHeadHTML,
  renderMatchHistoryHTML,
  renderWeakDeckBannersHTML,
  renderFairnessBannersHTML,
  renderBoostProgressHTML,
  renderDeckBoostProgressHTML,
  renderSuggestionsPanelHTML,
  renderNewsReportHTML,
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

// A rebuild retires 'y' in favour of 'y-1', so the grid is drawn over the
// ACTIVE ids only. Without folding each match's deck onto its lineage head,
// every match ever played on 'y' stops matching any cell and the whole grid
// collapses to zeroes -- the league's entire deck-vs-deck record silently
// disappears the moment a deck is rebuilt.
const rebuildNames = { ...namesById, 'y-1': 'Water' };
const toHead = (id) => (id === 'y' ? 'y-1' : id);
const rebuiltH2H = renderHeadToHeadHTML('Deck H2H', ['x', 'y-1'], rebuildNames, matches, 'deck', toHead);
const yWins = matches.filter((m) => (m.winner === m.player1 ? m.deck1 : m.deck2) === 'y').length;
assert.ok(yWins > 0, 'fixture sanity: Water must have won at least one match on its pre-rebuild version');
assert.ok(
  rebuiltH2H.includes(`>${yWins}<`),
  'wins earned on the retired version must carry over to the rebuilt version\'s row, not vanish',
);

const historyHTML = renderMatchHistoryHTML(matches, namesById, namesById);
assert.ok(historyHTML.indexOf('2026-01-02') < historyHTML.indexOf('2026-01-01'), 'newest match should appear first');

assert.equal(renderWeakDeckBannersHTML([], namesById), '');
const bannerHTML = renderWeakDeckBannersHTML(['y'], namesById);
assert.ok(bannerHTML.includes('Water'));
assert.ok(bannerHTML.includes('Umbau'));
assert.ok(bannerHTML.includes('Konfidenz-Schwellenwert'), 'banner should not claim a specific, not-quite-accurate percentage');

// Now that flagWeakDecks can flag multiple decks below average at once (not
// just a single "clearly worst" deck), the banner must render one item per
// flagged deck.
const multiDeckBannerHTML = renderWeakDeckBannersHTML(['x', 'y'], namesById);
assert.ok(multiDeckBannerHTML.includes('Fire'));
assert.ok(multiDeckBannerHTML.includes('Water'));
assert.equal((multiDeckBannerHTML.match(/<li/g) || []).length, 2, 'each flagged deck should get its own list item');

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

assert.equal(renderBoostProgressHTML([], namesById, namesById, fairnessPlayers), '', 'empty list (fewer than 2 comparable players, or nobody behind) renders nothing');

const inProgressHTML = renderBoostProgressHTML([{ playerId: 'B', progress: 0.42, flagged: false }], namesById, namesById, fairnessPlayers);
assert.ok(inProgressHTML.includes('Bob'), 'spotlighted player should be named');
assert.ok(inProgressHTML.includes('Water'), "spotlighted player's default deck should be named");
assert.ok(inProgressHTML.includes('42%'), 'progress percentage should be shown');
assert.ok(inProgressHTML.includes('width: 42%'), 'fill bar width should reflect progress');
assert.ok(!inProgressHTML.includes('Upgrade verfügbar'), 'not yet flagged -> no "upgrade available" state');

const flaggedProgressHTML = renderBoostProgressHTML([{ playerId: 'B', progress: 1, flagged: true }], namesById, namesById, fairnessPlayers);
assert.ok(flaggedProgressHTML.includes('Upgrade verfügbar'), 'flagged -> visually distinct "upgrade available" state');
assert.ok(flaggedProgressHTML.includes('Bob'), 'flagged player should still be named');

// A player id not present in `players`/namesById degrades to an empty
// render rather than shipping "undefined" text.
assert.equal(
  renderBoostProgressHTML([{ playerId: 'unknown', progress: 0.5, flagged: false }], namesById, namesById, fairnessPlayers),
  ''
);

// renderDeckBoostProgressHTML: the deck analog of renderBoostProgressHTML —
// same progress-bar / "flagged" card shape, just keyed by deck id and
// needing only decksById (no player/default-deck lookup).
assert.equal(renderDeckBoostProgressHTML([], namesById), '', 'empty list renders nothing');

const deckInProgressHTML = renderDeckBoostProgressHTML([{ deckId: 'y', progress: 0.42, flagged: false }], namesById);
assert.ok(deckInProgressHTML.includes('Water'), 'spotlighted deck should be named');
assert.ok(deckInProgressHTML.includes('42%'), 'progress percentage should be shown');
assert.ok(deckInProgressHTML.includes('width: 42%'), 'fill bar width should reflect progress');
assert.ok(!deckInProgressHTML.includes('verfügbar'), 'not yet flagged -> no "available" state');

const deckFlaggedHTML = renderDeckBoostProgressHTML([{ deckId: 'y', progress: 1, flagged: true }], namesById);
assert.ok(deckFlaggedHTML.includes('verfügbar'), 'flagged -> visually distinct "available" state');
assert.ok(deckFlaggedHTML.includes('Water'), 'flagged deck should still be named');

// A deck id not present in decksById degrades to an empty render rather
// than shipping "undefined" text.
assert.equal(
  renderDeckBoostProgressHTML([{ deckId: 'unknown', progress: 0.5, flagged: false }], namesById),
  ''
);

const suggestionsHTML = renderSuggestionsPanelHTML(
  [{ playerA: 'A', deckA: 'x', playerB: 'B', deckB: 'y', predictedWinProbA: 0.6, gain: 1 }],
  namesById,
  namesById
);
assert.ok(suggestionsHTML.includes('Alice'));
assert.ok(suggestionsHTML.includes('60%'));
assert.ok(suggestionsHTML.includes('Beste Deck-Paarung pro Spielerpaar'));

// --- News ticker ---
//
// The ticker is hand-written prose stored as data, so it is content, not
// markup: it must be escaped on the way in, with exactly one formatting
// affordance (**bold**) for the numbers worth shouting about.
const report = {
  title: 'Liga-Ticker',
  date: '2026-10-10',
  sections: [{ emoji: '🏆', heading: 'J führt', body: 'Aktuell **14 Siege** in Serie.' }],
};
const reportHTML = renderNewsReportHTML(report);
assert.ok(reportHTML.includes('Liga-Ticker'));
assert.ok(reportHTML.includes('🏆'));
assert.ok(reportHTML.includes('<strong'), '**...** should become bold');
assert.ok(reportHTML.includes('14 Siege</strong>'), 'the bolded run itself must survive');
assert.ok(!reportHTML.includes('**'), 'no literal asterisks should leak into the page');

// Single asterisks are emphasis too -- without this they render as literal
// *Sternchen* in the middle of the prose.
const emphHTML = renderNewsReportHTML({
  title: 't',
  sections: [{ emoji: '', heading: 'h', body: 'Kleines Detail: *alle* sechs Niederlagen.' }],
});
assert.ok(emphHTML.includes('<em>alle</em>'), '*...* should become italic');
assert.ok(!emphHTML.includes('*'), 'no stray asterisk should survive rendering');

assert.equal(renderNewsReportHTML(null), '', 'a missing report renders nothing rather than breaking the page');
assert.equal(renderNewsReportHTML({ title: 'x', sections: [] }), '', 'an empty report renders nothing');

const unsafe = { title: 'T', date: 'd', sections: [{ emoji: '', heading: 'h', body: '<img src=x onerror=alert(1)>' }] };
assert.ok(!renderNewsReportHTML(unsafe).includes('<img'), 'report text must be escaped, never injected as HTML');

console.log('OK: render.test.js');
