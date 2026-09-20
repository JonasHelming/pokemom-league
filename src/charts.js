export function buildChartDatasets(history, ids, namesById, family) {
  const labels = history.map((snapshot) => snapshot.date);
  const datasets = ids.map((id) => ({
    label: namesById[id],
    data: history.map((snapshot) => (family === 'player' ? snapshot.playerRatings[id] : snapshot.deckRatings[id])),
  }));
  return { labels, datasets };
}

export function renderRatingChart(canvas, chartData) {
  return new Chart(canvas, {
    type: 'line',
    data: chartData,
    options: { responsive: true },
  });
}
