const TYPE_COLORS = {
  fire: '#f87171',
  electric: '#facc15',
  fighting: '#ea580c',
  darkness: '#a78bfa',
};

// bg/border are parameterized rather than baked into a shared constant so a
// tinted card (e.g. the "upgrade available" banner) never has two classes
// setting the same CSS property (e.g. `border-slate-800` AND
// `border-emerald-800`) on the same element — which class wins there depends
// on Tailwind's internal stylesheet order, not on order in the class
// attribute, so that pattern is a real (if subtle) bug risk, not just style.
function sectionClass(bg = 'bg-slate-900/60', border = 'border-slate-800') {
  return `mb-6 tv:mb-10 rounded-xl p-4 tv:p-8 shadow-lg shadow-black/30 border ${border} ${bg}`;
}
const SECTION_CLASS = sectionClass();
const HEADING_CLASS = 'text-lg font-display font-bold text-amber-300 mb-3 tv:text-3xl tv:mb-6';
const TABLE_CLASS = 'w-full text-left border-collapse tv:text-2xl';
const CELL_CLASS = 'p-2 border-b border-slate-800 tv:p-4';

export function getTypeColor(deckId) {
  return TYPE_COLORS[deckId] || null;
}

export function renderLeaderboardHTML(title, entries, colorFor = () => null) {
  const rows = entries
    .map((e, i) => {
      const color = colorFor(e.id);
      const style = color ? ` style="border-left: 4px solid ${color}"` : '';
      const range = e.se !== undefined ? ` <span class="text-slate-400 text-sm tv:text-xl">(±${Math.round(1.96 * e.se)})</span>` : '';
      return `<tr${style}><td class="${CELL_CLASS}">${i + 1}</td><td class="${CELL_CLASS}">${e.name}</td><td class="${CELL_CLASS}">${Math.round(e.value)}${range}</td></tr>`;
    })
    .join('');
  return `<section class="${SECTION_CLASS}"><h2 class="${HEADING_CLASS}">${title}</h2><table class="${TABLE_CLASS}"><thead><tr><th class="${CELL_CLASS}">#</th><th class="${CELL_CLASS}">Name</th><th class="${CELL_CLASS}">Wertung</th></tr></thead><tbody>${rows}</tbody></table></section>`;
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
  return `<section class="${SECTION_CLASS}"><h2 class="${HEADING_CLASS}">Spielverlauf</h2><table class="${TABLE_CLASS}"><thead><tr><th class="${CELL_CLASS}">Datum</th><th class="${CELL_CLASS}">Spieler 1</th><th class="${CELL_CLASS}">Spieler 2</th><th class="${CELL_CLASS}">Sieger</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

export function renderWeakDeckBannersHTML(flaggedDeckIds, decksById) {
  if (flaggedDeckIds.length === 0) return '';
  const items = flaggedDeckIds
    .map((id) => `<li class="p-2 tv:p-4 tv:text-2xl">⚠️ ${decksById[id]} liegt laut unserem eigenen Konfidenz-Schwellenwert deutlich zurück — Zeit für einen Umbau</li>`)
    .join('');
  return `<ul class="weak-deck-banners bg-amber-950/40 border border-amber-800 text-amber-200 rounded-xl mb-4 tv:mb-8">${items}</ul>`;
}

// `fairness` is `{ weak: string[], strong: string[] }` of player ids whose
// "default team" (them playing their own usual deck) is significantly
// behind or ahead of everyone else's — a different question from the deck
// banner above, since it folds the player's own skill back in and answers
// "is the league fair in practice," not "is this deck inherently weak."
export function renderFairnessBannersHTML(fairness, playersById, decksById, players) {
  const defaultDeckByPlayer = new Map(players.map((p) => [p.id, p.defaultDeck]));
  // A flagged id whose name/deck can't be resolved (e.g. stale data) is
  // skipped rather than shipping a literal "undefined" string to the page.
  const describe = (playerId) => {
    const playerName = playersById[playerId];
    const deckName = decksById[defaultDeckByPlayer.get(playerId)];
    if (!playerName || !deckName) return null;
    return `${playerName}s ${deckName}-Team`;
  };

  const weakItems = fairness.weak
    .map(describe)
    .filter(Boolean)
    .map((desc) => `<li class="p-2 tv:p-4 tv:text-2xl">📉 ${desc} liegt in der Praxis deutlich hinter den Standard-Teams aller anderen zurück</li>`);
  const strongItems = fairness.strong
    .map(describe)
    .filter(Boolean)
    .map((desc) => `<li class="p-2 tv:p-4 tv:text-2xl">📈 ${desc} liegt in der Praxis deutlich vor den Standard-Teams aller anderen</li>`);
  const items = [...weakItems, ...strongItems];
  if (items.length === 0) return '';

  return `<ul class="fairness-banners bg-sky-950/40 border border-sky-800 text-sky-200 rounded-xl mb-4 tv:mb-8">${items.join('')}</ul>`;
}

// One card per player currently below the group average (see
// computeBoostProgress) — every kid who's behind gets their own bar to
// watch fill up, not just whoever is in last place, so the site has
// something to show long before any statistically clean flag exists.
// `progress` bars are typically many-minutes/matches away from filling, so
// this is meant to read as a slow-building gauge, not a per-match jump.
export function renderBoostProgressHTML(boostProgressList, playersById, decksById, players) {
  if (!boostProgressList || boostProgressList.length === 0) return '';

  const defaultDeckByPlayer = new Map(players.map((p) => [p.id, p.defaultDeck]));

  return boostProgressList
    .map((boostProgress) => {
      const playerName = playersById[boostProgress.playerId];
      const deckName = decksById[defaultDeckByPlayer.get(boostProgress.playerId)];
      if (!playerName || !deckName) return '';

      const pct = Math.round(boostProgress.progress * 100);

      if (boostProgress.flagged) {
        return `<section class="${sectionClass('bg-emerald-950/40', 'border-emerald-800')}">
          <h2 class="${HEADING_CLASS}">🎉 Upgrade verfügbar!</h2>
          <p class="tv:text-3xl text-emerald-100">${playerName}s ${deckName}-Team liegt deutlich unter dem Durchschnitt aller anderen — Zeit für einen Umbau.</p>
        </section>`;
      }

      return `<section class="${SECTION_CLASS}">
        <h2 class="${HEADING_CLASS}">Nächstes wahrscheinliches Upgrade</h2>
        <p class="tv:text-2xl">${playerName}s ${deckName}-Team — ${pct}% auf dem Weg zur Umbau-Empfehlung</p>
        <div class="w-full bg-slate-800 rounded h-4 tv:h-8 mt-2">
          <div class="bg-amber-500 rounded h-4 tv:h-8" style="width: ${pct}%"></div>
        </div>
      </section>`;
    })
    .join('');
}

export function renderSuggestionsPanelHTML(suggestions, playersById, decksById) {
  const items = suggestions
    .map((s) => {
      const pct = Math.round(s.predictedWinProbA * 100);
      return `<li class="${CELL_CLASS}">${playersById[s.playerA]} (${decksById[s.deckA]}) gegen ${playersById[s.playerB]} (${decksById[s.deckB]}) — Prognose ${pct}% / ${100 - pct}%</li>`;
    })
    .join('');
  return `<section class="${SECTION_CLASS}"><h2 class="${HEADING_CLASS}">Beste Deck-Paarung pro Spielerpaar</h2><ol class="${TABLE_CLASS}">${items}</ol></section>`;
}
