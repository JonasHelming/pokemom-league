// Groups deck versions into lineages by walking `predecessor` links
// backward from each currently-active deck (a rebuilt-and-retired deck is
// never a lineage's own head — it's always an ancestor of whichever active
// version replaced it). A deck that's never been rebuilt is simply a
// lineage of one.
export function buildDeckLineages(decks) {
  const byId = new Map(decks.map((d) => [d.id, d]));
  return decks
    .filter((d) => !d.retired)
    .map((head) => {
      const chain = [head.id];
      let current = head;
      while (current.predecessor && byId.has(current.predecessor)) {
        chain.unshift(current.predecessor);
        current = byId.get(current.predecessor);
      }
      return { id: head.id, name: head.name, chain };
    });
}

// Merges a lineage's chain of deck-version ids into a single chart series:
// one continuous line using whichever version has actually been played so
// far, with exactly one `null` point forced in at each rebuild transition
// (the new version's own first real match) so Chart.js renders a visible
// gap marking the upgrade event, rather than either a misleading straight
// interpolation across two different rating fits or a hard restart to a
// separate line.
function lineageSeries(history, chain) {
  let activeIndex = -1;

  return history.map((snapshot) => {
    const counts = snapshot.deckMatchCounts || {};
    let latest = -1;
    for (let i = 0; i < chain.length; i++) {
      if ((counts[chain[i]] || 0) > 0) latest = i;
    }

    if (latest === -1) return null; // lineage hasn't started yet
    if (latest !== activeIndex) {
      const isRebuildTransition = activeIndex !== -1;
      activeIndex = latest;
      if (isRebuildTransition) return null;
    }

    return snapshot.deckRatings[chain[latest]];
  });
}

export function buildChartDatasets(history, ids, namesById, family, colorFor = () => null, decks = []) {
  const labels = history.map((snapshot) => snapshot.date);

  if (family === 'deck') {
    const datasets = buildDeckLineages(decks).map((lineage) => {
      const color = colorFor(lineage.id);
      return {
        label: namesById[lineage.id] ?? lineage.name,
        data: lineageSeries(history, lineage.chain),
        spanGaps: false,
        ...(color ? { borderColor: color, backgroundColor: color, pointBackgroundColor: color } : {}),
      };
    });
    return { labels, datasets };
  }

  const datasets = ids.map((id) => {
    const color = colorFor(id);
    return {
      label: namesById[id],
      data: history.map((snapshot) => snapshot.playerRatings[id]),
      ...(color ? { borderColor: color, backgroundColor: color, pointBackgroundColor: color } : {}),
    };
  });
  return { labels, datasets };
}

const AXIS_COLOR = '#cbd5e1';
const GRID_COLOR = 'rgba(148, 163, 184, 0.15)';

export function renderRatingChart(canvas, chartData) {
  return new Chart(canvas, {
    type: 'line',
    data: chartData,
    options: {
      responsive: true,
      scales: {
        x: { ticks: { color: AXIS_COLOR }, grid: { color: GRID_COLOR } },
        y: { ticks: { color: AXIS_COLOR }, grid: { color: GRID_COLOR } },
      },
      plugins: { legend: { labels: { color: AXIS_COLOR } } },
    },
  });
}
