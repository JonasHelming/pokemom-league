const TYPE_COLORS = {
  fire: '#f87171',
  electric: '#facc15',
  fighting: '#ea580c',
  darkness: '#44403c',
};

const SECTION_CLASS = 'mb-6 tv:mb-10';
const HEADING_CLASS = 'text-xl font-semibold mb-2 tv:text-4xl tv:mb-4';
const TABLE_CLASS = 'w-full text-left border-collapse tv:text-2xl';
const CELL_CLASS = 'p-2 border-b border-slate-200 tv:p-4';

export function getTypeColor(deckId) {
  return TYPE_COLORS[deckId] || null;
}

// `entries` may optionally carry an `ownerCombined: { value, se, ownerName }`
// field (used for the deck leaderboard) — when present, the deck-as-played-
// by-its-default-owner number is shown as the prominent rating (this is
// what matters in practice, since most games are played with default
// decks), with the deck's own skill-controlled strength (`value`/`se`)
// shown as a smaller secondary annotation. Sort order is unaffected by
// this — callers still sort `entries` by whichever value they consider the
// ranking key before calling this function.
export function renderLeaderboardHTML(title, entries, colorFor = () => null) {
  const rows = entries
    .map((e, i) => {
      const color = colorFor(e.id);
      const style = color ? ` style="border-left: 4px solid ${color}"` : '';
      const range = e.se !== undefined ? ` (±${Math.round(1.96 * e.se)})` : '';
      let ratingCell;
      if (e.ownerCombined) {
        const ownerRange = e.ownerCombined.se !== undefined ? ` (±${Math.round(1.96 * e.ownerCombined.se)})` : '';
        ratingCell = `${Math.round(e.ownerCombined.value)}${ownerRange} <span class="text-slate-500 text-sm tv:text-xl">as played by ${e.ownerCombined.ownerName} — deck alone: ${Math.round(e.value)}${range}</span>`;
      } else {
        ratingCell = `${Math.round(e.value)}${range}`;
      }
      return `<tr${style}><td class="${CELL_CLASS}">${i + 1}</td><td class="${CELL_CLASS}">${e.name}</td><td class="${CELL_CLASS}">${ratingCell}</td></tr>`;
    })
    .join('');
  return `<section class="${SECTION_CLASS}"><h2 class="${HEADING_CLASS}">${title}</h2><table class="${TABLE_CLASS}"><thead><tr><th class="${CELL_CLASS}">#</th><th class="${CELL_CLASS}">Name</th><th class="${CELL_CLASS}">Rating</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

export function renderHeadToHeadHTML(title, ids, namesById, matches, field) {
  const wins = new Map();
  const key = (a, b) => `${a}|${b}`;

  for (const m of matches) {
    if (field === 'player') {
      const winnerId = m.winner;
      const loserId = winnerId === m.player1 ? m.player2 : m.player1;
      wins.set(key(winnerId, loserId), (wins.get(key(winnerId, loserId)) || 0) + 1);
    } else {
      const winningDeck = m.winner === m.player1 ? m.deck1 : m.deck2;
      const losingDeck = winningDeck === m.deck1 ? m.deck2 : m.deck1;
      wins.set(key(winningDeck, losingDeck), (wins.get(key(winningDeck, losingDeck)) || 0) + 1);
    }
  }

  const header = `<tr><th class="${CELL_CLASS}"></th>${ids.map((id) => `<th class="${CELL_CLASS}">${namesById[id]}</th>`).join('')}</tr>`;
  const rows = ids
    .map((rowId) => {
      const cells = ids
        .map((colId) => (rowId === colId ? '—' : String(wins.get(key(rowId, colId)) || 0)))
        .map((v) => `<td class="${CELL_CLASS}">${v}</td>`)
        .join('');
      return `<tr><th class="${CELL_CLASS}">${namesById[rowId]}</th>${cells}</tr>`;
    })
    .join('');

  return `<section class="${SECTION_CLASS}"><h2 class="${HEADING_CLASS}">${title}</h2><table class="${TABLE_CLASS}"><thead>${header}</thead><tbody>${rows}</tbody></table></section>`;
}

export function renderMatchHistoryHTML(matches, playersById, decksById) {
  const sorted = [...matches].sort((a, b) => b.date.localeCompare(a.date));
  const rows = sorted
    .map((m) => {
      const p1 = `${playersById[m.player1]} (${decksById[m.deck1]})`;
      const p2 = `${playersById[m.player2]} (${decksById[m.deck2]})`;
      return `<tr><td class="${CELL_CLASS}">${m.date}</td><td class="${CELL_CLASS}">${p1}</td><td class="${CELL_CLASS}">${p2}</td><td class="${CELL_CLASS}">${playersById[m.winner]}</td></tr>`;
    })
    .join('');
  return `<section class="${SECTION_CLASS}"><h2 class="${HEADING_CLASS}">Match History</h2><table class="${TABLE_CLASS}"><thead><tr><th class="${CELL_CLASS}">Date</th><th class="${CELL_CLASS}">Player 1</th><th class="${CELL_CLASS}">Player 2</th><th class="${CELL_CLASS}">Winner</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

export function renderWeakDeckBannersHTML(flaggedDeckIds, decksById) {
  if (flaggedDeckIds.length === 0) return '';
  const items = flaggedDeckIds
    .map((id) => `<li class="p-2 tv:p-4 tv:text-2xl">⚠️ ${decksById[id]} — significantly behind by the family's own confidence threshold, consider a rebuild</li>`)
    .join('');
  return `<ul class="weak-deck-banners bg-amber-100 rounded mb-4 tv:mb-8">${items}</ul>`;
}

// `fairness` is `{ weak: string[], strong: string[] }` of player ids whose
// "default team" (them playing their own usual deck) is significantly
// behind or ahead of everyone else's — a different question from the deck
// banner above, since it folds the player's own skill back in and answers
// "is the league fair in practice," not "is this deck inherently weak."
export function renderFairnessBannersHTML(fairness, playersById, decksById, players) {
  const defaultDeckByPlayer = new Map(players.map((p) => [p.id, p.defaultDeck]));
  const describe = (playerId) => `${playersById[playerId]}'s ${decksById[defaultDeckByPlayer.get(playerId)]} team`;

  const weakItems = fairness.weak.map(
    (id) => `<li class="p-2 tv:p-4 tv:text-2xl">📉 ${describe(id)} is significantly behind everyone else's default team in practice</li>`
  );
  const strongItems = fairness.strong.map(
    (id) => `<li class="p-2 tv:p-4 tv:text-2xl">📈 ${describe(id)} is significantly ahead of everyone else's default team in practice</li>`
  );
  const items = [...weakItems, ...strongItems];
  if (items.length === 0) return '';

  return `<ul class="fairness-banners bg-sky-100 rounded mb-4 tv:mb-8">${items.join('')}</ul>`;
}

export function renderSuggestionsPanelHTML(suggestions, playersById, decksById) {
  const items = suggestions
    .map((s) => {
      const pct = Math.round(s.predictedWinProbA * 100);
      return `<li class="${CELL_CLASS}">${playersById[s.playerA]} (${decksById[s.deckA]}) vs ${playersById[s.playerB]} (${decksById[s.deckB]}) — predicted ${pct}% / ${100 - pct}%</li>`;
    })
    .join('');
  return `<section class="${SECTION_CLASS}"><h2 class="${HEADING_CLASS}">Best Deck Matchup For Each Pair</h2><ol class="${TABLE_CLASS}">${items}</ol></section>`;
}
