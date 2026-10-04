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

// Maps every deck version id — retired ancestors included — to both ends of
// its lineage: `root`, the original id that type colors and other id-keyed
// tables are filed under, and `head`, the active version a rebuild's history
// should be folded into. Anything that has to survive a rebuild goes through
// here rather than using a match's raw deck id, which stops matching the
// active family the moment that deck is rebuilt.
export function buildDeckLineageIndex(decks) {
  const index = new Map();
  for (const lineage of buildDeckLineages(decks)) {
    for (const id of lineage.chain) index.set(id, { root: lineage.chain[0], head: lineage.id });
  }
  return index;
}

// Chart.js point style marking the match where a rebuilt deck took over
// from its predecessor — a diamond, visibly different from the round points
// of ordinary matches.
export const REBUILD_POINT_STYLE = 'rectRot';
const REBUILD_POINT_RADIUS = 7;
const NORMAL_POINT_RADIUS = 3;

// Merges a lineage's chain of deck-version ids into a single chart series:
// one continuous line using whichever version has actually been played so
// far, with the match where a new version takes over marked by a diamond
// and reached by a dashed segment.
//
// The rebuild match keeps its real rating. Blanking it out to draw the
// break instead would throw away the new version's first result, and a
// rebuild that happens to be the league's most recent match would end the
// series on a null — the line stopping dead short of the chart edge rather
// than showing where the rebuilt deck now sits.
//
// Returns the series alongside the indices where a rebuild took over, so
// the caller can style exactly those points.
function lineageSeries(history, chain) {
  let activeIndex = -1;
  const rebuildIndices = [];

  const data = history.map((snapshot, i) => {
    const counts = snapshot.deckMatchCounts || {};
    let latest = -1;
    for (let j = 0; j < chain.length; j++) {
      if ((counts[chain[j]] || 0) > 0) latest = j;
    }

    if (latest === -1) return null; // lineage hasn't started yet
    if (latest !== activeIndex) {
      if (activeIndex !== -1) rebuildIndices.push(i);
      activeIndex = latest;
    }

    return snapshot.deckRatings[chain[latest]];
  });

  return { data, rebuildIndices };
}

export function buildChartDatasets(history, ids, namesById, family, colorFor = () => null, decks = []) {
  const labels = history.map((snapshot) => snapshot.date);

  if (family === 'deck') {
    const datasets = buildDeckLineages(decks).map((lineage) => {
      // Colors are filed under the lineage root (the id that names the
      // type); a rebuild's minted id is absent from any color table, and a
      // dataset with no borderColor renders in Chart.js's near-transparent
      // default — an invisible line on this dark background.
      const color = colorFor(lineage.chain[0]);
      const { data, rebuildIndices } = lineageSeries(history, lineage.chain);
      const isRebuild = new Set(rebuildIndices);
      return {
        label: namesById[lineage.id] ?? lineage.name,
        data,
        spanGaps: false,
        pointStyle: data.map((_, i) => (isRebuild.has(i) ? REBUILD_POINT_STYLE : 'circle')),
        pointRadius: data.map((_, i) => (isRebuild.has(i) ? REBUILD_POINT_RADIUS : NORMAL_POINT_RADIUS)),
        // Dash only the segment arriving at the rebuild marker: the ratings
        // either side of it come from two different decks, so the line is
        // continuous but that one hop is explicitly not a like-for-like step.
        segment: { borderDash: (ctx) => (isRebuild.has(ctx.p1DataIndex) ? [6, 4] : undefined) },
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
