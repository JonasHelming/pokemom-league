export function buildChartDatasets(history, ids, namesById, family, colorFor = () => null) {
  const labels = history.map((snapshot) => snapshot.date);
  const datasets = ids.map((id) => {
    const color = colorFor(id);
    return {
      label: namesById[id],
      data: history.map((snapshot) => (family === 'player' ? snapshot.playerRatings[id] : snapshot.deckRatings[id])),
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
