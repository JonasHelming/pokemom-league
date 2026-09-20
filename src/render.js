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

export function renderLeaderboardHTML(title, entries, colorFor = () => null) {
  const rows = entries
    .map((e, i) => {
      const color = colorFor(e.id);
      const style = color ? ` style="border-left: 4px solid ${color}"` : '';
      const range = e.se !== undefined ? ` <span class="text-slate-500 text-sm tv:text-xl">(±${Math.round(1.96 * e.se)})</span>` : '';
      return `<tr${style}><td class="${CELL_CLASS}">${i + 1}</td><td class="${CELL_CLASS}">${e.name}</td><td class="${CELL_CLASS}">${Math.round(e.value)}${range}</td></tr>`;
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
    .map((id) => `<li class="p-2 tv:p-4 tv:text-2xl">⚠️ ${decksById[id]} — significantly behind at 80% confidence, consider a rebuild</li>`)
    .join('');
  return `<ul class="weak-deck-banners bg-amber-100 rounded mb-4 tv:mb-8">${items}</ul>`;
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
